import fetch from 'node-fetch';
import { RestClient } from 'marlowe-runtime-rest-client-txpipe';
import { ApplyInputsToContractRequest } from 'marlowe-runtime-rest-client-txpipe/dist/esm/contract/transaction/endpoints/collection';
import {
    Address,
    C,
    Lucid,
    OutRef,
    OutputData,
    Tx,
    TxComplete,
    UTxO,
    Utils,
    toHex,
    valueToAssets,
} from 'lucid-cardano';
import axios, { AxiosError } from 'axios';

/**
 * Send an unsigned transaction to the signing service.
 *
 * @param signURL Url of the signing service
 * @param cborHex Unsigned transaction in CBOR format
 * @returns Signed transaction
 */
export async function signTx(signURL: string, cborHex: string) {
    try {
        const response = await fetch(signURL, {
            method: 'POST',
            body: JSON.stringify(cborHex),
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

/**
 * Build the transactions that apply inputs to each contract, sign them
 * and submit them.
 *
 * @param signTxUrl Url of the transaction signing service
 * @param client Marlowe Rest client
 * @param lucid Instance of Lucid initiated with a provider
 * @param applicableInputs Array of requests to apply inputs to the respective contracts
 * @returns A list of the txHashes of the succesfully submitted transactions
 */
export async function buildAndSubmit(
    client: RestClient,
    lucid: Lucid,
    applicableInputs: ApplyInputsToContractRequest[]
): Promise<string> {
    if (applicableInputs.length > 0) {
        try {
            const appliedInput = await client.applyInputsToContract(
                applicableInputs[0]
            );

            const balancedTx = await processAndBalanceCbor(
                appliedInput.tx.cborHex,
                lucid
            );
            const signedTx = balancedTx.sign();
            const txHash = (await signedTx.complete()).submit();

            return txHash;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const e = error as AxiosError;
                console.error(
                    'Axios error occurred: ' + e.response?.statusText.toString()
                );
                console.error(e.response?.data);
            } else {
                console.error('Unexpected error occurred', error);
            }
            return 'Error occurred';
        }
    } else {
        return 'No inputs to apply';
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
    if (!allDatums) throw new Error('No datums in tx');

    for (let i = 0; i < allDatums.len(); i++) {
        const datum = allDatums.get(i);
        if (C.hash_plutus_data(datum).to_hex() === hash) {
            return datum;
        }
    }

    throw new Error(`No Datum found for datum hash: ${hash}`);
}

/**
 * Retrieves the CML Redeemer in a CML Transaction.
 * @param transaction CML Transaction to parse
 * @returns The only redeemer in the transaction
 * @throws NoRedeemerInTransactionError
 * @throws MoreThanOneRedeemerInTransactionError
 */
function getOnlyRedeemerFromTransaction(
    transaction: C.Transaction
): C.Redeemer {
    const redeemers = transaction.witness_set().redeemers();

    if (!redeemers) throw new Error('No redeemer in transaction. Expected 1');

    if (redeemers.len() > 1)
        throw new Error('More than 1 redeemer in transaction. Expected 1');

    return redeemers.get(0);
}

/**
 * Gets the marlowe contract UTxOs from the inputs inside a list of transactions
 * @param transactions All the CML transactions to parse
 * @returns A list of all marlowe contract UTxOs
 */
async function getMarloweInputs(
    transactions: C.Transaction[],
    lucid: Lucid
): Promise<UTxO[]> {
    const utxoRefs = transactions.map((tx) => {
        const redeemer = getOnlyRedeemerFromTransaction(tx);
        const inputIndex = redeemer.index();
        const input = tx.body().inputs().get(Number(inputIndex.to_str()));

        return getRefFromInput(input);
    });

    return lucid.utxosByOutRef(utxoRefs);
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

async function processAndBalanceCbor(
    cbor: string,
    lucid: Lucid
): Promise<TxComplete> {
    const transaction = C.Transaction.from_bytes(Buffer.from(cbor, 'hex'));

    const refScriptRef = {
        txHash: 'c59678b6892ba0fbeeaaec22d4cbde17026ff614ed47cea02c47752e5853ebc8',
        outputIndex: 1,
    };
    const resScriptUtxo = await lucid.utxosByOutRef([refScriptRef]);

    const allMarloweInputs = await getMarloweInputs([transaction], lucid);

    const newTx = translateToTx(transaction, allMarloweInputs, lucid);
    newTx.readFrom(resScriptUtxo);

    return newTx.complete();
}

/**
 * Translates a CML transaction that is the result of calling
 * applyInputsToContract to a Lucid transaction
 * @param transaction The CML transaction to translate
 * @returns The Lucid transaction
 */
function translateToTx(
    transaction: C.Transaction,
    inputs: UTxO[],
    lucid: Lucid
): Tx {
    const marloweAddress: Address =
        'addr_test1wrv9l2du900ajl27hk79u07xda68vgfugrppkua5zftlp8g0l9djk';

    let finalTx: Tx = new Tx(lucid);
    const utils = new Utils(lucid);

    const redeemer = getOnlyRedeemerFromTransaction(transaction);

    const txInputs = transaction.body().inputs();
    let validInput: UTxO | undefined = undefined;

    for (let i = 0; i < txInputs.len(); i++) {
        const input = txInputs.get(i);
        const ref = getRefFromInput(input);

        if (!validInput) {
            validInput = inputs.find((utxo) => {
                return (
                    utxo.outputIndex === ref.outputIndex &&
                    utxo.txHash === ref.txHash
                );
            });
        }
    }

    if (!validInput)
        throw new Error('No transaction input was found on inputs list');

    const redeemerCbor = toHex(redeemer.data().to_bytes());
    finalTx.collectFrom([validInput], redeemerCbor);

    const outputs = transaction.body().outputs();
    let outputsList: C.TransactionOutput[] = [];

    for (let i = 0; i < outputs.len(); i++) {
        const out = outputs.get(i);
        if (out.address().to_bech32(undefined) === marloweAddress) {
            outputsList.push(out);
        }
    }

    if (outputsList.length > 1)
        throw new Error('More than one Marlowe Contract Output');

    if (outputsList.length === 1) {
        const out = outputsList[0];

        const datumHash = out.datum()?.as_data_hash()?.to_hex();

        if (!datumHash) throw new Error('Marlowe Output without datum');

        const datum = findDatumFromHash(datumHash, transaction);
        const datumCBOR = toHex(datum.to_bytes());
        const assets = valueToAssets(out.amount());

        const outputData: OutputData = { asHash: datumCBOR };
        finalTx.payToContract(marloweAddress, outputData, assets);
    }

    const slotFrom = transaction.body().validity_start_interval();
    const slotUntil = transaction.body().ttl();

    const from: number = utils.slotToUnixTime(Number(slotFrom!.to_str()));
    const until: number = utils.slotToUnixTime(Number(slotUntil!.to_str()));

    finalTx.validFrom(from);
    finalTx.validTo(until);

    const requiredSigners = transaction.body().required_signers();

    if (requiredSigners) {
        for (let i = 0; i < requiredSigners?.len(); i++) {
            const reqSigner = requiredSigners?.get(i);
            const key = reqSigner.to_hex();
            finalTx.addSignerKey(key);
        }
    }

    return finalTx;
}
