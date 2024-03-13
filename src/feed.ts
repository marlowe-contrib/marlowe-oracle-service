import fetch from 'node-fetch';

import {
    AddressBech32,
    ContractId,
    addressBech32,
} from '@marlowe.io/runtime-core';
import {
    ChoiceId,
    Bound,
    Input,
    IChoice,
    ChoiceName,
    ChosenNum,
} from 'marlowe-language-core-v1-txpipe';

import {
    Constr,
    Data,
    Datum,
    Lucid,
    UTxO,
    fromText,
    fromUnit,
    toText,
    toUnit,
} from 'lucid-cardano';

import { Option, fold, isNone, none, some } from 'fp-ts/lib/Option.js';
import { pipe } from 'fp-ts/lib/function.js';

import { OracleRequest } from './scan.ts';
import { FeedError, RequestError } from './error.ts';
import { feedLogger } from './logger.ts';
import { OracleConfig, ResolveMethod } from './config.ts';

type Currency = 'ADA' | 'USD';

type CurrencyPair = {
    source: string;
    from: Currency;
    to: Currency;
};

type PriceMap = Record<
    string,
    Option<[bigint, Option<[UTxO, ValidityInterval]>]>
>;

export type ValidityInterval = {
    validFrom: bigint;
    validThrough: bigint;
};

export type ApplyInputsToContractRequest = {
    contractId: ContractId;
    changeAddress: AddressBech32;
    inputs: Input[];
    invalidBefore: Date;
    invalidHereafter: Date;
    bridgeUtxo: Option<[UTxO, UTxO]>;
    oracleUtxo: Option<[UTxO, ValidityInterval]>;
};

/**
 * @description Currency pairs for which information can be provided by the respective sources
 */
const KnownCurrencyPairs = new Map([
    ['Coingecko ADAUSD', { source: 'Coingecko', from: 'ADA', to: 'USD' }],
    ['Coingecko USDADA', { source: 'Coingecko', from: 'USD', to: 'ADA' }],
    ['Charli3 ADAUSD', { source: 'Charli3', from: 'ADA', to: 'USD' }],
    ['Orcfax ADAUSD', { source: 'Orcfax', from: 'ADA', to: 'USD' }],
]);

const OrcfaxFeedNames = new Map([['Orcfax ADAUSD', 'ADA-USD|USD-ADA']]);

/**
 * @param request Necessary information about the feed to provide and the Contract
 * that requires it.
 * @param mosAddress The address of the MOS
 * @param resMethods Configuration of the different resolve methods.
 * @returns A list of apply inputs, ready to be used on the applyInputsToContract endpoint.
 */
export async function getApplyInputs(
    requests: OracleRequest[],
    resMethods: ResolveMethod<UTxO>,
    lucid: Lucid
): Promise<ApplyInputsToContractRequest[]> {
    let priceMap = {};
    try {
        priceMap = await setPriceMap(requests, resMethods, lucid);
    } catch (e) {
        if (e instanceof FeedError) feedLogger.error(e.name, e.message);
    }
    const mosAddress = await lucid.wallet.address();
    const feeds = requests.map(async (request) => {
        const [input, utxo] = await feed(request, priceMap);
        const air: ApplyInputsToContractRequest = {
            contractId: request.contractId,
            changeAddress: addressBech32(mosAddress),
            inputs: [input],
            invalidBefore: request.invalidBefore,
            invalidHereafter: request.invalidHereafter,
            bridgeUtxo: request.bridgeUtxo,
            oracleUtxo: utxo,
        };
        return air;
    });
    const psFeeds = await Promise.allSettled(feeds);

    const fulfilled: ApplyInputsToContractRequest[] = [];

    psFeeds.map((res, idx) => {
        if (res.status === 'fulfilled') {
            fulfilled.push(res.value);
        } else {
            if (res.reason !== 'FeedResultIsOutOfBounds') {
                feedLogger.warn(res);
            }
        }
    });

    feedLogger.info(
        fulfilled.map((elem) => [elem.contractId, prettyInputs(elem.inputs)])
    );

    return fulfilled;
}

function prettyInputs(inputs: Input[]): [ChoiceName, ChosenNum][] {
    return inputs.map((input) => {
        const ic = input as IChoice;
        return [ic.for_choice_id.choice_name, ic.input_that_chooses_num];
    });
}

/**
 * @param request Necessary information about the feed to provide and the Contract
 * that requires it.
 * @returns contractId (of the contract that requested input) and ApplyRequestInputs
 * (complete inputs to be applied to it).
 * @throws FeedError UnkownCurrencyPairOrSource
 */
