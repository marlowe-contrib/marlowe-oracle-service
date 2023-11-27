import fetch from "node-fetch";

export async function signTx(cborHex : string) {
  try {
    const response = await fetch('http://localhost:3000/sign', {
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
