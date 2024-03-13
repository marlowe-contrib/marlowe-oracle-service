import {
    Assets,
    Constr,
    Data,
    Lucid,
    Script,
    applyParamsToScript,
    fromText,
    toUnit,
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
const orcfaxPayment = lucid.utils.paymentCredentialOf(
    'addr_test1wrtcecfy7np3sduzn99ffuv8qx2sa8v977l0xql8ca7lgkgmktuc0'
).hash;

function mkAddress(payment: string): Data {
    return new Constr(0, [new Constr(1, [payment]), new Constr(1, [])]);
}

function mkOrcfaxTuple(cn1: string, cn2: string): Data {
    return new Array(fromText(cn1), fromText(cn2));
}

const marloweAddress = mkAddress(marlowePayment);
const charli3Address = mkAddress(charli3Payment);
const orcfaxAddress = mkAddress(orcfaxPayment);

const orcfaxPolicy = '104d51dd927761bf5d50d32e1ede4b2cff477d475fe32f4f780a4b21';
const orcfaxFeedName = fromText('ADA-USD|USD-ADA');
const orcfaxChoices = mkOrcfaxTuple('Orcfax ADAUSD', 'Orcfax USDADA');

const charli3Policy =
    '1116903479e7320b8e4592207aaebf627898267fcd80e2d9646cbf07';
const charli3Name = '4f7261636c6546656564';
const charli3Choice = fromText('Charli3 ADAUSD');

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

const orcfaxBridge: Script = {
    type: 'PlutusV2',
    script: applyParamsToScript(orcfaxCompiled, [
        marloweAddress,
        orcfaxAddress,
        orcfaxPolicy,
        orcfaxFeedName,
        orcfaxChoices,
    ]),
};

const charli3BridgeAddress = lucid.utils.validatorToAddress(charli3Bridge);
console.log('Charli3 Script Address: ', charli3BridgeAddress);
console.log(charli3Bridge.script);
console.log('');
console.log('');
const orcfaxBridgeAddress = lucid.utils.validatorToAddress(orcfaxBridge);
console.log('Orcfax Script Address: ', orcfaxBridgeAddress);
console.log(orcfaxBridge.script);

const BridgeDatumSchema = Data.Object({
    pkh: Data.Bytes(),
    token_name: Data.Bytes(),
});
type BridgeDatum = Data.Static<typeof BridgeDatumSchema>;
const BridgeDatum = BridgeDatumSchema as unknown as BridgeDatum;

const datumPayment = lucid.utils.paymentCredentialOf(
    await lucid.wallet.address()
);

const bridgeDatum = {
    pkh: datumPayment.hash,
    token_name: fromText('Thread Token'),
};
const datum = Data.to<BridgeDatum>(bridgeDatum, BridgeDatum);

const spendScript: Script = {
    type: 'PlutusV2',
    script: '587c0100003232323232323232322223253330083253330093370e90000008a5114a0600e0022930b1900199299980419b874800000454ccc02cc028dd50018a4c2c2c600c0046600200290001111199980319b8700100300a233330050053370000890011806000801001118019baa0015734aae7555cf2ab9f5742ae89',
};

const spendAddress = lucid.utils.validatorToAddress(spendScript);

const utxos = await lucid.utxosAt(spendAddress);
const redeemer = Data.to(new Constr(0, []));

const tx = await lucid
    .newTx()
    .collectFrom(utxos, redeemer)
    .payToContract(
        spendAddress,
        { inline: Data.void(), scriptRef: charli3Bridge },
        {}
    )
    .payToContract(
        spendAddress,
        { inline: Data.void(), scriptRef: orcfaxBridge },
        {}
    )
    .attachSpendingValidator(spendScript)
    .complete();
const txSigned = await tx.sign().complete();
const txHash = await txSigned.submit();
console.log(`Transaction submitted. TxHash: ${txHash}`);