async function feed(
    request: OracleRequest,
    priceMap: PriceMap
): Promise<[Input, Option<[UTxO, ValidityInterval]>]> {
    try {
        const cn = request.choiceId.choice_name;
        const curPair = KnownCurrencyPairs.get(cn);
        if (!curPair) throw new FeedError('UnknownCurrencyPairOrSource', cn);
        if (!priceMap[cn]) throw new FeedError('FailedSettingPriceMap');

        const pm = priceMap[cn];

        if (isNone(pm)) throw new FeedError('PriceUndefinedForChoiceName');

        const [price, utxo] = pm.value;

        if (withinBounds(price, request.choiceBounds)) {
            const input: Input = makeInput(request.choiceId, price);
            return [input, utxo];
        } else {
            throw new FeedError('FeedResultIsOutOfBounds');
        }
    } catch (e) {
        if (e instanceof FeedError) {
            if (e.name !== 'FeedResultIsOutOfBounds') {
                feedLogger.error(e.name, e.message);
            }
            return Promise.reject(e.name + e.message);
        } else {
            return Promise.reject(e);
        }
    }
}

/**
 * Provides the price of a requested currencyPair via Coingecko. The price is returned
 * multiplied by 100_000_000
 * @param curPair Currency pair for the the desired exchange price
 * @param bounds Numeric limits that the price has to be confied within
 * @returns price as a scaled BigInt
 * @throws FeedError ResultIsOutOfBounds
 * @throws FeedError UnknownCurrencyPair
 */
async function getCoingeckoPrice(curPair: CurrencyPair): Promise<bigint> {
    const from = currencyToCoingecko(curPair.from);
    const to = currencyToCoingecko(curPair.to);
    var scaledResult = 0n;
    switch ([curPair.from, curPair.to].join('')) {
        case 'ADAUSD': {
            const result = await queryCoingecko(from, to);
            scaledResult = BigInt(Math.round(result * 100_000_000));
            break;
        }
        case 'USDADA': {
            const result = await queryCoingecko(to, from);
            scaledResult = BigInt(Math.round((1 / result) * 100_000_000));
            break;
        }
        default: {
            throw new FeedError(
                'UnknownCurrencyPair',
                curPair.from + curPair.to
            );
        }
    }
    return scaledResult;
}

/**
 * Requests the price feed for a currency pair to the CoingeckoApi
 * @param from base currency
 * @param to quote currency
 * @returns price
 * @throws RequestError
 * @throws FeedError Unknown base or quote currency for Coingecko query
 */
async function queryCoingecko(from: string, to: string): Promise<number> {
    type CoingeckoResponse = {
        [from: string]: {
            [to: string]: number;
        };
    };
    const cgApi = `https://api.coingecko.com/api/v3/simple/price?ids=${from}&vs_currencies=${to}`;
    const response = await fetch(cgApi, {
        method: 'GET',
        headers: {
            Accept: 'application/json',
        },
    });
    if (!response.ok) {
        throw new RequestError(`${response.status}`, response.statusText);
    }
    const result = (await response.json()) as CoingeckoResponse;
    if (result[from]) {
        if (result[from][to]) {
            return result[from][to];
        } else {
            throw new FeedError('UnknownQuoteCurrencyForCGQuery');
        }
    } else {
        throw new FeedError('UnknownBaseCurrencyForCGQuery');
    }
}

/**
 * Parsing of a currency to the known Coingecko codes
 * @param c Currency
 * @returns string to be used in the coingecko api request
 */
function currencyToCoingecko(c: Currency): string {
    switch (c) {
        case 'ADA':
            return 'cardano';
        case 'USD':
            return 'usd';
    }
}

/**
 * Utility to check if a given number n is within the bounds for at least one element of the array
 * @param n bigint
 * @param bounds array of Bound
 * @returns true if n is within any of the fiven bounds
 */
function withinBounds(n: bigint, bounds: Bound[]): Boolean {
    return bounds.some((bound) => n >= bound.from && n <= bound.to);
}

/**
 * Utility to create an IChoice
 * @param cId choiceId (choice_name and choice_owner) of the Input
 * @param price Number that the input chooses
 * @returns Simple InputContent with an IChoice
 */
function makeInput(cId: ChoiceId, price: bigint): Input {
    const inputChoice: IChoice = {
        for_choice_id: cId,
        input_that_chooses_num: price,
    };
    return inputChoice;
}

/**
 * Queries and creates a map that stores the price for every ChoiceName, to
 * avoid having to query the source multiple times for the same choice names.
 * @param requests List of Oracle Requests
 * @returns Record containing the price for each ChoiceName, and an Option
 * containing the Oracle Feed's UTxO, and it's validity Interval, or None.
 */
