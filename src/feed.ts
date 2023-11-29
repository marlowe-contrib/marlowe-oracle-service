import fetch from "node-fetch";

type Currency = 'ADA' | 'USD'

type CurrencyPair = {
  from: Currency,
  to: Currency
}

const KnownCurrencyPairs: { [key: string] : CurrencyPair; } = {
    "Coingecko ADAUSD": { from: 'ADA', to: 'USD'},
    "Coingecko USDADA": { from: 'USD', to: 'ADA'},
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
   }
}

export async function getCoingeckoPrice (cn : string) : Promise<any> {
  const curPair = KnownCurrencyPairs[cn];
  const from = currencyToCoingecko(curPair.from);
  const to = currencyToCoingecko(curPair.to);
  const result = await queryCoingecko(from, to);
  console.log(result);
}

getCoingeckoPrice("Coingecko ADAUSD");