import fetch from 'node-fetch';

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

const client = mkRestClient("https://marlowe-runtime-preprod-web.scdev.aws.iohkdev.io");
const hasValidRuntime = await client.healthcheck();
if (!hasValidRuntime) throw new Error("Invalid Marlowe Runtime instance");

// Maybe this main function could take a list of ApplyInputsToContractRequests ??
export async function applyInputs(client: RestClient, air: ApplyInputsToContractRequest)
: Promise<string> {
    const inputsApplied = await client.applyInputsToContract(air);
    const signed = {
        ...inputsApplied,
        tx: {
            ...inputsApplied.tx,
            cborHex: await signTx(inputsApplied.tx.cborHex)
        }
    };
    // const submit = client.submitContractTransaction(
    //     signed.contractId,
    //     signed.transactionId);

    return ""
}