import { RestClient } from 'marlowe-runtime-rest-client-txpipe';
import { ContractId, addressBech32 } from '@marlowe.io/runtime-core';
import {
    Address,
    Bound,
    ChoiceId,
    ChoiceName,
    mkEnvironment,
    Next,
    partyCmp,
} from 'marlowe-language-core-v1-txpipe';

import {
    ContractHeader,
    ContractsRange,
    GetContractsRequest,
} from 'marlowe-runtime-rest-client-txpipe/dist/esm/contract';
import { Option, isSome, none, toUndefined } from 'fp-ts/lib/Option.js';
import { pipe } from 'fp-ts/lib/function.js';
import { isRight, left, match, right } from 'fp-ts/lib/Either.js';
import { CanChoose } from '@marlowe.io/language-core-v1/dist/esm/next/applicables/canChoose';

import axios, { AxiosError } from 'axios';
import { RequestError, ScanError } from './error.ts';

/**
 * The OracleRequest type contains the necessary information to identify an
 * IChoice action that needs to be resolved.
 */
export type OracleRequest = {
    contractId: ContractId;
    choiceId: ChoiceId;
    choiceBounds: Bound[];
    invalidBefore: Date;
    invalidHereafter: Date;
};

/**
 * Get all marlowe contracts, going through all pages.
 *
 * @param client The Marlowe-ts rest client to make the neccesary queries
 * @param request The base request for the getContracts endpoint
 * @returns A list containing all pages of responses
 */
async function getAllContracts(
    client: RestClient,
    request: GetContractsRequest
): Promise<ContractHeader[]> {
    let allResponses: ContractHeader[] = [];
    let cursor: Option<ContractsRange> = none;

    try {
        do {
            request.range = pipe(cursor, toUndefined);
            const response = await client.getContracts(request);
            allResponses = allResponses.concat(response.headers);
            cursor = response.nextRange;
        } while (isSome(cursor));

    } catch (error) {
        if (axios.isAxiosError(error)) {
            const e = error as AxiosError;
            if (e.response) {
                const errorCode = e.response?.status;
                const errorName = e.response?.statusText;
                const errorMessage = e.response?.data;
                throw new RequestError(`${errorCode}`, errorName, errorMessage);
            }
        } else {
            throw new ScanError('UnknownError');
        }
    }

    return allResponses;
}

/**
 * Look for active marlowe contracts that can have an IChoice action resolved by
 * the MOS.
 * Returns only choices that have the oracle address as owner and whose choice
 * name is a valid choice name
 *
 * @param client The Marlowe-ts rest client to make the neccesary queries
 * @param mosAddress The address of the MOS
 * @param validChoiceNames Choice names that the MOS knows how to resolve
 * @returns a list of request for the MOS to resolve
 */
export async function getActiveContracts(
    client: RestClient,
    mosAddress: Address,
    validChoiceNames: ChoiceName[]
): Promise<OracleRequest[]> {
    const b32OracleAddr = addressBech32(mosAddress.address);

    const contractsRequest: GetContractsRequest = {
        partyAddresses: [b32OracleAddr],
    };

    let allResponses: ContractHeader[] = [];
    try {
        allResponses = await getAllContracts(client, contractsRequest);
    } catch (e) {
        if (e instanceof RequestError) {
            if (e.name = '404') {
                throw new ScanError('404', e.message);
            } else {
                console.log(e.name, e.message, e.extra);
            }
        } else {
            throw new ScanError('UnknownError');
        }
    }

    const currentTime: Date = new Date();
    const timeAfter5Minutes: Date = new Date(
        currentTime.getTime() + 5 * 60 * 1000
    );

    const promises = allResponses.map((contract) =>
        client
            .getNextStepsForContract(
                contract.contractId,
                mkEnvironment(currentTime)(timeAfter5Minutes),
                []
            )()
            .then((nextAction) =>
                pipe(
                    nextAction,
                    match(
                        (_) => left('Error on next query'),
                        (value: Next) => {
                            const choices =
                                value.applicable_inputs.choices.filter(
                                    (elem: CanChoose) =>
                                        validChoiceNames.includes(
                                            elem.for_choice.choice_name
                                        ) &&
                                        partyCmp(
                                            elem.for_choice.choice_owner,
                                            mosAddress
                                        ) === 'EqualTo'
                                );
                            return !choices?.length
                                ? left('Empty choices')
                                : right({
                                      contractId: contract.contractId,
                                      choiceId: choices[0].for_choice,
                                      choiceBounds:
                                          choices[0].can_choose_between,
                                      invalidBefore: currentTime,
                                      invalidHereafter: timeAfter5Minutes,
                                  });
                        }
                    )
                )
            )
    );

    const allNextAction = await Promise.all(promises);

    return allNextAction.filter(isRight).map((elem) => elem.right);
}
