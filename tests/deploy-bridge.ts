import {
    Constr,
    Data,
    Lucid,
    Script,
    applyDoubleCborEncoding,
} from 'lucid-cardano';
import { parseMOSEnv } from '../src/config.ts';

import * as fs from 'fs';

const mosEnv = parseMOSEnv();
const lucid = await Lucid.new(mosEnv.provider, mosEnv.network);
lucid.selectWalletFromPrivateKey(mosEnv.signingKey);

const validators = JSON.parse(fs.readFileSync('./tests/validators/plutus.json', 'utf-8')).validators;

const alwaysTrue = validators[0].compiledCode;

const spendScript: Script = {
    type: 'PlutusV2',
    script: validators[1].compiledCode,
};

const spendAddress = lucid.utils.validatorToAddress(spendScript);

const alwaysTrueScript: Script = {
    type: 'PlutusV2',
    script: applyDoubleCborEncoding(alwaysTrue),
};

const scriptAddress = lucid.utils.validatorToAddress(alwaysTrueScript);
console.log('Script Address: ', scriptAddress);

const utxos = await lucid.utxosAt(spendAddress);
const redeemer = Data.to(new Constr(0, []));

const tx = await lucid
    .newTx()
    .collectFrom(utxos, redeemer)
    .payToContract(
        spendAddress,
        { inline: Data.void(), scriptRef: alwaysTrueScript },
        {}
    )
    .attachSpendingValidator(spendScript)
    .complete();
const txSigned = await tx.sign().complete();
const txHash = await txSigned.submit();
console.log(`Transaction submitted. TxHash: ${txHash}`);
