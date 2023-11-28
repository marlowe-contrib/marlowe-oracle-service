import fetch from "node-fetch";

type Currency = 'ADA' | 'USD'

type CurrencyPair = {
  from: Currency,
  to: Currency
}


const KnownCurrencyPairs: { [key: string] : CurrencyPair; } = {
    "Coingecko ADAUSD": { from: 'ADA', to: 'USD'},
    "Coingeckp USDADA": { from: 'USD', to: 'ADA'},
};

async function queryCoingecko(from: string, to: string): Promise<any> {
    const coingeckoApi = `https://api.coingecko.com/api/v3/simple/price?ids=${from}&vs_currencies=${to}`
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
        // Maybe add the parsing of this response here ?
        // CG API returns :  { base: { quote: price } }
        const result = (await response.json());
        return result;
      } catch (error) {
        console.log('unexpected error: ', error);
        return 'An unexpected error occurred';
      }
}

function currencyToCoingecko (c : Currency) : string {
   switch (c) {
    case 'ADA' : return "CARDANO";
    case 'USD' : return "USD";
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