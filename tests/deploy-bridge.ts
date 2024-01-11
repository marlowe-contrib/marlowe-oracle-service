import { Data, Lucid, Script, applyDoubleCborEncoding } from "lucid-cardano";
import { parseMOSEnv } from "../src/config.ts";

const mosEnv = parseMOSEnv();
const lucid = await Lucid.new(mosEnv.provider, mosEnv.network);
lucid.selectWalletFromPrivateKey(mosEnv.signingKey);

const spendScript: Script = {
  type: "PlutusV2",
  script: "588a0100003232323232323232322223253330083371e6eb8cc014c01c0052000489055370656e6400149858c8010c94ccc020cdc3a400000226464a66601a601e0042930b1bae300d001300700416300837540066600200290001111199980319b8700100300a233330050053370000890011806000801001118021baa0015734aae7555cf2ab9f5742ae89"
};

const alwaysTrue = "500100003222253330044a22930b2b9a01";

const spendAddress = lucid.utils.validatorToAddress(spendScript);

const alwaysTrueScript: Script = {
  type: "PlutusV2",
  script: applyDoubleCborEncoding(alwaysTrue)
};

const tx = await lucid
  .newTx()
  .payToContract(spendAddress, { inline: Data.void(), scriptRef: alwaysTrueScript }, {})
  .complete();
const txSigned = await tx.sign().complete();
// console.log(txSigned.toString())
const txHash = await txSigned.submit();
console.log(`Transaction submitted. TxHash: ${txHash}`);

