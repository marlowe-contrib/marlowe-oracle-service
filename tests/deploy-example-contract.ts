import { parseMOSEnv } from "../src/config.ts"
import { signTx } from "../src/tx.ts"

import { mkRestClient } from "marlowe-runtime-rest-client-txpipe";
import { AddressBech32, addressBech32, contractId } from "@marlowe.io/runtime-core";
import { Contract } from "@marlowe.io/language-core-v1";

const mosEnv = parseMOSEnv();

const client = mkRestClient(mosEnv.marlowe_runtime_url);
const hasValidRuntime = await client.healthcheck();

if (!hasValidRuntime) throw new Error("Invalid Marlowe Runtime instance");

// CHANGE HERE !!
const choice_owner = "this should be the oracle services address";

const choice_name = "ADAUSD";

// CHANGE HERE !!
const changeAddress: AddressBech32 = addressBech32("your_address");

function getTimeout(): bigint {
  const date = new Date();
  date.setDate(date.getMonth() + 1);
  return BigInt(date.getTime());
}

const contractJson: Contract = {
  "when": [
    {
      "then": "close",
      "case": {
        "for_choice": {
          "choice_owner": {
            "address": choice_owner
          },
          "choice_name": choice_name
        },
        "choose_between": [
          {
            "to": 100000n,
            "from": 0n
          }
        ]
      }
    }
  ],
  "timeout_continuation": "close",
  "timeout": getTimeout()
};

// ver tipo: CreateContractRequest
const request = {
  "changeAddress": changeAddress,
  "contract": contractJson,
  "minUTxODeposit": 2000000,
  "version": "v1"
};

const contract = await client.createContract(request);

if (!contract) throw new Error("Failed creating contract")

console.log("contractId: ", contract.contractId);
console.log("contractTx: ", contract.tx);

const signed = {
  cborHex: await signTx(contract.tx.cborHex),
  description: contract.tx.description,
  type: contract.tx.type
};

console.log("Signed contractTx: ", signed);

{
 try {
  const result = await client.submitContract(contract.contractId, signed);
  console.log(result);
} catch (error){
  console.log(error);
  throw new Error("Submition failed");
}
}
