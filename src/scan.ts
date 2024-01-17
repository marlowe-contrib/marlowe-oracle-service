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
import { Lucid, UTxO, fromText, toUnit } from 'lucid-cardano';
import { OracleConfig, ResolveMethod } from './config.ts';

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
    methods: ResolveMethod<any>,
    tags: string[]
): Promise<OracleRequest[]> {
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
    let charli3Resolvable: OracleRequest[] = [];
    const orcfaxResolvableData: [CanChoose, ContractHeader][] = [];
    let orcfaxResolvable: OracleRequest[] = [];

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
                    } else if (
                        methods.orcfax &&
                        isResolvable(
                            choice,
                            { role_token: methods.orcfax.roleNames },
                            [methods.orcfax.choiceNames]
                        )
                    ) {
                        orcfaxResolvableData.push([choice, contract]);
                    }
                });
            }
        )(nextSteps);
    }

    if (methods.charli3 && charli3ResolvableData.length > 0) {
        charli3Resolvable = await makeOracleRequests(
            methods.charli3,
            charli3ResolvableData,
            lucid
        );
    }

    if (methods.orcfax && orcfaxResolvableData.length > 0) {
        orcfaxResolvable = await makeOracleRequests(
            methods.orcfax,
            orcfaxResolvableData,
            lucid
        );
    }

    scanLogger.info(
        'AddressResolvable: ',
        addressResolvable.map((elem) => elem.contractId)
    );
    scanLogger.info(
        'Charli3Resolvable: ',
        charli3Resolvable.map((elem) => elem.contractId)
    );
    scanLogger.info(
        'OrcfaxResolvable: ',
        orcfaxResolvable.map((elem) => elem.contractId)
    );

    return addressResolvable.concat(charli3Resolvable).concat(orcfaxResolvable);
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

/**
 * Given a list of possible contracts to resolve, check if the correct role
 * token is present in the bridge address for each. Creates an Oracle Request
 * for each valid contract.
 * @param oracle OracleConfig to use
 * @param resolvableData Contracts that request Input for this oracle
 * @param lucid Lucid instance
 * @returns a list of resolvable Oracle Requests
 */
async function makeOracleRequests(
    oracle: OracleConfig<UTxO>,
    resolvableData: [CanChoose, ContractHeader][],
    lucid: Lucid
): Promise<OracleRequest[]> {
    const oracleResolvable: OracleRequest[] = [];
    const bridgeUtxos = await lucid.utxosAt(oracle.bridgeAddress);

    const currentTime: Date = new Date();

    const timeBefore5Minutes: Date = new Date(
        currentTime.getTime() - 5 * 60 * 1000
    );

    const timeAfter5Minutes: Date = new Date(
        currentTime.getTime() + 5 * 60 * 1000
    );

    for (const [choice, contract] of resolvableData) {
        const roleMintingPolicy = unPolicyId(contract.roleTokenMintingPolicyId);

        const assetClass = toUnit(
            roleMintingPolicy,
            fromText(oracle.roleNames)
        );

        const utxo = bridgeUtxos.find((utxo) => utxo.assets[assetClass] === 1n);

        if (utxo) {
            const newRequest: OracleRequest = {
                contractId: contract.contractId,
                choiceId: choice.for_choice,
                choiceBounds: choice.can_choose_between,
                invalidBefore: timeBefore5Minutes,
                invalidHereafter: timeAfter5Minutes,
                bridgeUtxo: some(utxo),
            };
            oracleResolvable.push(newRequest);
        } else {
            scanLogger.debug(
                'No Bridge UTxO found for contract:',
                contract.contractId
            );
        }
    }
    return oracleResolvable;
}
