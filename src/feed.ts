import fetch from "node-fetch";
import { ContractId } from "@marlowe.io/runtime-core";
import { ChoiceId, Bound } from "@marlowe.io/language-core-v1";
import { ApplyInputsRequest } from "@marlowe.io/runtime-lifecycle/dist/esm/api";

type Currency = 'ADA' | 'USD';

type CurrencyPair = {
  source: string,
  from: Currency,
  to: Currency
};

const KnownCurrencyPairs: { [key: string] : CurrencyPair; } = {
  "Coingecko ADAUSD": { source: "coingecko", from: 'ADA', to: 'USD'},
  "Coingecko USDADA": { source: "coingecko", from: 'USD', to: 'ADA'},
};

async function queryCoingecko(from: string, to: string): Promise<any> {
  type CoingeckoResponse = {
    [from: string] : {
      [to: string] : number
    }
  };
  const coingeckoApi = `https://api.coingecko.com/api/v3/simple/price?ids=${from}&vs_currencies=${to}`;
  try {
    const response = await fetch(coingeckoApi, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });
    if (!response.ok) {
      throw new Error(`Error! status: ${response.status}`);
    }
    const result = (await response.json()) as CoingeckoResponse;
    return result[from][to];
  } catch (error) {
    console.log('unexpected error: ', error);
    return 'An unexpected error occurred';
  }
}

function currencyToCoingecko (c : Currency) : string {
  switch (c) {
    case 'ADA' : return "cardano";
    case 'USD' : return "usd";
    default : throw new Error("Unkown currency");
  }
}

async function getCoingeckoPrice (curPair : CurrencyPair, bounds: Bound) : Promise<any> {
  const from = currencyToCoingecko(curPair.from);
  const to = currencyToCoingecko(curPair.to);
  var scaledResult = 0n;
  if (curPair.from == 'ADA') {
    const result = await queryCoingecko(from, to);
    scaledResult = BigInt(result * 100000);
  }
  else {
    const result = await queryCoingecko(to, from);
    scaledResult =  BigInt((1 / result) * 100000);
  }
  if (scaledResult >= bounds.from && scaledResult <= bounds.to) {
    return scaledResult
  } else {
    throw new Error("Feed result is out of bounds")
  }
}

type OracleRequest = {
  contractId: ContractId;
  choiceId: ChoiceId;
  choiceBounds: Bound;
  invalidBefore: Date;
  invalidHereafter: Date;
};

// Promise<[ContractId, ApplyInputsRequest]>
export async function feed(request: OracleRequest): Promise<number> {
  const curPair = KnownCurrencyPairs[request.choiceId.choice_name];
  switch (curPair.source) {
    case 'Coingecko':
      const price = getCoingeckoPrice(curPair, request.choiceBounds);
      break;
  }

  // add price to the applyInputs !!
  // return [request.contractId]
  return 0;
}