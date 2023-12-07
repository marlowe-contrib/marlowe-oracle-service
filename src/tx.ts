import fetch from 'node-fetch';
import { RestClient } from 'marlowe-runtime-rest-client-txpipe';
import { ApplyInputsToContractRequest } from 'marlowe-runtime-rest-client-txpipe/dist/esm/contract/transaction/endpoints/collection';
import { Lucid } from 'lucid-cardano';

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
: Promise<string> {
    const inputsApplied = await client.applyInputsToContract(applicableInputs[0]);
    console.log(applicableInputs[0].contractId)
    console.log("unsigned cbor", inputsApplied.tx.cborHex)
    const signedCbor = await signTx(signTxUrl, inputsApplied.tx.cborHex);

    const submit = await lucid.provider.submitTx(signedCbor);

    return submit;
}