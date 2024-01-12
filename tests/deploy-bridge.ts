import {
    Constr,
    Data,
    Lucid,
    Script,
    applyDoubleCborEncoding,
} from 'lucid-cardano';
import { parseMOSEnv } from '../src/config.ts';

const mosEnv = parseMOSEnv();
const lucid = await Lucid.new(mosEnv.provider, mosEnv.network);
lucid.selectWalletFromPrivateKey(mosEnv.signingKey);

const spendScript: Script = {
    type: 'PlutusV2',
    script: '587c0100003232323232323232322223253330083253330093370e90000008a5114a0600e0022930b1900199299980419b874800000454ccc02cc028dd50018a4c2c2c600c0046600200290001111199980319b8700100300a233330050053370000890011806000801001118019baa0015734aae7555cf2ab9f5742ae89',
};

const alwaysTrue = '500100003222253330044a22930b2b9a01';

const spendAddress = lucid.utils.validatorToAddress(spendScript);

const alwaysTrueScript: Script = {
    type: 'PlutusV2',
    script: applyDoubleCborEncoding(alwaysTrue),
};

const scriptAddress = lucid.utils.validatorToAddress(alwaysTrueScript);
console.log('Script Address: ', scriptAddress);

const utxos = await lucid.utxosAt(
    'addr_test1wpdsmr0zyuvdh6uw8mus9ey7ccuty7t52n8vuutlyqf3yvsq4dxyh'
);
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
