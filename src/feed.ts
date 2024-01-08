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

import { OracleRequest } from './scan.ts';
import { FeedError, RequestError } from './error.ts';
import { feedLogger } from './logger.ts';
import { Lucid, UTxO } from 'lucid-cardano';
import { OracleConfig, ResolveMethod } from './config.ts';
import { Option, none, some } from 'fp-ts/lib/Option.js';

type Currency = 'ADA' | 'USD';

type CurrencyPair = {
    source: string;
    from: Currency;
    to: Currency;
};

export type ApplyInputsToContractRequest = {
    contractId: ContractId,
    changeAddress: AddressBech32,
    inputs: Input[],
    invalidBefore: Date,
    invalidHereafter: Date
    // bridgeUTxO: Option<UTxO>,
    oracleUTxO: Option<UTxO>
}
/**
 * @description Currency pairs for which information can be provided by the respective sources
 */
const KnownCurrencyPairs = new Map([
    ['Coingecko ADAUSD', { source: 'Coingecko', from: 'ADA', to: 'USD' }],
    ['Coingecko USDADA', { source: 'Coingecko', from: 'USD', to: 'ADA' }],
    ['Charli3 ADAUSD', { source: 'Charli3', from: 'USD', to: 'ADA' }],
]);

/**
 * @param mosAddress The address of the MOS
 * @param request Necessary information about the feed to provide and the Contract
 * that requires it.
 * @returns A list of apply inputs, ready to be used on the applyInputsToContract endpoint.
 */
export async function getApplyInputs(
    requests: OracleRequest[],
    resMethods: ResolveMethod<UTxO>,
    lucid: Lucid
): Promise<ApplyInputsToContractRequest[]> {
    const priceMap = await setPriceMap(requests, resMethods, lucid);

    if (!resMethods.address || !resMethods.address.mosAddress)
        throw new Error('No Address set');

    const mosAddress = resMethods.address.mosAddress.address;
    const feeds = requests.map(async (request) => {
        const [input, utxo] = await feed(request, priceMap);
        const air: ApplyInputsToContractRequest = {
            contractId: request.contractId,
            changeAddress: addressBech32(mosAddress),
            inputs: [input],
            invalidBefore: request.invalidBefore,
            invalidHereafter: request.invalidHereafter,
            // bridgeUTxO: request.bridgeUTxO,
            oracleUTxO: utxo

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
): Promise<[Input, Option<UTxO>]> {
    try {
        const cn = request.choiceId.choice_name;
        const curPair = KnownCurrencyPairs.get(cn);
        if (!curPair) throw new FeedError('UnknownCurrencyPairOrSource', cn);

        const [price, utxo] = priceMap[cn];

        if (!(price || utxo))
            throw new FeedError('PriceUndefinedForChoiceName', cn);

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

type PriceMap = Record<string, [bigint, Option<UTxO>]>

/**
 * Queries and creates a map that stores the price for every ChoiceName, to
 * avoid having to query the source multiple times for the same choice names.
 * @param requests List of Oracle Requests
 * @returns Record containing the price for each ChoiceName
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

    let priceMap: PriceMap= {};
    for (const cn of requestedCN) {
        const curPair = KnownCurrencyPairs.get(cn);
        if (!curPair) throw new FeedError('UnknownCurrencyPairOrSource');

        let [price, utxo]: [bigint, Option<UTxO>] = [0n, none];
        switch (curPair.source) {
            case 'Coingecko':
                price = await getCoingeckoPrice(curPair as CurrencyPair);
                break;
            case 'Charli3':
                if (!resMethods.charli3) throw new Error('No charli3 config');

                [price, utxo] = await getCharli3Price(
                    curPair as CurrencyPair,
                    resMethods.charli3,
                    lucid
                );
                break;
        }
        priceMap[cn] = [price, utxo]
    }

    return priceMap;
}

async function getCharli3Price(
    curPair: CurrencyPair,
    c3Config: OracleConfig<UTxO>,
    lucid: Lucid
): Promise<[bigint, Option<UTxO>]> {
    const charli3Utxo = await lucid.utxosAt(c3Config.feedAddress);

    const feedUtxo = charli3Utxo.filter((utxo) =>
        utxo.assets[c3Config.feedAssetClass] === 1n
    );

    if (!feedUtxo[0]) throw new Error('UtxoWOracleFeedNotFound');
    if (!feedUtxo[0].datum) throw new Error('UtxoWOracleFeedDoesNotHaveDatum');

    const price: bigint = parseDatum(feedUtxo[0].datum);

    return [price, some(feedUtxo[0])];
}

function parseDatum(datum: string): bigint {
    return 0n;
}

