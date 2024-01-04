import { parseMOSEnv } from '../src/config.ts';
import { processMarloweOutput } from '../src/tx.ts';

import { mkRestClient } from 'marlowe-runtime-rest-client-txpipe';
import { addressBech32 } from '@marlowe.io/runtime-core';
import { Contract } from '@marlowe.io/language-core-v1';
import { CreateContractRequest } from 'marlowe-runtime-rest-client-txpipe/dist/esm/contract/index';
import { Choice } from 'marlowe-language-core-v1-txpipe';

import { C, Lucid } from 'lucid-cardano';

import { Command } from 'commander';
import { readFileSync } from 'fs';

const mosEnv = parseMOSEnv();
const client = mkRestClient(mosEnv.marloweRuntimeUrl);
const lucid = await Lucid.new(mosEnv.provider, mosEnv.network);
lucid.selectWalletFromPrivateKey(mosEnv.signingKey);

let args = '';
const program = new Command();
program
    .showHelpAfterError()
    .description('Deploy an example contract')
    .argument(
    '<filepath>',
    'Complete choice for the contract',
        (fp) => {
            args = fp;
        }
    );

try {
    program.parse(process.argv);
} catch (error) {
    console.log(error);
}

const choice: Choice = fromFileChoice(args);

const changeAddress = addressBech32(await lucid.wallet.address());

function getTimeout(): bigint {
    const date = new Date();
    date.setMonth(date.getMonth() + 1);
    return BigInt(date.getTime());
}

const contractJson: Contract = {
    when: [
        {
            case: choice,
            then: {
                when: [{ case: { notify_if: true }, then: 'close' }],
                timeout: getTimeout(),
                timeout_continuation: 'close',
            },
        },
    ],
    timeout: getTimeout(),
    timeout_continuation: 'close',
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
    console.log('Tx hash: ' + finalTx.toHash());
} catch (error) {
    console.log(error);
    throw new Error('Submition failed');
}

function fromFileChoice(filepath: string): Choice {
    const fileContent = readFileSync(filepath, 'utf-8');
    const json = JSON.parse(fileContent);
    const parsedData = json as Choice;
    return parsedData;
}