async function setPriceMap(
    requests: OracleRequest[],
    resMethods: ResolveMethod<UTxO>,
    lucid: Lucid
): Promise<PriceMap> {
    let requestedCN: Set<string> = new Set();
    requests.map((req) => {
        requestedCN.add(req.choiceId.choice_name);
    });

    let priceMap: PriceMap = {};
    for (const cn of requestedCN) {
        const curPair = KnownCurrencyPairs.get(cn);
        if (!curPair) throw new FeedError('UnknownCurrencyPairOrSource');

        let [price, utxo]: [bigint, Option<[UTxO, ValidityInterval]>] = [
            0n,
            none,
        ];
        try {
            switch (curPair.source) {
                case 'Coingecko':
                    price = await getCoingeckoPrice(curPair as CurrencyPair);
                    break;
                case 'Charli3':
                    if (!resMethods.charli3)
                        throw new FeedError(
                            'FoundRequestForCharli3FeedButConfigurationNotSet'
                        );

                    [price, utxo] = await getCharli3Price(
                        resMethods.charli3,
                        lucid
                    );
                    break;
                case 'Orcfax':
                    if (!resMethods.orcfax)
                        throw new FeedError(
                            'FoundRequestForOrcfaxFeedButConfigurationNotSet'
                        );
                    [price, utxo] = await getOrcfaxPrice(
                        resMethods.orcfax,
                        cn,
                        lucid
                    );
                    break;
            }
        } catch (e) {
            if (e instanceof FeedError) feedLogger.error(e.name, e.message);
        }
        if (price && utxo) priceMap[cn] = some([price, utxo]);
        else priceMap[cn] = none;
    }

    return priceMap;
}

/**
 * Queries Charli3's Oracle Feed UTxO to obtain the price that is contained in its datum.
 * @param c3Config OracleConfig that contains necessary information to query the Charli3 ADAUSD feed
 * @param lucid Instance of Lucid used to query the blockchain
 * @returns A tuple containing the exchange rate for ADAUSD and the Oracle Feed UTxO
 */
async function getCharli3Price(
    c3Config: OracleConfig<UTxO>,
    lucid: Lucid
): Promise<[bigint, Option<[UTxO, ValidityInterval]>]> {
    const charli3Unit = toUnit(c3Config.feedPolicyId, c3Config.feedTokenName);
    const charli3Utxo = await lucid.utxoByUnit(charli3Unit);

    if (!charli3Utxo) throw new FeedError('UtxoWOracleFeedNotFound');
    if (!charli3Utxo.datum)
        throw new FeedError('UtxoWOracleFeedDoesNotHaveDatum');

    const charli3Data = parseCharli3Price(charli3Utxo.datum);

    return [
        charli3Data.price,
        some([charli3Utxo, charli3Data.validityInterval]),
    ];
}

/**
 * Utility to parse the datum of the Charli3 Oracle Feed UTxO to read the price.
 * @param datum Datum of the Oracle Feed UTxO
 * @returns Exchange rate for ADAUSD, and the vality Interval for that price
 */
export function parseCharli3Price(datum: Datum): {
    price: bigint;
    validityInterval: ValidityInterval;
} {
    let data = Data.from<Data>(datum);
    if (data instanceof Constr && data.index === 0) {
        let data2 = data.fields[0];
        if (data2 instanceof Constr && data2.index === 2) {
            let data3 = data2.fields[0];
            if (data3 instanceof Map) {
                return {
                    price: data3.get(BigInt(0)) as bigint,
                    validityInterval: {
                        validFrom: data3.get(BigInt(1)) as bigint,
                        validThrough: data3.get(BigInt(2)) as bigint,
                    },
                };
            } else {
                throw new FeedError('UnexpectedCharli3DatumShape');
            }
        } else {
            throw new FeedError('UnexpectedCharli3DatumShape');
        }
    } else {
        throw new FeedError('UnexpectedCharli3DatumShape');
    }
}

/**
 * Queries the Orcfax Address for the feed UTxOs, looks for the most recent, and
 * returns that utxo and the price it informs.
 * @param ofConfig OracleConfig with the necessary information to query for the
 * Orcfax ADAUSD feed.
 * @param lucid Lucid instance used to query the blockchain
 * @returns The most recent price informed by Orcfax, and the UTxO from which
 * this information is obtained.
 */
