## How to use the deploy bridge utility.

[deploy-bridge.ts](../tests/deploy-bridge.ts) is a script that lets you easily deploy a validator as reference scripts. The instructions how to set up and use the script are below:

### Reading the compiled code and applying the parameters.

When we run aiken build a file called [plutus.json](../on-chain-bridge/plutus.json) gets modified (or created if it didn’t exist previously). In this file we can find the compiled code for the validators, and information about its parameters among other things. This information can be useful when applying the parameters because we will need to make sure that the types match.

In the [deploy-bridge.ts](../tests/deploy-bridge.ts) file, let’s begin by defining a new variable called orcfaxCompiled which holds the compiled code obtained from the `plutus.json` file. This is easy since there's a function already that parses that file and returns the array of validators. We just have to check the index of the oracle. In this case it’s at 1.
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
