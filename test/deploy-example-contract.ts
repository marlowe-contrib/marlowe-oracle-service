import { mkRestClient } from "@marlowe.io/runtime-rest-client";
import { AddressBech32, addressBech32, contractId } from "@marlowe.io/runtime-core";
import { Contract } from "@marlowe.io/language-core-v1";
import fetch from "node-fetch";

// let runtimeURL = process.env.MARLOWE_RUNTIME_URL;
let runtimeURL = "https://marlowe-runtime-preprod-web.scdev.aws.iohkdev.io";

const client = mkRestClient(runtimeURL);
const hasValidRuntime = await client.healthcheck();

if (!hasValidRuntime) throw new Error("Invalid Marlowe Runtime instance");

const address = "A";

const changeAddress: AddressBech32 = addressBech32(address);

const choice_name = "ADAUSD";

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
            "address": address
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

console.log("contractID: ",contract.contractId);
console.log("contractTX: ",contract.tx);

async function signTx() {
  try {
    const response = await fetch('http://localhost:3000/sign', {
      method: 'POST',
      body: JSON.stringify(contract.tx.cborHex),
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Error! status: ${response.status}`);
    }

    const result = (await response.json()) as string;

    return result;
  } catch (error) {
    console.log('unexpected error: ', error);
    return 'An unexpected error occurred';
  }
}

const signed = {
  cborHex: await signTx(),
  description: contract.tx.description,
  type: contract.tx.type
};

{
 try {
  const result = await client.submitContract(contract.contractId, signed);
  console.log(result);
} catch (error){
  console.log(error);
  throw new Error("Submition failed");
}
}