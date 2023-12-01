import fetch from "node-fetch";
import { ContractId } from "@marlowe.io/runtime-core";
import { ChoiceId, Bound, Input, InputContent, IChoice } from "@marlowe.io/language-core-v1";
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
  const cgApi =`https://api.coingecko.com/api/v3/simple/price?ids=${from}&vs_currencies=${to}`;
  try {
    const response = await fetch(cgApi, {
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

async function getCoingeckoPrice (curPair : CurrencyPair, bounds: Bound)
  : Promise<bigint> {
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

function makeInput (cId: ChoiceId, price: bigint): Input {
  const inputChoice: IChoice = {
    for_choice_id: cId,
    input_that_chooses_num: price
  }
  const inputContent: InputContent = inputChoice;
  const input: Input = inputContent;
  return input;
}

type OracleRequest = {
  contractId: ContractId;
  choiceId: ChoiceId;
  choiceBounds: Bound;
  invalidBefore: Date;
  invalidHereafter: Date;
};

export async function feed(request: OracleRequest): Promise<[ContractId, ApplyInputsRequest]> {
  const curPair = KnownCurrencyPairs[request.choiceId.choice_name];
  let price = 0n;
  switch (curPair.source) {
    case 'Coingecko':
      price = await getCoingeckoPrice(curPair, request.choiceBounds);
      break;
    }

  const input: Input = makeInput(request.choiceId, price) ;

  const air: ApplyInputsRequest = {
    inputs: [input],
    tags: {},
    metadata: {},
    invalidBefore: request.invalidBefore,
    invalidHereafter: request.invalidHereafter
  }

  return [request.contractId, air];
}