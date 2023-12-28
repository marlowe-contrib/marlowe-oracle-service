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
    OutRef,
    PrivateKey,
} from 'lucid-cardano';

import { ConfigError } from './error.ts';

/**
 * Configuration for decentralized oracles method.
 * Includes:
 * - ChoiceNames it resolves,
 * - RoleNames it answers to,
 * - the UTxO Ref of the  Bridge validator
 * - the address of the Bridge validator
 * - the address of the decentralized oracle's feed
 * - the asset class of the token that identifies the dec oracle feed UTx0.
 */
type OracleConfig<T> = {
    choiceNames: ChoiceName;
    roleNames: string;
    bridgeUtxo: T;
    bridgeAddress: string;
    feedAddress: string;
    feedAssetClass: Unit;
};

/**
 * Configuration for the address method.
 * Includes the address of the MOS and the Choice Names it resolves.
 */
type AddressConfig = {
    mosAddress: Address;
    choiceNames: ChoiceName[];
};

/**
 * Structure for configuration of the different resolve methods.
 */
type ResolveMethod<T> = {
    address: AddressConfig | undefined;
    charli3: OracleConfig<T> | undefined;
};

/**
 * Configuration structure for the Marlowe Oracle Service.
 * Specifies delay (milliseconds) and resolution methods.
 */
type MOSConfig<T> = {
    delay: number;
    resolveMethod: ResolveMethod<T>;
};

/**
 * Environment configuration required for the Marlowe Oracle Service.
 * Includes Marlowe Runtime URL, network information, and
 * provider details for the service.
 */
export type MOSEnv<T> = {
    marloweRuntimeUrl: string;
    network: Network;
    provider: Provider;
    signingKey: PrivateKey;
    marloweValidatorAddress: string;
    marloweValidatorUtxo: T;
};

/**
 * Retrieves and constructs the Marlowe Oracle Service environment configuration:
 * - MARLOWE_RUNTIME_URL
 * - NETWORK
 * - MAESTRO_API_TOKEN xor BLOCKFROST_API_KEY
 * - SIGNING_KEY
 * - MARLOWE_VALIDATOR_ADDRESS
 * - MARLOWE_VALIDATOR_UTXO_REF
 * @returns Marlowe Oracle Service environment configuration
 */
function getMOSEnv(): MOSEnv<OutRef> {
    const mrUrl = getEnvValue('MARLOWE_RUNTIME_URL');
    const network = getEnvValue('NETWORK');
    const provider = getProviderEnvValue(network as Network);
    const signingKey = getEnvValue('SIGNING_KEY');
    const mvAddress = getEnvValue('MARLOWE_VALIDATOR_ADDRESS');
    const mvUtxoRef = getEnvValue('MARLOWE_VALIDATOR_UTXO_REF');

    const [txHash, outIndex] = mvUtxoRef.split('#');

    return {
        marloweRuntimeUrl: mrUrl,
        network: network as Network,
        provider: provider,
        signingKey: signingKey,
        marloweValidatorAddress: mvAddress,
        marloweValidatorUtxo: {
            txHash: txHash,
            outputIndex: Number(outIndex),
        },
    };
}

/**
 * Parses the Marlowe Oracle Service environment configuration and validates the
 * required environment variables.
 * Throws an error if any required environment variable is missing.
 * - MARLOWE_RUNTIME_URL
 * - NETWORK
 * - MAESTRO_API_TOKEN xor BLOCKFROST_API_KEY
 * - SIGNING_KEY
 * - MARLOWE_VALIDATOR_ADDRESS
 * - MARLOWE_VALIDATOR_UTXO_REF
 * @returns Marlowe Oracle Service validated environment configuration
 * @throws Error
 */
export function parseMOSEnv(): MOSEnv<OutRef> {
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
export async function parseMOSConfig(): Promise<MOSConfig<OutRef>> {
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
async function fromFileMOSConfig(filePath: string): Promise<MOSConfig<OutRef>> {
    try {
        const fileContent = readFileSync(filePath, 'utf-8');
        const json = JSON.parse(fileContent);
        const parsedData = json as MOSConfig<OutRef>;

        if (
            !parsedData.resolveMethod.address &&
            !parsedData.resolveMethod.charli3
        )
            throw new ConfigError('NoResolveMethodDefined');

        return parsedData;
    } catch (error) {
        console.error('Error fetching or parsing JSON:', error);
        throw new ConfigError('ErrorFetchingOrParsingJSON');
    }
}

async function getUTxOWithScriptRef(
    lucid: Lucid,
    utxoRef: OutRef,
    address: string
): Promise<UTxO> {
    const utxo: UTxO = (await lucid.utxosByOutRef([utxoRef]))[0];

    if (!utxo) throw new ConfigError('UTxONotFound');

    if (!utxo.scriptRef) throw new ConfigError('ScriptRefNotFoundInUTxO');

    const calculatedAddress = lucid.utils.validatorToAddress(utxo.scriptRef);

    if (calculatedAddress != address)
        throw new ConfigError('CalculatedValidatorAddressDoesNotMatchGivenOne');

    return utxo;
}

export async function setOracleConfig(
    mc: MOSConfig<OutRef>,
    lucid: Lucid
): Promise<MOSConfig<UTxO>> {
    if (mc.resolveMethod.charli3) {
        const bridgeUtxo: UTxO = await getUTxOWithScriptRef(
            lucid,
            mc.resolveMethod.charli3.bridgeUtxo,
            mc.resolveMethod.charli3.bridgeAddress
        );

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
    } else {
        return mc as MOSConfig<UTxO>;
    }
}

export async function setMarloweUTxO(
    mosenv: MOSEnv<OutRef>,
    lucid: Lucid
): Promise<MOSEnv<UTxO>> {
    const validatorUtxo = await getUTxOWithScriptRef(
        lucid,
        mosenv.marloweValidatorUtxo,
        mosenv.marloweValidatorAddress
    );

    return {
        ...mosenv,
        marloweValidatorUtxo: validatorUtxo,
    };
}
