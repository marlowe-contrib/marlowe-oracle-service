import { RestClient } from 'marlowe-runtime-rest-client-txpipe';
import { ApplyInputsToContractRequest } from 'marlowe-runtime-rest-client-txpipe/dist/esm/contract/transaction/endpoints/collection';
import {
    Address,
    C,
    Data,
    Datum,
    ExternalWallet,
    Lucid,
    OutRef,
    OutputData,
    Tx,
    TxComplete,
    UTxO,
    toHex,
    valueToAssets,
} from 'lucid-cardano';
import axios, { AxiosError } from 'axios';
import { Input, IChoice, Party } from 'marlowe-language-core-v1-txpipe';
import { Payment } from 'marlowe-language-core-v1-txpipe/dist/esm/transaction.ts';
import MLC from 'marlowe-language-core-v1-txpipe';
import { TxOutRef, unTxOutRef } from '@marlowe.io/runtime-core';
import { match, toUndefined } from 'fp-ts/lib/Option.js';
import { ContractDetails } from 'marlowe-runtime-rest-client-txpipe/dist/esm/contract/details';
import { constUndefined } from 'fp-ts/lib/function.js';

import { MOSEnv } from './config.ts';
import {
    BuildTransactionError,
    RequestError,
    throwAxiosError,
} from './error.ts';
import { txLogger } from './logger.ts';

/**
 * Represents the request structure for the Marlowe Apply Service (MAS).
 */
export type MASRequest = {
    version: string;
    marloweData: Datum;
    invalidBefore: Date;
    invalidHereafter: Date;
    inputs: Input[];
};

/**
 * Represents a successful response from the Marlowe Apply Service (MAS).
 */
type MASSuccessResponse = {
    datumCborHex: string;
    redeemerCborHex: string;
    payments: Payment[];
};

/**
 * Represents an error response from the Marlowe Apply Service (MAS).
 */
type MASErrorResponse = {
    error: string;
};

/**
 * Represents a response from the Marlowe Apply Service (MAS), which can either
 * be a success response or an error response.
 */
export type MASResponse = MASSuccessResponse | MASErrorResponse;

/** This function goes over all fields of an object and changes any bigint field
 * to a number. Used for the applyInput function.
 */
function convertBigIntToNumber(obj: any): any {
    if (typeof obj === 'bigint') {
        return Number(obj);
    } else if (typeof obj === 'object' && obj !== null) {
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                obj[key] = convertBigIntToNumber(obj[key]);
            }
        }
    }
    return obj;
}

/**
 * Get the updated datum after doing an apply, using our own service.
 *
 * @param applyUrl Url of the apply service
 * @param request request for the service
 * @returns cbor of the updated datum or error
 */
export async function applyInput(
    applyUrl: string,
    request: MASRequest
): Promise<MASResponse> {
    const response = await fetch(applyUrl, {
        method: 'POST',
        body: JSON.stringify(convertBigIntToNumber(request)),
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
    });

    if (!response.ok) {
        throw new RequestError(`${response.status}`, response.statusText);
    }

    const result = (await response.json()) as MASResponse;

    return result;
}

/**
 * Given a list of requests, fetches the utxo of the corresponding contract.
 * @param client Marlowe Rest Client
 * @param lucid Intance of Luicd initiated with a provider
 * @param requests List of requests to process
 * @returns A map matching each request to a UTxO
 */
async function getAllUtxos(
    client: RestClient,
    lucid: Lucid,
    requests: ApplyInputsToContractRequest[]
): Promise<Map<ApplyInputsToContractRequest, UTxO>> {
    let allDetails = new Map<ApplyInputsToContractRequest, ContractDetails>();
    for await (const req of requests) {
        try {
            const cId = req.contractId;
            const details = await client.getContractById(cId);
            allDetails.set(req, details);
        } catch (e) {
            txLogger.error(e);
        }
    }

    let utxoRefs: OutRef[] = [];
    allDetails.forEach((detail) => {
        const utxo = toUndefined(detail.utxo);
        if (utxo) {
            const [hash, idx] = unTxOutRef(utxo).split('#');
            const ref: OutRef = { txHash: hash, outputIndex: Number(idx) };
            utxoRefs.push(ref);
        }
    });

    const utxos = await lucid.utxosByOutRef(utxoRefs);

    for await (const utxo of utxos) {
        if (utxo.datumHash) {
            const datumPD = await lucid.datumOf(utxo);
            utxo.datum = Data.to(datumPD);
        }
    }

    // Loop thorugh all utxos, and find in the details list the contractId that corresponds
    let result = new Map<ApplyInputsToContractRequest, UTxO>();

    for (const utxo of utxos) {
        let foundDetail = false;
        allDetails.forEach((detail, req) =>
            match(constUndefined, (elem: TxOutRef) => {
                const [hash, idx] = unTxOutRef(elem).split('#');
                if (hash == utxo.txHash && Number(idx) == utxo.outputIndex) {
                    foundDetail = true;
                    result.set(req, utxo);
                }
            })(detail.utxo)
        );
        if (!foundDetail) {
            txLogger.error('No contract detail found for ref: ', utxo);
        }
    }

    return result;
}

