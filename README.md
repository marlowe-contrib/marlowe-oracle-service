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

We can find a working Marlowe Runtime instance at https://marlowe-runtime-preprod-web.scdev.aws.iohkdev.io[^3]. The Marlowe script address is `addr_test1wrv9l2du900ajl27hk79u07xda68vgfugrppkua5zftlp8g0l9djk` for Preprod and the UTxO ref of the validator is `c59678b6892ba0fbeeaaec22d4cbde17026ff614ed47cea02c47752e5853ebc8#1`[^4]. The address can be found on a network explorer like Cexplorer[^5] or obtained using the validator and a utility like Lucid's validatorToAddress function[^6].
You can also find a running instance of the Apply Service here: https://3000-magnetic-gladness-fw5d6k.us1.demeter.run/apply.

Besides, we need to include the token or key corresponding to the provider we want to use. Currently, MOS supports Maestro and Blockfrost. We must include one (and only one) of the following environment variables:

```shell
export MAESTRO_APITOKEN='COMPLETE ME'
export BLOCKFROST_APIKEY='COMPLETE ME'
```

You can get your own token from the providers' websites[^1][^2].

After configuring all the enviroment variables in the .env file, we must run `source .env` to export them.

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

There are three different choice resolution methods supported: address, charli3 and orcfax. All of them are optional, so we can configure only the ones we want to support. For the address method, we need to specify the address we will be using and the list of choice names we are resolving. For the charli3 and orcfax methods, there's more configuration involved:

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

We provide a utility to easily deploy new reference scripts for the bridge validators. To use it follow these instructions:

### Reading the compiled code and applying the parameters.

When we run aiken build a file called [plutus.json](./on-chain-bridge/plutus.json) gets modified (or created if it didn’t exist previously). In this file we can find the compiled code for the validators, and information about its parameters among other things. This information can be useful when applying the parameters because we will need to make sure that the types match.

In the [deploy-bridge.ts](./tests/deploy-bridge.ts) file, let’s begin by defining a new variable called orcfaxCompiled which holds the compiled code obtained from the `plutus.json` file. This is easy since there's a function already that parses that file and returns the array of validators. We just have to check the index of the oracle. In this case it’s at 1.
[const orcfaxCompiled = validators[1].compiledCode;](https://github.com/marlowe-contrib/marlowe-oracle-service/blob/9970c85e43b4e771a232a16db11a69d4e1975377/tests/deploy-bridge.ts#L25C1-L25C51)

Now, let’s define the parameters. For this it will be useful to have the `plutus.json` file on hand, to check how each parameter has to be built.
First we have the Marlowe contract address which is already defined. Next, we have Orcfax’s address. Using the address found on the documentation for Orcfax, we extract the payment credential hash, and pass that to build the Address type that Aiken uses, using the utility function `mkAddress`.
https://github.com/marlowe-contrib/marlowe-oracle-service/blob/9970c85e43b4e771a232a16db11a69d4e1975377/tests/deploy-bridge.ts#L33-L35
[const orcfaxAddress = mkAddress(orcfaxPayment);](https://github.com/marlowe-contrib/marlowe-oracle-service/blob/9970c85e43b4e771a232a16db11a69d4e1975377/tests/deploy-bridge.ts#L47)

The next parameters are the policyId and the Orcfax feed name, which are simply ByteArrays so we just pass them as strings:
https://github.com/marlowe-contrib/marlowe-oracle-service/blob/9970c85e43b4e771a232a16db11a69d4e1975377/tests/deploy-bridge.ts#L49-L50
We use fromText to hex encode the text.

The last parameter is the choice names, in this case it’s a tuple, so we’ll use another utility function:
https://github.com/marlowe-contrib/marlowe-oracle-service/blob/9970c85e43b4e771a232a16db11a69d4e1975377/tests/deploy-bridge.ts#L41-L43
[const orcfaxChoices = mkOrcfaxTuple('Orcfax ADAUSD', 'OrcfaxUSDADA');](https://github.com/marlowe-contrib/marlowe-oracle-service/blob/9970c85e43b4e771a232a16db11a69d4e1975377/tests/deploy-bridge.ts#L51)

Now that we finished defining the parameters, we can finally apply them to the compiled code. We’ll use a Lucid utility for this:
https://github.com/marlowe-contrib/marlowe-oracle-service/blob/9970c85e43b4e771a232a16db11a69d4e1975377/tests/deploy-bridge.ts#L69-L78
Here, we define a new variable for the script, it includes its type and the script itself as a string. We use the `applyParamsToScript` function that takes the compiled code, and the parameters in a list. We have to make sure that the parameters are ordered exactly like they appear in the on-chain code.

Once the parameters were correctly applied we can obtain the validator’s address.
[const orcfaxBridgeAddress = lucid.utils.validatorToAddress(orcfaxBridge);](https://github.com/marlowe-contrib/marlowe-oracle-service/blob/9970c85e43b4e771a232a16db11a69d4e1975377/tests/deploy-bridge.ts#L85C1-L85C74)
This address will be used in the `mos-config.json` as the `bridgeAddress` for the respective oracle, since this address will be the recipient of the role tokens.

### Deploying the validator as a reference script.

The last step is to actually deploy the validator to the blockchain as a reference script. For this, let’s just simply modify the transaction to add another payment that will hold our new validator:
https://github.com/marlowe-contrib/marlowe-oracle-service/blob/9970c85e43b4e771a232a16db11a69d4e1975377/tests/deploy-bridge.ts#L116-L130
The rest of the code will remain the same.

To run this script we can do

```bash
npm run deploy-bridge
```

Once it finishes running we will see printed on the screen the transaction hash of this last transaction. This hash will also be used in the `mos-config.json`, as the `bridgeValidatorUtxo`. If there are more than one validators being deployed be mindful of the respective indexes.

## Stats

<p align="center">
  <img src="https://repobeats.axiom.co/api/embed/50ff07bb288628e956db23e9899c5bd108134805.svg">
</p>

[^1]: <https://blockfrost.io/>
[^2]: <https://www.gomaestro.org/>
[^3]: <https://docs.marlowe.iohk.io/api/get-contracts>
[^4]: <https://preprod.cexplorer.io/tx/c59678b6892ba0fbeeaaec22d4cbde17026ff614ed47cea02c47752e5853ebc8>
[^5]: <https://preprod.cexplorer.io>
[^6]: <https://deno.land/x/lucid@0.10.7/mod.ts?s=Utils&p=prototype.validatorToAddress>
