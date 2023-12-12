import { parseMOSEnv } from '../src/config.ts';
import { signTx } from '../src/tx.ts';

import { mkRestClient } from 'marlowe-runtime-rest-client-txpipe';
import {
    AddressBech32,
    addressBech32,
    contractId,
} from '@marlowe.io/runtime-core';
import { Contract } from '@marlowe.io/language-core-v1';
import { CreateContractRequest } from 'marlowe-runtime-rest-client-txpipe/dist/esm/contract/index';

const mosEnv = parseMOSEnv();
const client = mkRestClient(mosEnv.marloweRuntimeUrl);

const choice_name = 'Coingecko ADAUSD';
const choice_owner = 'addr_test1vzuqvqzcnuy9pmrh2sy7tjucufmpwh8gzssz7v6scn0e04gxdvna9';
const changeAddress: AddressBech32 = addressBech32('addr_test1vzuqvqzcnuy9pmrh2sy7tjucufmpwh8gzssz7v6scn0e04gxdvna9');

function getTimeout(): bigint {
    const date = new Date();
    const timeout = new Date(
        date.getTime() + 60 * 60 * 1000
    );
    return BigInt(timeout.getTime());
}

const contractJson: Contract = {
    when: [
        {
            then: 'close',
            case: {
                for_choice: {
                    choice_owner: {
                        address: choice_owner,
                    },
                    choice_name: choice_name,
                },
                choose_between: [
                    {
                        to: 100000000n,
                        from: 100n,
                    },
                ],
            },
        },
    ],
    timeout_continuation: 'close',
    timeout: getTimeout(),
};

const request: CreateContractRequest = {
    changeAddress: changeAddress,
    contract: contractJson,
    minUTxODeposit: 2000000,
    version: 'v1',
};

const contract = await client.createContract(request);

if (!contract) throw new Error('Failed creating contract');

console.log('contractId: ', contract.contractId);
console.log('contractTx: ', contract.tx);

const signed = {
    cborHex: await signTx(mosEnv.signTxUrl, contract.tx.cborHex),
    description: contract.tx.description,
    type: contract.tx.type,
};

console.log('Signed contractTx: ', signed);

{
    try {
        const result = await client.submitContract(contract.contractId, signed);
        console.log(await result);
    } catch (error) {
        console.log(error);
        throw new Error('Submition failed');
    }
}
