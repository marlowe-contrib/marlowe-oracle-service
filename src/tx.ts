import fetch from 'node-fetch';
import { RestClient } from 'marlowe-runtime-rest-client-txpipe';
import { ApplyInputsToContractRequest } from 'marlowe-runtime-rest-client-txpipe/dist/esm/contract/transaction/endpoints/collection';
import { Lucid } from 'lucid-cardano';
import axios, { AxiosError } from 'axios';

/**
 * Send an unsigned transaction to the signing service.
 *
 * @param signURL Url of the signing service
 * @param cborHex Unsigned transaction in CBOR format
 * @returns Signed transaction
 */
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

/**
 * Build the transactions that apply inputs to each contract, sign them
 * and submit them.
 *
 * @param signTxUrl Url of the transaction signing service
 * @param client Marlowe Rest client
 * @param lucid Instance of Lucid initiated with a provider
 * @param applicableInputs Array of requests to apply inputs to the respective contracts
 * @returns A list of the txHashes of the succesfully submitted transactions
 */
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