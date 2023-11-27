# Marlowe Oracle Services

## Design

A complete design document can be found [here](./docs/design.md).

## Run the service

Use the following commands to install all the dependencies and then run the service:
```bash
    $ npm install
    $ npm run dev
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

We also need to have the `sign-tx` service. To install and run it, go to https://github.com/filabs-dev/sign-tx.

After everything is configured, we can use the following command to run the script.
```bash
    $ npm install
    $ npm run deploy-example
```
