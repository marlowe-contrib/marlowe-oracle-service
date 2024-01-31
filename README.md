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

After configuring all the enviroment variables in the .env file, we must run `source .env` to export them.

The other part of the configuration it's done in the [mos-config.json](./mos-config.json) file that must be given as argument:

```json
{
  "delay": 30000,
  "tags": ["requires.marlowe.oracle.test.alpha.1"],
  "resolveMethod": {
    "address" :  {
      "mosAddress": {
        "address": "addr_test1vzuqvqzcnuy9pmrh2sy7tjucufmpwh8gzssz7v6scn0e04gxdvna9"
      },
      "choiceNames":[ "Coingecko ADAUSD" ]
      },
    "charli3" : {
      "choiceName": "Charli3 ADAUSD",
      "roleName": "Charli3 Oracle",
      "bridgeValidatorUtxo": {
        "txHash": "6d9ccb38415db7ac647d3b68098658f66dd392364a1ce42fede5a998187576b6",
        "outputIndex": 0
      },
      "bridgeAddress": "addr_test1wzg9jffqkv5luz8sayu5dmx5qhjfkayq090z0jmp3uqzmzq480snu",
      "feedAddress": "addr_test1wzn5ee2qaqvly3hx7e0nk3vhm240n5muq3plhjcnvx9ppjgf62u6a",
      "feedPolicyId": "1116903479e7320b8e4592207aaebf627898267fcd80e2d9646cbf07",
      "feedTokenName": "4f7261636c6546656564"
    },
    "orcfax" : {
      "choiceName": "Orcfax ADAUSD",
      "roleName": "Orcfax Oracle",
      "bridgeValidatorUtxo": {
        "txHash": "6d9ccb38415db7ac647d3b68098658f66dd392364a1ce42fede5a998187576b6",
        "outputIndex": 0
      },
      "bridgeAddress": "addr_test1wzg9jffqkv5luz8sayu5dmx5qhjfkayq090z0jmp3uqzmzq480snu",
      "feedAddress": "addr_test1wrtcecfy7np3sduzn99ffuv8qx2sa8v977l0xql8ca7lgkgmktuc0",
      "feedPolicyId": "104d51dd927761bf5d50d32e1ede4b2cff477d475fe32f4f780a4b21"
    }
  }
}
```

We specify the waiting time of each iteration in milliseconds, the marlowe tags to scan and the choice resolution method we want to have.

There are three different choice resolution methods supported: address, charli3 and orcfax. All of them are optional, so we can configure only the ones we want to support. For the address method, we need to specify the address we will be using and the list of choice names we are resolving. For the charli3 and orcfax methods, there's more configuration involved:

* choiceName: The choice name to resolve
* roleName: Name of the role token to use
* bridgeValidatorUtxo: TxHash and index of the utxo containing the script of the bridge validator
* bridgeAddress: The address of the bridge validator. Must match the address of the script contained in the bridgeValidatorUtxo
* feedAddress: The address where the oracle feed is contained
* feedPolicyId: The policyId of the token that identifies the feed utxo
* feedTokenName: The token name of the token that identifies the feed utxo (optional)

Use the following commands to install all the dependencies and then run the service:

```bash
    npm install
    npm run dev -- mos-config.json
```

## Deploy a contract

There is a utility that allows to submit a simple Marlowe contract that expects a Choice input, expects a notification and then closes.
To use it, we have to set up the environment variables, and either use one of the three existing config files [address-choice-info.json](./tests/address-choice-info.json), [charli3-choice-info.json](./tests/charli3-choice-info.json), [orcfax-choice-info.json](./tests/orcfax-choice-info.json) or create a new one. It contains the Choice that will be featured in the contract.
The choice owner should be the oracle service's address or the role name, and the choice name the desired source and currency pair. Here is an example of two possible configurations:

```json
  {
    "for_choice": {
        "choice_owner": {
            "address": "addr_test1vzuqvqzcnuy9pmrh2sy7tjucufmpwh8gzssz7v6scn0e04gxdvna9"
        },
        "choice_name": "Coingecko ADAUSD"
    },
    "choose_between": [
        { "from": 100, "to":100000000000}
    ]
  }
```

```json
  {
    "for_choice": {
        "choice_owner": {
            "role_token": "Charli3 Oracle"
        },
        "choice_name": "Charli3 ADAUSD"
    },
    "choose_between": [{ "from": 100, "to": 100000000000 }]
}
```

There's also an optional cli parameter to specify the marlowe tag to use. If not specified, it will use the default value of `requires.marlowe.oracle.test.alpha.1`.
The complete command to deploy a marlowe contract, requesting charli3 oracle data would be:

```bash
npm run deploy-example -- tests/charli3-choice-info.json requires.marlowe.oracle.test.alpha.2
```

## Bridge validators
The code for the on-chain validators can be found in the `on-chain-bridge` folder. To compile it or tests it we need to have Aiken installed. We recommend version `1.0.23`.
To compile the on-chain code:
```bash
$ aiken build
```
The compiled code will be found in the `plutus.json` file.

To run the tests:
```bash
$ aiken check
```

## Stats

<p align="center">
  <img src="https://repobeats.axiom.co/api/embed/50ff07bb288628e956db23e9899c5bd108134805.svg">
</p>