/**
 * Uses the Marlowe Apply Service (MAS) to calculate the updated datum and build
 * the process tx.
 * @param lucid Lucid instance initiated with a provider
 * @param applyUrl The url of the MAS
 * @param utxo The contract utxo
 * @param request the apply request for that contract
 * @returns The Tx that applies the request or undefined if it wasn't possible
 * to do the apply
 */
async function getApplyRequests(
    lucid: Lucid,
    applyUrl: string,
    utxo: UTxO,
    request: ApplyInputsToContractRequest
): Promise<Tx | undefined> {
    if (!utxo.datum) throw new BuildTransactionError('NoDatumFoundOnUTxO');

    let newTx = undefined;

    //Hotfix for script evaluation error. Remove once MAS is updated
    const oldIBUNIX = (request.invalidBefore as Date).getTime();
    const newIBUNIX = Math.floor(oldIBUNIX / 1000) * 1000;
    const newIB = new Date(newIBUNIX);

    const newRequest: MASRequest = {
        version: request.version ?? 'v1',
        marloweData: utxo.datum,
        invalidBefore: newIB,
        invalidHereafter: request.invalidHereafter,
        inputs: request.inputs,
    };

    const applyResponse = await applyInput(applyUrl, newRequest);
    if ('error' in applyResponse) {
        txLogger.error(applyResponse.error);
    } else if (applyResponse.payments.length > 0) {
        txLogger.warn('Found payments. Ignoring this tx.');
    } else {
        newTx = new Tx(lucid);

        // Get all required signers

        const reqSigners = getSignersFromInputs(request.inputs);

        for (const address of reqSigners) {
            newTx.addSigner(address);
        }

        newTx.validFrom(newIBUNIX);
        newTx.validTo(request.invalidHereafter);

        newTx.collectFrom([utxo], applyResponse.redeemerCborHex);
        newTx.payToContract(
            utxo.address,
            { asHash: applyResponse.datumCborHex },
            utxo.assets
        );
    }

    return newTx;
}

function getSignersFromInputs(inputs: Input[]): Address[] {
    function isIChoice(value: Input): value is IChoice {
        return (value as any).for_choice_id !== undefined;
    }

    function isAddress(value: Party): value is MLC.Address {
        return (value as any).address !== undefined;
    }

    let allAddresses: Address[] = [];
    for (const input of inputs) {
        if (isIChoice(input) && isAddress(input.for_choice_id.choice_owner)) {
            allAddresses.push(input.for_choice_id.choice_owner.address);
        }
    }
    return allAddresses;
}

/**
 * Build the transactions that apply inputs to each contract, sign them
 * and submit them.
 *
 * @param client Marlowe Rest client
 * @param lucid Instance of Lucid initiated with a provider
 * @param applicableInputs Array of requests to apply inputs to the respective contracts
 * @returns A list of the txHashes of the succesfully submitted transactions
 */
export async function buildAndSubmit(
    client: RestClient,
    lucid: Lucid,
    applicableInputs: ApplyInputsToContractRequest[],
    mosEnv: MOSEnv<UTxO>
): Promise<void> {
    const submitted: string[] = [];
    if (applicableInputs.length > 0) {
        try {
            const contractUtxos = await getAllUtxos(
                client,
                lucid,
                applicableInputs
            );

            let allTxs: Tx[] = [];
            for (const [req, utxo] of contractUtxos) {
                const tx = await getApplyRequests(
                    lucid,
                    mosEnv.applyUrl,
                    utxo,
                    req
                );
                if (tx) allTxs.push(tx);
            }

            allTxs = allTxs.map((tx) => {
                return tx.readFrom([mosEnv.marloweValidatorUtxo]);
            });

            const completedTxs = await balanceParallel(allTxs, lucid);

            const signedTxs = completedTxs.map((tx) => {
                return tx.sign();
            });

            const txHashes = signedTxs.map(async (signedTx) => {
                return (await signedTx.complete()).submit();
            });

            const psSubmitted = await Promise.allSettled(txHashes);

            psSubmitted.forEach((res, idx) => {
                if (res.status === 'fulfilled') {
                    submitted.push(res.value);
                } else {
                    txLogger.warn(res);
                }
            });
            txLogger.info(submitted);
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const e = error as AxiosError;
                throwAxiosError(e);
            } else if (error instanceof BuildTransactionError) {
                txLogger.error('Unexpected error occurred', error);
            }
        }
    } else {
        txLogger.info(submitted);
    }
}

