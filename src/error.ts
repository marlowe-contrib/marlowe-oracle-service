import { AxiosError } from 'axios';

/**
 * Base class for custom Error objects
 */
export class BaseError<T extends string> extends Error {
    name!: T;
    message!: string;

    constructor(name: T, message?: string) {
        super();
        this.name = name;
        if (message) {
            this.message = message;
        }
        Object.setPrototypeOf(this, BaseError.prototype);
    }
}

/**
 *  Errors from the config module.
 */
export class ConfigError extends BaseError<ConfigErrorNames> {
    constructor(name: ConfigErrorNames, message?: string) {
        super(name, message);
        Object.setPrototypeOf(this, ConfigError.prototype);
    }
}

type ConfigErrorNames =
    | 'MissingEnvironmentVariable'
    | 'MissingProviderEnvironmentVariable'
    | 'MoreThanOneProviderVariable'
    | 'UnknownNetwork'
    | 'ErrorFetchingOrParsingJSON'
    | 'UTxONotFound'
    | 'ScriptRefNotFoundInUTxO'
    | 'CalculatedValidatorAddressDoesNotMatchGivenOne'
    | 'NoResolveMethodDefined'
    | 'InvalidUTxORefForMarloweValidator';

/**
 *  Errors from the scan module.
 */
export class ScanError extends BaseError<string> {
    constructor(name: string, message?: string) {
        super(name, message);
        Object.setPrototypeOf(this, ScanError.prototype);
    }
}

/**
 *  Errors from the feed module.
 */
export class FeedError extends BaseError<FeedErrorNames> {
    constructor(name: FeedErrorNames, message?: string) {
        super(name, message);
        Object.setPrototypeOf(this, FeedError.prototype);
    }
}

type FeedErrorNames =
    | 'UnknownCurrencyPair'
    | 'UnknownCurrencyPairOrSource'
    | 'FeedResultIsOutOfBounds'
    | 'UnknownBaseCurrencyForCGQuery'
    | 'UnknownQuoteCurrencyForCGQuery'
    | 'PriceUndefinedForChoiceName'
    | 'UnknownError'
    | 'UtxoWOracleFeedNotFound'
    | 'UtxoWOracleFeedDoesNotHaveDatum'
    | 'UnexpectedCharli3DatumShape'
    | 'Charli3PriceExpired';

/**
 * Errors from the tx module.
 */
export class BuildTransactionError extends BaseError<BuildTransactionErrorNames> {
    constructor(name: BuildTransactionErrorNames, message?: string) {
        super(name, message);
        Object.setPrototypeOf(this, RequestError.prototype);
    }
}

type BuildTransactionErrorNames =
    | 'NoDatumsFoundInTransaction'
    | 'NoDatumFoundForDatumHash'
    | 'NoRedeemerInTransaction.ExpectedOne'
    | 'MoreThanOneRedeemerInTransaction.ExpectedJustOne'
    | 'NoTransactionInputFoundOnInputsList'
    | 'MarloweOutputWithoutDatum'
    | 'MoreThanOneMarloweContractOutput'
    | 'NoDatumFoundOnUTxO';

/**
 * Http requests errors.
 */
export class RequestError extends BaseError<string> {
    extra!: unknown;
    constructor(name: string, message: string, extra?: unknown) {
        super(name, message);
        this.extra = extra;
        Object.setPrototypeOf(this, RequestError.prototype);
    }
}

export function throwAxiosError(e: AxiosError) {
    if (e.response) {
        const errorName = e.response?.status;
        const errorStatus = e.response?.statusText;
        const errorMessage = e.response?.data;
        throw new RequestError(`${errorName}`, errorStatus, errorMessage);
    }
}
