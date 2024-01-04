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
export APPLY_URL='COMPLETE ME'

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

There is a utility that allows to submit a simple Marlowe contract that expects a Choice input, expects a notification and then closes.
To use it, we have to set up the environment variables, and configure the file [choice-info.json](./tests/choice-info.json) that can be found in the `tests` folder. It contains the Choice that will be featured in the contract.
The choice owner should be the oracle service's address, and the choice name the desired source and currency pair. Here is an example of a possible configuration:
```json
  {
    "for_choice": {
        "choice_owner": {
            "address": "addr_test1vzuqvqzcnuy9pmrh2sy7tjucufmpwh8gzssz7v6scn0e04gxdvna9"
        },
        "choice_name": "Coingecko ADAUSD"
    },
    "choose_between": [
        { "from": 100, "to":10000000}
    ]
  }
```