/**
 * Gets the OutRef from a CML TransactionInput
 * @param input The CML TransactionInput to parse
 * @returns the corresponding OutRef
 */
function getRefFromInput(input: C.TransactionInput): OutRef {
    const txId = input.transaction_id().to_hex();
    const idx = Number(input.index().to_str());
    const ref: OutRef = { txHash: txId, outputIndex: idx };
    return ref;
}

/**
 * Balances a list of txs, making sure than the utxos used for balancing don't
 * overlap
 * @param txs transactions to balance
 * @param lucid lucid instance
 * @returns The balanced transactions
 */
async function balanceParallel(txs: Tx[], lucid: Lucid): Promise<TxComplete[]> {
    const wallet = lucid.wallet;
    let completedTxs: TxComplete[] = [];

    try {
        const address = await wallet.address();
        let utxos = await wallet.getUtxos();

        for (var tx of txs) {
            const external: ExternalWallet = { address: address, utxos: utxos };
            lucid.selectWalletFrom(external);

            const completedTx = await tx.complete({ nativeUplc: true });
            completedTxs.push(completedTx);

            const usedUtxos = completedTx.txComplete.body().inputs();
            utxos = utxos.filter((utxo) => {
                const ref: OutRef = {
                    txHash: utxo.txHash,
                    outputIndex: utxo.outputIndex,
                };
                return !isIncluded(ref, usedUtxos);
            });
        }
    } catch (err) {
        txLogger.error(err);
    } finally {
        lucid.wallet = wallet;
        return completedTxs;
    }
}

/**
 * Finds a datum inside a transaction that corresponds with the given hash
 * @param hash hash to look for
 * @param transaction transaction where to look for the datum
 * @returns The Datum whose hash is the same as the given hash
 * @throws NoDatumsInTx
 * @throws NoDatumMatchesHash
 */
function findDatumFromHash(
    hash: string,
    transaction: C.Transaction
): C.PlutusData {
    const allDatums = transaction.witness_set().plutus_data();
    if (!allDatums)
        throw new BuildTransactionError('NoDatumsFoundInTransaction');

    for (let i = 0; i < allDatums.len(); i++) {
        const datum = allDatums.get(i);
        if (C.hash_plutus_data(datum).to_hex() === hash) {
            return datum;
        }
    }

    throw new BuildTransactionError('NoDatumFoundForDatumHash', hash);
}

/**
 * Given a CML Transaction, create a Lucid Tx that only has the marlowe output.
 * Fails if there's more than one output at the marlowe address or if the output
 * doesn't have a datum.
 * @param transaction CML transaction to process
 * @param lucid lucid instance
 * @param marloweAddress Address of the marlowe validator
 * @returns The Lucid Tx with either one or none outputs
 * @throws BuildTransactionError
 */
export function processMarloweOutput(
    transaction: C.Transaction,
    lucid: Lucid,
    marloweAddress: Address
): Tx {
    const outputs = transaction.body().outputs();
    let finalTx: Tx = new Tx(lucid);
    let outputsList: C.TransactionOutput[] = [];

    for (let i = 0; i < outputs.len(); i++) {
        const out = outputs.get(i);
        if (out.address().to_bech32(undefined) === marloweAddress) {
            outputsList.push(out);
        }
    }

    if (outputsList.length > 1)
        throw new BuildTransactionError('MoreThanOneMarloweContractOutput');

    if (outputsList.length === 1) {
        const out = outputsList[0];

        const datumHash = out.datum()?.as_data_hash()?.to_hex();

        if (!datumHash)
            throw new BuildTransactionError('MarloweOutputWithoutDatum');

        const datum = findDatumFromHash(datumHash, transaction);
        const datumCBOR = toHex(datum.to_bytes());
        const assets = valueToAssets(out.amount());

        const outputData: OutputData = { asHash: datumCBOR };
        finalTx.payToContract(marloweAddress, outputData, assets);
    }

    return finalTx;
}

/**
 * Checks if a given OutRef is included in the transaction inputs of a CML Tx
 * @param ref the OutRef to look for
 * @param inputs the inputs list to check
 * @returns Wether it is included
 */
function isIncluded(ref: OutRef, inputs: C.TransactionInputs): Boolean {
    for (var i = 0; i < inputs.len(); i++) {
        const input = inputs.get(i);
        const setRef = getRefFromInput(input);
        if (
            setRef.txHash === ref.txHash &&
            setRef.outputIndex == ref.outputIndex
        ) {
            return true;
        }
    }
    return false;
}
