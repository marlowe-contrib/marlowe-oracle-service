import {
    Constr,
    Data,
    Lucid,
    Script,
    applyParamsToScript,
    fromText
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

const ownPH = lucid.utils.paymentCredentialOf(
    await lucid.wallet.address()
).hash;

const checkSignatureCompiled =
    '586f010000323232323232232222533300732323300100100222533300c00114a026464a66601866e3c00802452889980200200098078011bae300d0013758601460166016601660166016601660166016600c6014600c00229309b2b1bae001230033754002ae6955cf2ab9f5742ae881';

const checkSignatureScript: Script = {
    type: 'PlutusV2',
    script: applyParamsToScript(checkSignatureCompiled, [ownPH]),
};

const checkSignatureAddress =
    lucid.utils.validatorToAddress(checkSignatureScript);

const utxos = await lucid.utxosAt(checkSignatureAddress);
const redeemer = Data.void();

const newTx = lucid.newTx();

if (utxos.length > 0) {
    newTx
        .collectFrom(utxos, redeemer)
        .attachSpendingValidator(checkSignatureScript)
        .addSignerKey(ownPH);
}

newTx
    .payToContract(
        checkSignatureAddress,
        { inline: Data.void(), scriptRef: charli3Bridge },
        {}
    )
    .payToContract(
        checkSignatureAddress,
        { inline: Data.void(), scriptRef: orcfaxBridge },
        {}
    );

const tx = await newTx.complete();
const txSigned = await tx.sign().complete();
const txHash = await txSigned.submit();
console.log(`Transaction submitted. TxHash: ${txHash}`);
