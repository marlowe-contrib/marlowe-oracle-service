/**
 * Base class for custom Error objects
 */
export class BaseError<T extends string> extends Error {
    name:T;
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
export class ConfigError extends BaseError<ConfigErrorNames> { }

type ConfigErrorNames =
      'MissingEnvironmentVariable'
    | 'MissingProviderEnvironmentVariable'
    | 'MoreThanOneProviderVariable'
    | 'UnknownNetwork'
    | 'ErrorFetchingOrParsingJSON'

