import { Option, none, isSome, toUndefined } from "fp-ts/Option"
import { pipe } from 'fp-ts/function'

import { RestClient, mkRestClient } from "@marlowe.io/runtime-rest-client";
import { AddressBech32, ContractId, addressBech32, contractId } from "@marlowe.io/runtime-core";
import { Bound, ChoiceId, ChoiceName, Contract } from "@marlowe.io/language-core-v1";
import { ContractHeader, ContractsRange, GetContractsRequest } from "@marlowe.io/runtime-rest-client/dist/esm/contract";

export type OracleRequest = {
    contractId: ContractId;
    choiceId: ChoiceId;
    choiceBounds: Bound;
    validFrom: Date;
    validUntil: Date;
};

async function getAllContracts(client: RestClient, request: GetContractsRequest): Promise<ContractHeader[]> {
    let allResponses: ContractHeader[] = [];
    let cursor: Option<ContractsRange> = none;

    do {
        request.range = pipe(cursor, toUndefined)
        const response = await client.getContracts(request)
        allResponses.concat(response.headers)
        cursor = response.nextRange
    } while (isSome(cursor))

    return allResponses
}

export async function getActiveContracts(client: RestClient, address: AddressBech32, choices: [ChoiceName]): Promise<OracleRequest[]> {
    const contractsRequest: GetContractsRequest = {
        "partyAddresses": [address]
    };

    const allResponses = await getAllContracts(client, contractsRequest)

    const contractIds = allResponses.map( contract => {
        return contract.contractId
    })

    return []
}
