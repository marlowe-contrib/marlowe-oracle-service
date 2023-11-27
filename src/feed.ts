import fetch from "node-fetch";

const CurrencyPair: { [key: string] : [string, string]; } = {
    "ADAUSD": ["CARDANO", "USD"],
    "USDADA": ["USD", "CAD"]
};

async function queryFeed(c: string): Promise<any> {
    const coingeckoApi = `https://api.coingecko.com/api/v3/simple/price?ids=${CurrencyPair[c][0]}&vs_currencies=${CurrencyPair[c][1]}`
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
        const result = (await response.json());
        return result;
      } catch (error) {
        console.log('unexpected error: ', error);
        return 'An unexpected error occurred';
      }
}

console.log(await queryFeed("ADAUSD"))
