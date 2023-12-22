import { readFileSync } from 'fs';
import { Command } from 'commander';
import figlet from 'figlet';

import { Address, ChoiceName } from 'marlowe-language-core-v1-txpipe';

import {
    Network,
    Provider,
    Maestro,
    Blockfrost,
    MaestroSupportedNetworks,
    Unit,
    Lucid,
    UTxO,
} from 'lucid-cardano';

import { ConfigError } from './error.ts';

type UTxORef = {
    txHash: string;
    outputIndex: number;
};

type OracleConfig<T> = {
    choiceNames: ChoiceName;
    roleNames: string;
    bridgeUtxo: T;
    bridgeAddress: string;
    feedAddress: string;
    feedAssetClass: Unit;
};

type AddressConfig = {
    mosAddress: Address;
    choiceNames: ChoiceName[];
};

type ResolveMethod<T> = {
    address: AddressConfig | undefined;
    charli3: OracleConfig<T> | undefined;
};

/**
 * Configuration structure for the Marlowe Oracle Service.
 * Specifies delay (milliseconds), resolution method, and choice names.
 */
type MOSConfig<T> = {
    delay: number;
    resolveMethod: ResolveMethod<T>;
};

/**
 * Environment configuration required for the Marlowe Oracle Service.
 * Includes Marlowe Runtime and Signing Service URL, network information, and
 * provider details for the service.
 */
type MOSEnv = {
    marloweRuntimeUrl: string;
    signTxUrl: string;
    network: Network;
    provider: Provider;
};

/**
 * Retrieves and constructs the Marlowe Oracle Service environment configuration:
 * - MARLOWE_RUNTIME_URL
 * - SIGN_TX_URL
 * - NETWORK
 * - MAESTRO_API_TOKEN xor BLOCKFROST_API_KEY
 * @returns Marlowe Oracle Service environment configuration
 */
function getMOSEnv(): MOSEnv {
    const mrUrl = getEnvValue('MARLOWE_RUNTIME_URL');
    const signUrl = getEnvValue('SIGN_TX_URL');
    const network = getEnvValue('NETWORK');
    const provider = getProviderEnvValue(network as Network);

    return {
        marloweRuntimeUrl: mrUrl,
        signTxUrl: signUrl,
        network: network as Network,
        provider: provider,
    };
}

/**
 * Parses the Marlowe Oracle Service environment configuration and validates the
 * required environment variables.
 * Throws an error if any required environment variable is missing.
 * - MARLOWE_RUNTIME_URL
 * - SIGN_TX_URL
 * - NETWORK
 * - MAESTRO_API_TOKEN xor BLOCKFROST_API_KEY
 * @returns Marlowe Oracle Service validated environment configuration
 * @throws Error
 */
export function parseMOSEnv(): MOSEnv {
    const mosEnv = getMOSEnv();
    const providers = ['MAESTRO_API_TOKEN', 'BLOCKFROST_API_KEY'];

    for (const [key, value] of Object.entries(mosEnv)) {
        if (providers.includes(key.toString()) || value === undefined) {
            throw new ConfigError('MissingEnvironmentVariable', key);
        }
    }

    return mosEnv;
}

/**
 * Parses the Marlowe Oracle Service configuration from a file.
 * @param filePath The path to the Marlowe Oracle Service configuration file.
 * @returns A promise resolving to the parsed MOS configuration.
 * @throws Error Throws an error if there's an issue reading or parsing the file.
 */
export async function parseMOSConfig(): Promise<MOSConfig<UTxORef>> {
    let args = '';
    const program = new Command();
    console.log(figlet.textSync('Marlowe Oracle Service'));

    program.showHelpAfterError();

    program
        .description('Service for integrating oracles with Marlowe contracts')
        .version('0.0.1');

    program.argument(
        '<filepath>',
        'Marlowe Oracle Service config file',
        (fp) => {
            args = fp;
        }
    );

    try {
        program.parse(process.argv);
    } catch (error) {
        console.log(error);
    }

    return fromFileMOSConfig(args);
}

// Helpers

/**
 * Retrieves the value of the specified environment variable.
 * @param key The name of the environment variable to retrieve.
 * @returns The value of the specified environment variable.
 * @throws Error Throws an error if the specified environment variable is missing.
 */
