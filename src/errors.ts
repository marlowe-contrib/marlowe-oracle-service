export class BaseError<T extends string> extends Error {
    name:T;

    constructor(name:T) {
        super();
        this.name = name;
        Object.setPrototypeOf(this, BaseError.prototype);
    }
}

type EnvVariables = 'MARLOWE_RUNTIME_URL'
                | 'SIGN_TX_URL'
                | 'NETWORK'
                | 'MAESTRO_API_TOKEN'
                | 'BLOCKFROST_API_KEY'

export class EnvironmentVariableError extends BaseError<EnvVariables> {
    message: string;
    constructor(name:EnvVariables) {
        super(name);
        this.message = 'Missing the following environment variable: ' + name;
        Object.setPrototypeOf(this, EnvironmentVariableError.prototype);
    }
 }

try {
    throw new EnvironmentVariableError('MARLOWE_RUNTIME_URL');
} catch (e) {
    if (e instanceof EnvironmentVariableError) {
        console.log(e.message);
    } else {
        console.log("not custom error")

    }
}
