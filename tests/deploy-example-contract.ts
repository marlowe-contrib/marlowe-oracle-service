import { parseMOSEnv } from '../src/config.ts';

import { mkRestClient } from 'marlowe-runtime-rest-client-txpipe';
import { AddressBech32, addressBech32 } from '@marlowe.io/runtime-core';
import { Contract } from '@marlowe.io/language-core-v1';
import { CreateContractRequest } from 'marlowe-runtime-rest-client-txpipe/dist/esm/contract/index';
import { C, Lucid } from 'lucid-cardano';
import { processMarloweOutput } from '../src/tx.ts';

const mosEnv = parseMOSEnv();
const client = mkRestClient(mosEnv.marloweRuntimeUrl);
const lucid = await Lucid.new(mosEnv.provider, mosEnv.network);
lucid.selectWalletFromPrivateKey(mosEnv.signingKey);

const choice_name = 'Coingecko ADAUSD';
const choice_owner = 'COMPLETE ME';
const changeAddress: AddressBech32 = addressBech32('COMPLETE ME');

function getTimeout(): bigint {
    const date = new Date();
    date.setMonth(date.getMonth() + 1);
    return BigInt(date.getTime());
}

const contractJson: Contract = {
    when: [
        {
            then: {
                when: [
                    {
                        then: {
                            when: [
                                { then: 'close', case: { notify_if: true } },
                            ],
                            timeout_continuation: 'close',
                            timeout: getTimeout(),
                        },
                        case: {
                            for_choice: {
                                choice_owner: { address: choice_owner },
                                choice_name: 'Coingecko USDADA',
                            },
                            choose_between: [{ to: 100000000000n, from: 100n }],
                        },
                    },
                ],
                timeout_continuation: 'close',
                timeout: getTimeout(),
            },
            case: {
                for_choice: {
                    choice_owner: { address: choice_owner },
                    choice_name: choice_name,
                },
                choose_between: [{ to: 100000000000n, from: 100n }],
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

const txCbor = contract.tx.cborHex;
const transaction = C.Transaction.from_bytes(Buffer.from(txCbor, 'hex'));

try {
    const tx = processMarloweOutput(
        transaction,
        lucid,
        mosEnv.marloweValidatorAddress
    );
    const balancedTx = await tx.complete();
    const signedTx = balancedTx.sign();
    const finalTx = await signedTx.complete();

    const signed = {
        cborHex: finalTx.toString(),
        description: contract.tx.description,
        type: contract.tx.type,
    };

    console.log('Signed contractTx: ', signed);

    await client.submitContract(contract.contractId, signed);
    console.log('Submitted');
} catch (error) {
    console.log(error);
    throw new Error('Submition failed');
}
