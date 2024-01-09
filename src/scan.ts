import { RestClient } from 'marlowe-runtime-rest-client-txpipe';
import { ContractId, unPolicyId } from '@marlowe.io/runtime-core';
import {
    Bound,
    ChoiceId,
    mkEnvironment,
    Next,
    Party,
    partyCmp,
} from 'marlowe-language-core-v1-txpipe';

import {
    ContractHeader,
    ContractsRange,
    GetContractsRequest,
} from 'marlowe-runtime-rest-client-txpipe/dist/esm/contract';
import { Option, isSome, none, some, toUndefined } from 'fp-ts/lib/Option.js';
import { pipe } from 'fp-ts/lib/function.js';
import { left, match } from 'fp-ts/lib/Either.js';
import { CanChoose } from '@marlowe.io/language-core-v1/dist/esm/next/applicables/canChoose';
import { scanLogger } from './logger.ts';

import axios, { AxiosError } from 'axios';
import { RequestError, ScanError, throwAxiosError } from './error.ts';
import { Lucid, UTxO } from 'lucid-cardano';
import { ResolveMethod } from './config.ts';

/**
 * The t type contains the necessary information to identify an
 * IChoice action that needs to be resolved.
 */
export type OracleRequest = {
    contractId: ContractId;
    choiceId: ChoiceId;
    choiceBounds: Bound[];
    invalidBefore: Date;
    invalidHereafter: Date;
    bridgeUtxo: Option<UTxO>;
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
            throwAxiosError(e);
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
    lucid: Lucid,
    methods: ResolveMethod<any>
): Promise<OracleRequest[]> {
    let tags: string[] = methods.address?.tags ?? [];
    tags = tags.concat(methods.charli3?.tags ?? []);

    const contractsRequest: GetContractsRequest = {
        tags: tags,
    };

    let allContractHeaders: ContractHeader[] = [];
    try {
        allContractHeaders = await getAllContracts(client, contractsRequest);
    } catch (e) {
        if (e instanceof RequestError) {
            if (e.name == '404') {
                throw new RequestError('404', e.message);
            } else {
                scanLogger.error(e.name, e.message, e.extra);
            }
        } else {
            throw new ScanError('UnknownError');
        }
    }

    const currentTime: Date = new Date();

    const timeBefore5Minutes: Date = new Date(
        currentTime.getTime() - 5 * 60 * 1000
    );

    const timeAfter5Minutes: Date = new Date(
        currentTime.getTime() + 5 * 60 * 1000
    );

    const addressResolvable: OracleRequest[] = [];
    const charli3ResolvableData: [CanChoose, ContractHeader][] = [];
    const charli3Resolvable: OracleRequest[] = [];

    for (const contract of allContractHeaders) {
        const nextSteps = await client.getNextStepsForContract(
            contract.contractId,
            mkEnvironment(timeBefore5Minutes)(timeAfter5Minutes),
            []
        )();

        match(
            (_) => left('Error on next query'),
            (value: Next) => {
                value.applicable_inputs.choices.forEach((choice) => {
                    if (
                        methods.address &&
                        isResolvable(
                            choice,
                            methods.address.mosAddress,
                            methods.address.choiceNames
                        )
                    ) {
                        const newRequest: OracleRequest = {
                            contractId: contract.contractId,
                            choiceId: choice.for_choice,
                            choiceBounds: choice.can_choose_between,
                            invalidBefore: timeBefore5Minutes,
                            invalidHereafter: timeAfter5Minutes,
                            bridgeUtxo: none,
                        };

                        addressResolvable.push(newRequest);
                    } else if (
                        methods.charli3 &&
                        isResolvable(
                            choice,
                            { role_token: methods.charli3.roleNames },
                            [methods.charli3.choiceNames]
                        )
                    ) {
                        charli3ResolvableData.push([choice, contract]);
                    }
                });
            }
        )(nextSteps);
    }

    if (methods.charli3 && charli3ResolvableData.length > 0) {
        const bridgeUtxos = await lucid.utxosAt(methods.charli3.bridgeAddress);

        for (const [choice, contract] of charli3ResolvableData) {
            const roleMintingPolicy = unPolicyId(
                contract.roleTokenMintingPolicyId
            );

            const assetClass =
                roleMintingPolicy +
                Buffer.from(methods.charli3.roleNames, 'utf-8').toString('hex');

            const utxo = bridgeUtxos.find(
                (utxo) => utxo.assets[assetClass] === 1n
            );

            if (utxo) {
                const newRequest: OracleRequest = {
                    contractId: contract.contractId,
                    choiceId: choice.for_choice,
                    choiceBounds: choice.can_choose_between,
                    invalidBefore: timeBefore5Minutes,
                    invalidHereafter: timeAfter5Minutes,
                    bridgeUtxo: some(utxo),
                };
                charli3Resolvable.push(newRequest);
            } else {
                scanLogger.debug(
                    'No Bridge UTxO found for contract:',
                    contract.contractId
                );
            }
        }
    }

    scanLogger.info(
        'AddressResolvable: ',
        addressResolvable.map((elem) => elem.contractId)
    );
    scanLogger.info(
        'Charli3Resolvable: ',
        charli3Resolvable.map((elem) => elem.contractId)
    );

    return addressResolvable.concat(charli3Resolvable);
}

/**
 * Given a choice, check if the choice can be resolved by a MOS instance with
 * the given configurations
 * @param choice The choice to check
 * @param party The party we want to use to resolve choices
 * @param validChoiceNames The choice names that the given party can resolve
 * @returns Wether or not the choice can be resolved
 */

function isResolvable(
    choice: CanChoose,
    party: Party,
    validChoiceNames: string[]
): Boolean {
    const choiceId = choice.for_choice;

    return (
        partyCmp(choiceId.choice_owner, party) === 'EqualTo' &&
        validChoiceNames.includes(choiceId.choice_name)
    );
}
