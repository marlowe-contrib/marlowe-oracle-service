# Marlowe Oracle Services

## Design

A complete design document can be found [here](./docs/design.md).

## Run the service

The MOS service requires specific environment variables and a configuration file to be set up prior to starting. The env-vars will contain secret/critical information that also doesn't change too often:

```shell
export MARLOWE_RUNTIME_URL='COMPLETE ME'
export NETWORK='Preprod'
export SIGNING_KEY='COMPLETE ME'
export MARLOWE_VALIDATOR_ADDRESS='COMPLETE ME'
export MARLOWE_VALIDATOR_UTXO_REF='COMPLETE ME'
```

Besides, we need to include the token or key corresponding to the provider we want to use. Currently, MOS supports Maestro and Blockfrost. We must include one (and only one) of the following environment variables:

```shell
export MAESTRO_APITOKEN='COMPLETE ME'
export BLOCKFROST_APIKEY='COMPLETE ME'
```

The other part of the configuration it's done in the [mos-config.json](./mos-config.json) file that must be given as argument:

```json
{
  "delay": 30000,
  "resolveMethod": {
    "address" :  {
      "mosAddress": {
        "address": "addr_test1vzuqvqzcnuy9pmrh2sy7tjucufmpwh8gzssz7v6scn0e04gxdvna9"
      },
      "choiceNames":[ "Coingecko ADAUSD" ]
      }
  }
}
```

We specify the waiting time of each iteration in milliseconds, the choice resolution method we want to have and finally the list of choice names we are resolving.

Use the following commands to install all the dependencies and then run the service:
```bash
    $ npm install
    $ npm run dev -- mos-config.json
```


## Deploy a contract

There is a utility that allows to submit a simple Marlowe contract that expects a Choice input and then closes.
To use it, we have to set up a few things:
First, we have to set up some things in the `test/deploy-example-contract.ts` file, that can be found like the following:
 ```typescript
// oracle service address
const choice_owner = "this should be the oracle services address";

// This is going to be the changeAddress for the request
const changeAddress: AddressBech32 = addressBech32("your_address");
```

