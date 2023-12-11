import fetch from 'node-fetch';
import { RestClient } from 'marlowe-runtime-rest-client-txpipe';
import { ApplyInputsToContractRequest } from 'marlowe-runtime-rest-client-txpipe/dist/esm/contract/transaction/endpoints/collection';
import { Lucid } from 'lucid-cardano';
import axios, { AxiosError } from 'axios';
import { ContractId, TextEnvelope } from '@marlowe.io/runtime-core';

export async function signTx(signURL: string, cborHex: string) {
    try {
        const response = await fetch(signURL, {
            method: 'POST',
            body: JSON.stringify(cborHex),
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`Error! status: ${response.status}`);
        }

        const result = (await response.json()) as string;

        return result;
    } catch (error) {
        console.log('unexpected error: ', error);
        return 'An unexpected error occurred';
    }
}

export async function getTx(signTxUrl: string, client: RestClient, lucid: Lucid, applicableInputs: ApplyInputsToContractRequest[])
: Promise<string[]> {
    const txHashes: string[] = [];
    for (const input of applicableInputs) {
        try {
            const appliedInput = await client.applyInputsToContract(input);
            const signedCbor = await signTx(signTxUrl, appliedInput.tx.cborHex);
            const submitted = await lucid.provider.submitTx(signedCbor);
            txHashes.push(submitted);
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const e = error as AxiosError;
                console.error("Axios error occurred: " + e.response?.statusText.toString());
                console.error(e.response?.data);
            } else {
                console.error("Unexpected error occured", error)
            }
        }
    }
    return txHashes;
}