function getEnvValue(key: string): string {
    if (process.env[key] === undefined) {
        throw new ConfigError('MissingEnvironmentVariable', key);
    }
    return process.env[key] as string;
}

/**
 * Generates the Blockfrost API URL based on the specified network.
 * @param network The network for which the Blockfrost API URL is required.
 * @returns The Blockfrost API URL corresponding to the given network.
 * @throws Error Throws an error if the provided network is unknown.
 */
function networkToBlockfrostUrl(network: Network): string {
    let url = '';
    if (network === 'Mainnet') {
        url = 'https://cardano-mainnet.blockfrost.io/api/v0';
    } else if (network === 'Preprod') {
        url = 'https://cardano-preprod.blockfrost.io/api/v0';
    } else if (network === 'Preview') {
        url = 'https://cardano-preview.blockfrost.io/api/v0';
    } else {
        throw new ConfigError('UnknownNetwork', network);
    }
    return url;
}

/**
 * Creates the provider based on the specified network from environment variables.
 * @param network The network for which the provider needs to be determined.
 * @returns The provider instance based on the provided network.
 * @throws Error Throws an error if there are conflicting or missing provider environment variables.
 */
function getProviderEnvValue(network: Network): Provider {
    const maestroApiToken = process.env.MAESTRO_APITOKEN;
    const blockfrostApiKey = process.env.BLOCKFROST_APIKEY;
    const tokens: Array<string | undefined> = [
        maestroApiToken,
        blockfrostApiKey,
    ];

    if (tokens.filter((t) => t !== undefined).length > 1) {
        throw new ConfigError('MoreThanOneProviderVariable');
    } else if (maestroApiToken !== undefined) {
        return new Maestro({
            network: network as MaestroSupportedNetworks,
            apiKey: maestroApiToken,
            turboSubmit: false,
        });
    } else if (blockfrostApiKey !== undefined) {
        return new Blockfrost(
            networkToBlockfrostUrl(network),
            blockfrostApiKey
        );
    } else {
        throw new ConfigError(
            'MissingProviderEnvironmentVariable',
            'MAESTRO_APITOKEN or BLOCKFROST_APIKEY'
        );
    }
}

/**
 * Parses the Marlowe Oracle Service configuration from a file path.
 * @param filePath The path to the Marlowe Oracle Service configuration file.
 * @returns A promise resolving to the parsed MOS configuration.
 * @throws Error Throws an error if there's an issue reading or parsing the file.
 */
async function fromFileMOSConfig(
    filePath: string
): Promise<MOSConfig<UTxORef>> {
    try {
        const fileContent = readFileSync(filePath, 'utf-8');
        const json = JSON.parse(fileContent);
        const parsedData = json as MOSConfig<UTxORef>;

        return parsedData;
    } catch (error) {
        console.error('Error fetching or parsing JSON:', error);
        throw new ConfigError('ErrorFetchingOrParsingJSON');
    }
}

export async function setOracleConfig(
    lucid: Lucid,
    mc: MOSConfig<UTxORef>
): Promise<MOSConfig<UTxO>> {
    if (!(mc.resolveMethod.address || mc.resolveMethod.charli3))
        throw new Error('NoResolveMethodDefined');

    if (!mc.resolveMethod.charli3) return Promise.reject('NoCharli3Config');

    const bridgeUtxo: UTxO = (
        await lucid.utxosByOutRef([
            {
                txHash: mc.resolveMethod.charli3.bridgeUtxo.txHash,
                outputIndex: mc.resolveMethod.charli3.bridgeUtxo.outputIndex,
            },
        ])
    )[0];

    if (!bridgeUtxo) throw new ConfigError('UTxONotFound');

    if (!bridgeUtxo.scriptRef) throw new ConfigError('ScriptRefNotFoundInUTx0');

    const bridgeAddress = lucid.utils.validatorToAddress(bridgeUtxo.scriptRef);

    if (bridgeAddress != mc.resolveMethod.charli3.bridgeAddress)
        throw new ConfigError('CalculatedBridgeAddressDoesNotMatchConfigOne');

    return {
        ...mc,
        resolveMethod: {
            ...mc.resolveMethod,
            charli3: {
                ...mc.resolveMethod.charli3,
                bridgeUtxo: bridgeUtxo,
            },
        },
    };
}