export async function getOrcfaxPrice(
    ofConfig: OracleConfig<UTxO>,
    cn: string,
    lucid: Lucid
): Promise<[bigint, Option<[UTxO, ValidityInterval]>]> {
    const orcFaxUtxos = await lucid.utxosAt(ofConfig.feedAddress);

    const feedUtxos = orcFaxUtxos.filter(
        (utxo) =>
            Object.entries(utxo.assets).filter(
                ([u, v]) =>
                    fromUnit(u).policyId === ofConfig.feedPolicyId && v === 1n
            ).length > 0
    );

    if (feedUtxos.length === 0)
        throw new FeedError('NoUtxosFoundWithOrcfaxFeedPolicyId');

    let newestUTxOWithTime: [Option<[UTxO, Datum]>, bigint] = [none, 0n];

    for (const utxo of feedUtxos) {
        try {
            if (utxo.datum) {
                const vTimes = parseOrcfaxValidTime(utxo.datum);
                const name = toText(parseOrcfaxName(utxo.datum));

                if (
                    vTimes.validFrom > newestUTxOWithTime[1] &&
                    name === OrcfaxFeedNames.get(cn)
                ) {
                    newestUTxOWithTime = [
                        some([utxo, utxo.datum]),
                        vTimes.validFrom,
                    ];
                }
            }
        } catch (e) {}
    }

    return pipe(
        newestUTxOWithTime[0],
        fold(
            () => {
                throw new FeedError('UtxoWOracleFeedNotFound');
            },
            (result) => [
                parseOrcfaxPrice(result[1]),
                some([result[0], parseOrcfaxValidTime(result[1])]),
            ]
        )
    );
}

/**
 * Utility to parse the Orcfax Feed Datum to obtain the price
 * @param raw_datum Datum of the Orcfax Feed datum
 * @returns Exchange rate for ADAUSD
 */
function parseOrcfaxPrice(raw_datum: Datum): bigint {
    let data = Data.from<Data>(raw_datum);

    if (data instanceof Constr && data.index === 0) {
        let data2 = data.fields[0];
        if (data2 instanceof Map) {
            let data3 = data2.get(fromText('value'));
            if (data3 instanceof Array) {
                let data4 = data3[0];
                if (data4 instanceof Constr && data4.index === 3) {
                    let data5 = data4.fields;
                    let sig = data5[0] as bigint;
                    let exp = data5[1] as bigint;
                    const price = decodePrice(sig, exp);
                    return BigInt(price);
                } else {
                    throw new FeedError('UnexpectedOrcfaxDatumShape');
                }
            } else {
                throw new FeedError('UnexpectedOrcfaxDatumShape');
            }
        } else {
            throw new FeedError('UnexpectedOrcfaxDatumShape');
        }
    } else {
        throw new FeedError('UnexpectedOrcfaxDatumShape');
    }
}

/**
 * Decodes Orcfax price format as it is encoded in their datum. References:
 * https://github.com/mlabs-haskell/cardano-open-oracle-protocol/blob/main/coop-docs/05-json-plutus.md?plain=1#L53-L61
 * https://docs.orcfax.io/Technical-questions
 * @param sig The signigicant as found in the datum
 * @param exp The base 10 exponent as found in the datum
 * @returns The decoded price number. Represented as the real price value
 * multiplied by 10⁶, as per the MOS standard.
 */

function decodePrice(sig: bigint, exp: bigint): number {
    const unsignedSig = Number(sig);
    const unsignedBase = new BigUint64Array([exp]);
    const signedBase = new BigInt64Array([unsignedBase[0]]);
    return Math.floor(unsignedSig * 10 ** (Number(signedBase[0]) + 6));
}

/**
 * Utility to parse the Orcfax feed UTxO's datum to obtain the validity interval
 * of the price it informs.
 * @param raw_datum Datum of the Orcfax feed UTxO
 * @returns The timestamps the mark the validity interval of the price.
 */
export function parseOrcfaxValidTime(raw_datum: Datum): ValidityInterval {
    let data = Data.from<Data>(raw_datum);
    if (data instanceof Constr && data.index === 0) {
        let data2 = data.fields[0];
        if (data2 instanceof Map) {
            let data3 = data2.get(fromText('valueReference'));
            if (data3 instanceof Array) {
                let data4 = data3[0];
                let data5 = data3[1];
                if (data4 instanceof Map && data5 instanceof Map) {
                    return {
                        validFrom: data4.get(fromText('value')) as bigint,
                        validThrough: data5.get(fromText('value')) as bigint,
                    };
                } else {
                    throw new FeedError('UnexpectedOrcfaxDatumShape');
                }
            } else {
                throw new FeedError('UnexpectedOrcfaxDatumShape');
            }
        } else {
            throw new FeedError('UnexpectedOrcfaxDatumShape');
        }
    } else {
        throw new FeedError('UnexpectedOrcfaxDatumShape');
    }
}

export function parseOrcfaxName(raw_datum: Datum): string {
    let data = Data.from<Data>(raw_datum);
    if (data instanceof Constr && data.index === 0) {
        let data2 = data.fields[0];
        if (data2 instanceof Map) {
            return data2.get(fromText('name')) as string;
        } else {
            throw new FeedError('UnexpectedOrcfaxDatumShape');
        }
    } else {
        throw new FeedError('UnexpectedOrcfaxDatumShape');
    }
}
