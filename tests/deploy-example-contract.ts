import { parseMOSEnv } from '../src/config.ts';
import { processMarloweOutput } from '../src/tx.ts';

import { mkRestClient } from 'marlowe-runtime-rest-client-txpipe';
import { Tags, addressBech32 } from '@marlowe.io/runtime-core';
import { Contract } from '@marlowe.io/language-core-v1';
import {
    CreateContractRequest,
    RolesConfig,
} from 'marlowe-runtime-rest-client-txpipe/dist/esm/contract/index';
import { Choice } from 'marlowe-language-core-v1-txpipe';

import { C, Data, Lucid, Script, Tx, toHex } from 'lucid-cardano';

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
    .argument('<filepath>', 'Complete choice for the contract', (fp) => {
        args = fp;
    });

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

const choiceOwnerIsRole = 'role_token' in choice.for_choice.choice_owner;

const tags: Tags = { 'requires.marlowe.oracle.test': '' };

/* Addresses here doesn't really matter, because we will be ignoring the
outputs generated by the create endpoint, but we want it to generate the mintng
policy so we might as well put reasonable values here.
*/
const roles: RolesConfig | undefined = choiceOwnerIsRole
    ? {
          'Charli3 Oracle': changeAddress,
          'Thread Token': addressBech32(mosEnv.marloweValidatorAddress),
      }
    : undefined;

const request: CreateContractRequest = {
    changeAddress: changeAddress,
    contract: contractJson,
    minUTxODeposit: 2000000,
    version: 'v1',
    tags: tags,
    roles: roles,
};

const contract = await client.createContract(request);

if (!contract) throw new Error('Failed creating contract');

console.log('contractId: ', contract.contractId);
console.log('contractTx: ', contract.tx);

const txCbor = contract.tx.cborHex;
const transaction = C.Transaction.from_bytes(Buffer.from(txCbor, 'hex'));

try {
    let res = processMarloweOutput(transaction, mosEnv.marloweValidatorAddress);
    if (!res) throw new Error('Error parsing marlowe output');

    let [data, assets] = res;

    const newTx = new Tx(lucid);

    if (choiceOwnerIsRole) {
        const minted = transaction.body().mint()?.as_positive_multiasset();

        if (!minted || minted?.len() > 1)
            throw new Error('Minting more or less than 1 policy');

        const oracleTokenPolicy = minted.keys().get(0).to_hex();
        const oracleTokenAsset =
            oracleTokenPolicy +
            Buffer.from('Charli3 Oracle', 'utf-8').toString('hex');
        const threadTokenAsset =
            oracleTokenPolicy +
            Buffer.from('Thread Token', 'utf-8').toString('hex');

        newTx.mintAssets(
            { [oracleTokenAsset]: 1n, [threadTokenAsset]: 1n },
            Data.void()
        );

        assets[threadTokenAsset] = 1n;

        const scripts = transaction.witness_set().plutus_v2_scripts();

        if (!scripts) throw new Error('No scripts in tx');

        let mintingPolicy: Script | undefined = undefined;
        for (let i = 0; i < scripts?.len(); i++) {
            const script = scripts.get(i);
            if (
                script.hash(C.ScriptHashNamespace.PlutusV2).to_hex() ===
                oracleTokenPolicy
            ) {
                mintingPolicy = {
                    type: 'PlutusV2',
                    script: toHex(script.to_bytes()),
                };
            }
        }

        if (!mintingPolicy) throw new Error('No matching minting policy found');

        newTx.attachMintingPolicy(mintingPolicy);
    }

    newTx.payToAddressWithData(mosEnv.marloweValidatorAddress, data, assets);
    newTx.attachMetadata(1564, [2, [['requires.marlowe.oracle', '']]]);

    const balancedTx = await newTx.complete();
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
