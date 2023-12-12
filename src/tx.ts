import fetch from 'node-fetch';
import { RestClient } from 'marlowe-runtime-rest-client-txpipe';
import { ApplyInputsToContractRequest } from 'marlowe-runtime-rest-client-txpipe/dist/esm/contract/transaction/endpoints/collection';
import { Lucid } from 'lucid-cardano';
import axios, { AxiosError } from 'axios';

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

export async function buildAndSubmit(
    signTxUrl: string,
    client: RestClient,
    lucid: Lucid,
    applicableInputs: ApplyInputsToContractRequest[]
): Promise<string> {
    if (applicableInputs.length > 0) {
        try {
            const appliedInput = await client.applyInputsToContract(
                applicableInputs[0]
                );
                const signedCbor = await signTx(signTxUrl, appliedInput.tx.cborHex);
                const txHash = await lucid.provider.submitTx(signedCbor);
                return txHash;
            } catch (error) {
                if (axios.isAxiosError(error)) {
                    const e = error as AxiosError;
                    console.error(
                        'Axios error occurred: ' + e.response?.statusText.toString()
                        );
                        console.error(e.response?.data);
                    } else {
                        console.error('Unexpected error occurred', error);
                    }
                    return 'Error occurred';
                }
    } else {
        return 'No inputs to apply';
    }
}
