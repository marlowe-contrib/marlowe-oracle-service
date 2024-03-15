# Guide to add a new oracle to the off-chain

This document will briefly show you how to implement the off-chain code to add a new oracle or feed to the MOS, implementing Orcfax as an example and using the implementation for Charli3 as a guide. In particular, we will use the code in the **config**, **scan** and **feed** modules as boilerplate to include the new oracle. The remaining modules are agnostic of the oracles so they will not need to be changed. After these modifications in the mentioned modules, we will be ready to run the MOS.

## What does the off-chain code do?

The [off-chain part](design.md#31-off-chain-backend) of this application is responsible of:
-   Finding the contracts that need Oracle input
-   Fetching the desired prices from the respective sources
-   And building and submitting the transactions that modify the Marlowe contract and its state (to include the requested price), and, for the case of decentralized oracles, that run the necessary on-chain validations.

So, together with the implementation and deployment of a validator for a new oracle or feed, we will need to make changes to the off-chain code before we are able to use the new feed when running the MOS.

## Expanding the mos-config.json

The mos-config.json file holds information about every oracle/feed that a certain instance of the MOS supports. This information is key for the operation of the MOS, as it is used in the different parts of the service and it can fit into one of the following categories:

-   Resolution of the Choice action in a Marlowe contract[^1]
-   Lookup of the Oracle on the blockchain[^3]
-   Lookup of the bridge validator on the blockchain[^2]

Let’s take a look at the configuration for Charli3:

https://github.com/marlowe-contrib/marlowe-oracle-service/blob/370a4aa454921e9737be3951f41d2684937caff1/mos-config.json#L11-L22

The first fields are about the Marlowe contract and the bridge:

-   `choiceName` is the name of the Choice as it should appear on the Marlowe contract
-   `roleName` is the name of the token that the oracle bridge should receive
-   `bridgeValidatorUtxo` is the reference (formed by a Tx Hash and an Output Index) to the UTxO that holds the script (as a reference script) that the bridge validator has to run
-   `bridgeAddress` is the address that will receive the corresponding oracle role token and it is a script address

The last few fields refer to the oracle in question and provide useful information about it:
-   `feedAddress` is the address that owns the Oracle Feed UTxOs
-   `feedPolicyId` is the minting policy for the token that identifies the Oracle Feed UTxO
-   `feedTokenName` is the name of the token that identifies the Oracle Feed UTxO, and it might not always be present

Let’s now add the new resolve method field for Orcfax:

https://github.com/marlowe-contrib/marlowe-oracle-service/blob/370a4aa454921e9737be3951f41d2684937caff1/mos-config.json#L23-L33

The first two fields are similar to the ones for Charli3 since it’s the convention we decided that the choiceName must be the oracle’s name followed by the feed name, and that the role name must be the oracle’s name followed by the word oracle. This decision is explained in the [design document](design.md#1-using-oracles-in-a-marlowe-contract).
The `bridgeValidatorUtxo` field has the same `txHash` as the one for Charli3 because we deployed them together, but you can find this information when you deploy a new validator. The same goes for the `bridgeAddress`. Before trying the validator specific for the oracle, it might be helpful to use an _always true_ validator to check that the off-chain works as expected. After we make sure that it is working correctly, we can use the off-chain to check that the validator works properly as well.

The other fields can be completed by looking at the documentation for the oracle.

## Updating the configuration

In the [config.ts](../src/config.ts) file we will need to do a couple of modifications to add our new oracle.
The first thing that we have to change is the `ResolveMethod<T>` type, where we will have to add a new field for our new oracle:

https://github.com/marlowe-contrib/marlowe-oracle-service/blob/370a4aa454921e9737be3951f41d2684937caff1/src/config.ts#L60-L64

For the case of decentralized oracles, we can use the [OracleConfig](https://github.com/marlowe-contrib/marlowe-oracle-service/blob/370a4aa454921e9737be3951f41d2684937caff1/src/config.ts#L38) type, that includes all the information that we will need to find the oracle UTxOs and validate the usage. This type matches the part of the `mos-config.json` about each oracle. But not all oracles are the same, so how can we account for these differences? For example, Charli3 identifies its Oracle Feed UTxO by a Policy Id and a specific Token Name, but Orcfax only uses a Policy Id. This difference for example is taken care of in the `OracleConfig` type by making the Token Name a field that can be undefined.
Other fields that we might need to add can be fixed in similar ways.

The other function that we have to modify in this module is `setOracleConfig`. This function is responsible for querying the blockchain to obtain the UTxO that holds the reference script for this oracle’s bridge validator. This is done using the UTxORef included in the `mos-config.json` file.

https://github.com/marlowe-contrib/marlowe-oracle-service/blob/370a4aa454921e9737be3951f41d2684937caff1/src/config.ts#L333-L375

Here `charli3BridgeUtxo` represents the possible inclusion of the Charli3 bridge UTxO, clearly we will need something similar for Orcfax. Now, the inclusion of each bridge UTxO is determined by the resolved method included in the mos-config. Thus, in the same way we include the Charli3 bridge UTxO if the config field `mc.resolveMethod.charli3` is present, now we must include the Orcfax bridge UTxO if the config field `mc.resolveMethod.orcfax` is present. A detail to notice is that the config has a UTxO reference of each of the specified bridges, so we use `getUTxOWithScriptRef` to get the complete UTxO information.
As we can see the new code for Orcfax is the same as the one for Charli3 but with different names, so these changes should not present much difficulty.

## Finding the new contracts

Now that we’ve added our new oracle to the configuration, we can start using it. The first place in which we will use the new configuration is the [scan module](../src/scan.ts) which is responsible for finding contracts that can be resolved by the MOS. So here, we will need to make some changes that will allow the service to find the contracts that need to resolve choices with the new oracle. First we need a way to collect the information about these contracts, and we can do that using two variables [orcfaxResolvableData](https://github.com/marlowe-contrib/marlowe-oracle-service/blob/370a4aa454921e9737be3951f41d2684937caff1/src/scan.ts#L124) and [orcfaxResolvable](https://github.com/marlowe-contrib/marlowe-oracle-service/blob/370a4aa454921e9737be3951f41d2684937caff1/src/scan.ts#L125), like we do for Charli3.
Then, we go through each contract’s **next** actions and keep those that need to be resolved with any of the oracles we have defined. To do this we check that the configuration for the oracle is set, and that the Choice in the contract has the correct Owner and Name (by matching with the `mos-config`). `orcfaxResolvableData` will hold information about every contract that needs to be resolved with Orcfax.

https://github.com/marlowe-contrib/marlowe-oracle-service/blob/370a4aa454921e9737be3951f41d2684937caff1/src/scan.ts#L165-L174

If any contracts for Orcfax are found, we will need to check that they have the correct bridge UTxO. If they do, then we will save them in `orcfaxResolvable` and add more about them through the [OracleRequest](https://github.com/marlowe-contrib/marlowe-oracle-service/blob/370a4aa454921e9737be3951f41d2684937caff1/src/scan.ts#L32) type. This will allows us to have details about the contract and other information necessary to the operation of the MOS, like the time interval that the final transaction will be valid within. One of the most important fields is the `bridgeUtxo` that has the UTxOs for the contract’s bridge and the bridge validator.

The next modification is a cosmetic one, as it is logging the contracts found for an oracle. It is not necessary but it is very useful to see this information when the MOS is running.

https://github.com/marlowe-contrib/marlowe-oracle-service/blob/370a4aa454921e9737be3951f41d2684937caff1/src/scan.ts#L204-L207

After we have gathered all the valid contracts for this iteration, we are ready to move on to the next module.

https://github.com/marlowe-contrib/marlowe-oracle-service/blob/370a4aa454921e9737be3951f41d2684937caff1/src/scan.ts#L209

## Querying the prices

The last module that we will have to modify is the [Feed module](../src/feed.ts). This module is responsible for querying the blockchain to find the UTxOs that hold the price information for every decentralized oracle.

The implementation of this module will also have some boilerplate code like the previous modules, but there is one part that might take some more thought: the parsing and decoding of the datum that holds the price information. This might be fairly easy or difficult depending on the format of the datum, but in the implementation we propose there is a strategy that can work to parse any datum.

Let’s first go over the parts that are similar to the implementation for Charli3. Starting from the addition of the new oracle to the [KnownCurrencyPairs](https://github.com/marlowe-contrib/marlowe-oracle-service/blob/370a4aa454921e9737be3951f41d2684937caff1/src/feed.ts#L68) variable. It is simply a new line similar to the one for Charli3, but with `Orcfax` in the key, and as a source.
If you wanted to use a new currency that is not `ADA`, or `USD` , you will have to add it to the [Currency](https://github.com/marlowe-contrib/marlowe-oracle-service/blob/370a4aa454921e9737be3951f41d2684937caff1/src/feed.ts#L37) type.

Next, we’ll go to the `setPriceMap` function. This function creates a map that has the prices, utxos and validity intervals for each Oracle. In it, we need to add a new case for Orcfax. Again, we can use the case for Charli3 as an example:

https://github.com/marlowe-contrib/marlowe-oracle-service/blob/370a4aa454921e9737be3951f41d2684937caff1/src/feed.ts#L328-L338

In here we check that a configuration is set for Orcfax, and throws an error if it’s not (this error has to be added to the [FeedErrorNames](https://github.com/marlowe-contrib/marlowe-oracle-service/blob/370a4aa454921e9737be3951f41d2684937caff1/src/error.ts#L62) variable in the [Error](../src/error.ts) module). Then it calls a new function `getOrcfaxPrice` which we will define next.

`getOrcfaxPrice` is the function that finds the necessary UTxO, parses the datum, and returns not only the price informed in the datum, but it also returns the Oracle Feed UTxO, and its validity interval, since decentralized oracles usually provide one. The definition of this function might take some ingenuity and the definition of other additional utility functions.

In the case for Orcfax in Preprod, there are plenty of UTxOs sitting at the address that produces the Orcfax Oracle feed. According to Orcfax’s documentation, the way to find the latest feed is to sort through all of the UTxOs with a token of a certain Policy Id, checking the datum for the one with the required name and the largest POSIX stamp among them.
Then, the function will look like this:

https://github.com/marlowe-contrib/marlowe-oracle-service/blob/370a4aa454921e9737be3951f41d2684937caff1/src/feed.ts#L417-L468

We can see that we need a couple of auxiliary functions like [parseOrcfaxValidTime](https://github.com/marlowe-contrib/marlowe-oracle-service/blob/370a4aa454921e9737be3951f41d2684937caff1/src/feed.ts#L527) and [parseOrcfaxPrice](https://github.com/marlowe-contrib/marlowe-oracle-service/blob/370a4aa454921e9737be3951f41d2684937caff1/src/feed.ts#L475). You can use the implementations for these functions as well as the one for [Charli3](https://github.com/marlowe-contrib/marlowe-oracle-service/blob/370a4aa454921e9737be3951f41d2684937caff1/src/feed.ts#L380) as a guide to be able to parse datums.

[^1]: <https://github.com/marlowe-contrib/marlowe-oracle-service/blob/main/docs/known-feeds.md#example>
[^2]: <https://github.com/marlowe-contrib/marlowe-oracle-service/blob/main/docs/how-to-use-deploy-bridge.md>
[^3]: <https://docs.orcfax.io/consume>
