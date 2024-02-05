import {
    Address,
    AddressDetails,
    Constr,
    Data,
    Lucid,
    Script,
    applyDoubleCborEncoding,
    applyParamsToScript,
    fromText,
} from 'lucid-cardano';
import { parseMOSEnv } from '../src/config.ts';

import * as fs from 'fs';

const mosEnv = parseMOSEnv();
const lucid = await Lucid.new(mosEnv.provider, mosEnv.network);
lucid.selectWalletFromPrivateKey(mosEnv.signingKey);

const validators = JSON.parse(
    fs.readFileSync('./on-chain-bridge/plutus.json', 'utf-8')
).validators;

const charli3Compiled = validators[0].compiledCode;

const orcfaxCompiled = validators[1].compiledCode;

const marlowePayment = lucid.utils.paymentCredentialOf(
    mosEnv.marloweValidatorAddress
).hash;
const charli3Payment = lucid.utils.paymentCredentialOf(
    'addr_test1wzn5ee2qaqvly3hx7e0nk3vhm240n5muq3plhjcnvx9ppjgf62u6a'
).hash;

function mkAddress(payment: string): Data {
    return new Constr(0, [
        new Constr(0, [payment]),
        new Constr(0, []),
    ]);
}

const marloweAddress = mkAddress(marlowePayment)
const charli3Address = mkAddress(charli3Payment)

const charli3Policy =
    '1116903479e7320b8e4592207aaebf627898267fcd80e2d9646cbf07';
const charli3Name = '4f7261636c6546656564';
const charli3Choice = fromText('Charli3 Oracle');

const charli3Bridge: Script = {
    type: 'PlutusV2',
    script: applyParamsToScript(charli3Compiled, [
        marloweAddress,
        charli3Address,
        charli3Policy,
        charli3Name,
        charli3Choice,
    ]),
};

const charli3BridgeAddress = lucid.utils.validatorToAddress(charli3Bridge);
console.log('Script Address: ', charli3BridgeAddress);
console.log(charli3Bridge.script)

const BridgeDatumSchema = Data.Object({
    pkh: Data.Bytes(),
    token_name: Data.Bytes()
})
type BridgeDatum = Data.Static<typeof BridgeDatumSchema>;
const BridgeDatum = BridgeDatumSchema as unknown as BridgeDatum;

const datumPayment = lucid.utils.paymentCredentialOf(await lucid.wallet.address())

const bridgeDatum = {
    pkh: datumPayment.hash,
    token_name: fromText('Thread Token')
}
const datum = Data.to<BridgeDatum>(bridgeDatum, BridgeDatum)

// const tx = await lucid
//     .newTx()
//     .payToContract(
//         charli3BridgeAddress,
//         { inline: datum },
//         { lovelace: BigInt(1000000) }
//     )
//     .complete();
// const txSigned = await tx.sign().complete();
// const txHash = await txSigned.submit();
// console.log(`Transaction submitted. TxHash: ${txHash}`);
