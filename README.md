# Marlowe Oracle Services

## Design

A complete design document can be found [here](./docs/design.md).

## Run the service

We provide 3 ways to run the Marlowe Oracle Service:

1. [Run the MOS locally](#run-the-mos-locally), with an existing instance of the Marlowe Apply Service
2. [Run the MOS with Docker](#run-only-the-mos-with-docker), with an existing instance of the Marlowe Apply Service
3. [Run the MOS and the Marlowe Apply Service](#run-the-mos-along-with-the-marlowe-apply-service) together with Docker compose

### Run the MOS locally

The MOS service requires specific environment variables and a configuration file to be set up prior to starting. [Here](https://www.youtube.com/watch?v=vHNLUrgpkik) you can find a useful video of the complete configuration and execution of the service. The env-vars will contain secret/critical information that also doesn't change too often:

```shell
export MARLOWE_RUNTIME_URL='COMPLETE ME'
export NETWORK='Preprod'
export SIGNING_KEY='COMPLETE ME'
export MARLOWE_VALIDATOR_ADDRESS='COMPLETE ME'
export MARLOWE_VALIDATOR_UTXO_REF='COMPLETE ME'
export APPLY_URL='COMPLETE ME'
```

For preprod, we provide a file [.preprod.env](.preprod.env) with some of these environment variables already set up. The missing variables are the signing key, which is specific for your address, and the MAS url. For information on how to run the MAS, you can check out the [github](https://github.com/marlowe-contrib/marlowe-apply-service).

Besides, we need to include the token or key corresponding to the provider we want to use. Currently, MOS supports Maestro and Blockfrost. We must include one (and only one) of the following environment variables:

```shell
export MAESTRO_APITOKEN='COMPLETE ME'
export BLOCKFROST_APIKEY='COMPLETE ME'
```

You can get your own token from the providers' websites[^1][^2].

After configuring all the enviroment variables in the .env file, we must run `source .preprod.env` to export them. Each time any of these variables are changed, we must run `source .preprod.env` again.

The other part of the configuration it's done in the [mos-config.json](./mos-config.json) file that must be given as argument:

```json
{
    "delay": 30000,
    "tags": ["requires.marlowe.oracle.test.alpha.1"],
    "resolveMethod": {
        "address": {
            "mosAddress": {
                "address": "addr_test1vzuqvqzcnuy9pmrh2sy7tjucufmpwh8gzssz7v6scn0e04gxdvna9"
            },
            "choiceNames": ["Coingecko ADAUSD"]
        },
        "charli3": {
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
        "orcfax": {
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

There are three different choice resolution methods supported: address, charli3 and orcfax. All of them are optional, so we can configure only the ones we want to support. For the address method, we need to specify the address we will be using and the list of choice names we are resolving. The address is the owner of the Choice that asks for an oracle value.

For the charli3 and orcfax methods, there's more configuration involved:

-   choiceName: The choice name to resolve
-   roleName: Name of the role token to use
-   bridgeValidatorUtxo: TxHash and index of the utxo containing the script of the bridge validator
-   bridgeAddress: The address of the bridge validator. Must match the address of the script contained in the bridgeValidatorUtxo
-   feedAddress: The address where the oracle feed is contained
-   feedPolicyId: The policyId of the token that identifies the feed utxo
-   feedTokenName: The token name of the token that identifies the feed utxo (optional)

Use the following commands to install all the dependencies and then run the service:

```bash
    npm install
    npm run dev -- mos-config.json
```

## Run only the MOS with Docker

The MOS can be run with Docker too. To do it, we need to set up the environment variables in the [.docker.env](.docker.env) file. The values should be the same as the other .env file, but in this case it must not have the `export` keyword, or any quotes surrounding the values.
After setting those values, we can build and run the container:

```bash
$ docker build -t mos .
$ docker run --env-file .docker.env mos
```

### Run the MOS along with the Marlowe Apply Service.

To run the Marlowe Oracle Service along with an instance of the Marlowe Apply Service, we provide a [docker-compose](docker-compose.yaml) file. First we need to have the Marlowe Apply Service [repository](https://github.com/marlowe-contrib/marlowe-apply-service) cloned at the root of this project. We'll also need the same .`docker.env` file as in the previous section but the variable `APPLY_URL` will have the value: `http://mas:3000/apply`.
Then, we can build and run both services with:

```bash
$ docker compose up
```

This command might take a while the first time you execute it.

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
    "choose_between": [{ "from": 100, "to": 100000000000 }]
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

## Using the deploy bridge utility.

We provide a utility to easily deploy new reference scripts for the bridge validators. To use it follow these [instructions](./docs/how-to-use-deploy-bridge.md).

## Stats

<p align="center">
  <img src="https://repobeats.axiom.co/api/embed/50ff07bb288628e956db23e9899c5bd108134805.svg">
</p>

[^1]: <https://blockfrost.io/>
[^2]: <https://www.gomaestro.org/>
