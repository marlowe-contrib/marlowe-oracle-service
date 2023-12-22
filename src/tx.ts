import { RestClient } from 'marlowe-runtime-rest-client-txpipe';
import { ApplyInputsToContractRequest } from 'marlowe-runtime-rest-client-txpipe/dist/esm/contract/transaction/endpoints/collection';
import {
    Address,
    C,
    ExternalWallet,
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
import { BuildTransactionError, throwAxiosError } from './error.ts';

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
    applicableInputs: ApplyInputsToContractRequest[]
): Promise<string[]> {
    if (applicableInputs.length > 0) {
        try {
            const transactions = applicableInputs.map(async (input) => {
                return client
                    .applyInputsToContract(input)
                    .then((appliedInput) => {
                        return processCbor(appliedInput.tx.cborHex, lucid);
                    });
            });

            const psTransactions = await Promise.allSettled(transactions);

            const fulfilled: Tx[] = [];

            psTransactions.forEach((res, idx) => {
                if (res.status === 'fulfilled') {
                    fulfilled.push(res.value);
                } else {
                    console.log(res);
                }
            });

            const completedTxs = await balanceParallel(fulfilled, lucid);

            const signedTxs = completedTxs.map((tx) => {
                return tx.sign();
            });
            const txHashes = signedTxs.map(async (signedTx) => {
                return (await signedTx.complete()).submit();
            });

            const psSubmitted = await Promise.allSettled(txHashes);

            const submitted: string[] = [];

            psSubmitted.forEach((res, idx) => {
                if (res.status === 'fulfilled') {
                    submitted.push(res.value);
                } else {
                    console.log(res);
                }
            });

            return submitted;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const e = error as AxiosError;
                throwAxiosError(e);
            } else if (error instanceof BuildTransactionError) {
                console.log(error.name, error.message);
            }
            return ['Error occurred'];
        }
    } else {
        return ['No inputs to apply'];
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

    if (!redeemers)
        throw new BuildTransactionError('NoRedeemerInTransaction.ExpectedOne');

    if (redeemers.len() > 1)
        throw new BuildTransactionError(
            'MoreThanOneRedeemerInTransaction.ExpectedJustOne'
        );
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

async function processCbor(cbor: string, lucid: Lucid): Promise<Tx> {
    const transaction = C.Transaction.from_bytes(Buffer.from(cbor, 'hex'));

    const refScriptRef = {
        txHash: 'c59678b6892ba0fbeeaaec22d4cbde17026ff614ed47cea02c47752e5853ebc8',
        outputIndex: 1,
    };
    const resScriptUtxo = await lucid.utxosByOutRef([refScriptRef]);

    const allMarloweInputs = await getMarloweInputs([transaction], lucid);

    const newTx = translateToTx(transaction, allMarloweInputs, lucid);
    newTx.readFrom(resScriptUtxo);

    return newTx;
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
        throw new BuildTransactionError('NoTransactionInputFoundOnInputsList');

    const redeemerCbor = toHex(redeemer.data().to_bytes());
    finalTx.collectFrom([validInput], redeemerCbor);

    finalTx.compose(processMarloweOutput(transaction, lucid, marloweAddress));

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

            const completedTx = await tx.complete({ nativeUplc: false });
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
        console.log(err);
    } finally {
        lucid.wallet = wallet;
        return completedTxs;
    }
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
