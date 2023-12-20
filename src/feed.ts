import fetch from 'node-fetch';
import { addressBech32 } from '@marlowe.io/runtime-core';
import { ChoiceId, Bound, Input, IChoice } from '@marlowe.io/language-core-v1';
import { Address } from 'marlowe-language-core-v1-txpipe';
import { ApplyInputsToContractRequest } from 'marlowe-runtime-rest-client-txpipe/dist/esm/contract/transaction/endpoints/collection';
import { OracleRequest } from './scan.ts';
import { FeedError, RequestError } from './error.ts';

type Currency = 'ADA' | 'USD';

type CurrencyPair = {
    source: string;
    from: Currency;
    to: Currency;
};

/**
 * @description Currency pairs for which information can be provided by the respective sources
 */
const KnownCurrencyPairs: { [key: string]: CurrencyPair } = {
    'Coingecko ADAUSD': { source: 'Coingecko', from: 'ADA', to: 'USD' },
    'Coingecko USDADA': { source: 'Coingecko', from: 'USD', to: 'ADA' },
};

/**
 * @param mosAddress The address of the MOS
 * @param request Necessary information about the feed to provide and the Contract
 * that requires it.
 * @returns A list of apply inputs, ready to be used on the applyInputsToContract endpoint.
 */
export async function getApplyInputs(
    mosAddress: Address,
    requests: OracleRequest[]
): Promise<ApplyInputsToContractRequest[]> {
    const feeds = requests.map(async (request) => {
        const input = await feed(request);
        const air: ApplyInputsToContractRequest = {
            contractId: request.contractId,
            changeAddress: addressBech32(mosAddress.address),
            inputs: [input],
            metadata: {},
            invalidBefore: request.invalidBefore,
            invalidHereafter: request.invalidHereafter,
        };
        return air;
    });
    const psFeeds = await Promise.allSettled(feeds);

    const fulfilled: ApplyInputsToContractRequest[] = [];

    psFeeds.map((res, idx) => {
        if (res.status === 'fulfilled') {
            fulfilled.push(res.value);
        } else {
            console.log(res);
        }
    });

    return fulfilled;
}

/**
 * @param request Necessary information about the feed to provide and the Contract
 * that requires it.
 * @returns contractId (of the contract that requested input) and ApplyRequestInputs
 * (complete inputs to be applied to it).
 * @throws FeedError UnkownCurrencyPairOrSource
 */
async function feed(request: OracleRequest): Promise<Input> {
    try {
        const curPair = KnownCurrencyPairs[request.choiceId.choice_name];
        if (!curPair)
            throw new FeedError(
                'UnknownCurrencyPairOrSource',
                request.choiceId.choice_name
            );
        let price = 0n;
        switch (curPair.source) {
            case 'Coingecko':
                price = await getCoingeckoPrice(curPair, request.choiceBounds);
                break;
        }

        const input: Input = makeInput(request.choiceId, price);
        return input;
    } catch (e) {
        if (e instanceof FeedError) {
            console.log(e.name, e.message);
            return Promise.reject(e.name + e.message);
        } else {
            return Promise.reject(e);
        }
    }
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
    const cgApi = `https://api.coingecko.com/api/v3/simple/price?ids=cardano&vs_currencies=usd`;
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
 * Provides the price of a requested currencyPair via Coingecko. The price is returned
 * multiplied by 100_000_000
 * @param curPair Currency pair for the the desired exchange price
 * @param bounds Numeric limits that the price has to be confied within
 * @returns price as a scaled BigInt
 * @throws FeedError ResultIsOutOfBounds
 * @throws FeedError UnknownCurrencyPair
 */
async function getCoingeckoPrice(
    curPair: CurrencyPair,
    bounds: Bound[]
): Promise<bigint> {
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
            break;
        }
    }
    if (withinBounds(scaledResult, bounds)) {
        return scaledResult;
    } else {
        throw new FeedError('FeedResultIsOutOfBounds');
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
