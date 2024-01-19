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
    Lucid,
    UTxO,
    OutRef,
    PrivateKey,
} from 'lucid-cardano';

import { ConfigError } from './error.ts';
import { configLogger } from './logger.ts';
import { PolicyId } from 'marlowe-language-core-v1-txpipe';

/**
 * Configuration for decentralized oracles method.
 * Includes:
 * - ChoiceName it resolves,
 * - RoleName it answers to,
 * - the UTxO Ref of the  Bridge validator
 * - the address of the Bridge validator
 * - the address of the decentralized oracle's feed
 * - the asset class of the token that identifies the dec oracle feed UTx0.
 */
export type OracleConfig<T> = {
    choiceName: ChoiceName;
    roleName: string;
    bridgeValidatorUtxo: T;
    bridgeAddress: string;
    feedAddress: string;
    feedPolicyId: PolicyId;
    feedTokenName: string | undefined;
};

/**
 * Configuration for the address method.
 * Includes the address of the MOS and the Choice Names it resolves.
 */
export type AddressConfig = {
    mosAddress: Address;
    choiceNames: ChoiceName[];
};

/**
 * Structure for configuration of the different resolve methods.
 */
export type ResolveMethod<T> = {
    address: AddressConfig | undefined;
    charli3: OracleConfig<T> | undefined;
    orcfax: OracleConfig<T> | undefined;
};

/**
 * Configuration structure for the Marlowe Oracle Service.
 * Specifies delay (milliseconds) and resolution methods.
 */
export type MOSConfig<T> = {
    delay: number;
    tags: string[];
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
    applyUrl: string;
};

/**
 * Retrieves and constructs the Marlowe Oracle Service environment configuration:
 * - MARLOWE_RUNTIME_URL
 * - NETWORK
 * - MAESTRO_API_TOKEN xor BLOCKFROST_API_KEY
 * - SIGNING_KEY
 * - MARLOWE_VALIDATOR_ADDRESS
 * - MARLOWE_VALIDATOR_UTXO_REF
 * - APPLY_URL
 * @returns Marlowe Oracle Service environment configuration
 * @throws ConfigError InvalidUTxORefForMarloweValidator
 */
function getMOSEnv(): MOSEnv<OutRef> {
    const mrUrl = getEnvValue('MARLOWE_RUNTIME_URL');
    const network = getEnvValue('NETWORK');
    const provider = getProviderEnvValue(network as Network);
    const signingKey = getEnvValue('SIGNING_KEY');
    const mvAddress = getEnvValue('MARLOWE_VALIDATOR_ADDRESS');
    const mvUtxoRef = getEnvValue('MARLOWE_VALIDATOR_UTXO_REF');
    const applyUrl = getEnvValue('APPLY_URL');

    const [txHash, outIndex] = mvUtxoRef.split('#');

    if (!txHash || !outIndex)
        throw new ConfigError('InvalidUTxORefForMarloweValidator');

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
        applyUrl: applyUrl,
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
 * - APPLY_URL
 * @returns Marlowe Oracle Service validated environment configuration
 * @throws ConfigError MissingEnvironmentVariable
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
        configLogger.error(error);
    }

    return fromFileMOSConfig(args);
}

// Helpers

/**
 * Retrieves the value of the specified environment variable.
 * @param key The name of the environment variable to retrieve.
 * @returns The value of the specified environment variable.
 * @throws ConfigError MissingEnvironmentVariable
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
 * @throws ConfigError UnknownNetwork
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
 * @throws ConfigError MoreThanOneProviderVariable
 * @throws ConfigError MissingProviderEnvironmentVariable
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
 * @throws Error NoResolveMethodDefined
 * @throws Error ErrorFetchingOrParsingJSON
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
        configLogger.error('Error fetching or parsing JSON:', error);
        throw new ConfigError('ErrorFetchingOrParsingJSON');
    }
}

/**
 * Retrieves a UTxO (Unspent Transaction Output) based on the provided OutRef and address criteria.
 * The UTxO must contain a script reference that matches the provided address.
 * @param lucid The Lucid object used for interacting with the system.
 * @param utxoRef The OutRef specifying the Unspent Transaction Output reference.
 * @param address The address to match with the calculated address from the UTxO's scriptRef.
 * @returns A Promise resolving to the UTxO that meets the criteria.
 * @throws ConfigError UTxONotFound
 * @throws ConfigError CalculatedValidatorAddressDoesNotMatchGivenOne
 */
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
        throw new ConfigError(
            'CalculatedValidatorAddressDoesNotMatchGivenOne',
            `
            Given:                  ${address}
            Calculated from script: ${calculatedAddress}
            `
        );

    return utxo;
}

/**
 * Sets the Oracle configuration in the MOSConfig by retrieving the bridge UTxO if needed.
 * @param mc The MOSConfig containing the Oracle configuration with OutRefs.
 * @param lucid The Lucid object used for interacting with the system.
 * @returns A Promise resolving to the updated MOSConfig with UTxO.
 */
export async function setOracleConfig(
    mc: MOSConfig<OutRef>,
    lucid: Lucid
): Promise<MOSConfig<UTxO>> {
    let charli3BridgeUtxo;
    let orcfaxBridgeUtxo;
    if (mc.resolveMethod.charli3) {
        charli3BridgeUtxo = await getUTxOWithScriptRef(
            lucid,
            mc.resolveMethod.charli3.bridgeValidatorUtxo,
            mc.resolveMethod.charli3.bridgeAddress
        );
    }
    if (mc.resolveMethod.orcfax) {
        orcfaxBridgeUtxo = await getUTxOWithScriptRef(
            lucid,
            mc.resolveMethod.orcfax.bridgeValidatorUtxo,
            mc.resolveMethod.orcfax.bridgeAddress
        );
    }
    if (charli3BridgeUtxo || orcfaxBridgeUtxo) {
        return {
            ...mc,
            resolveMethod: {
                ...mc.resolveMethod,
                ...(mc.resolveMethod.charli3 && {
                    charli3: {
                        ...mc.resolveMethod.charli3,
                        bridgeValidatorUtxo: charli3BridgeUtxo,
                    },
                }),
                ...(mc.resolveMethod.orcfax && {
                    orcfax: {
                        ...mc.resolveMethod.orcfax,
                        bridgeValidatorUtxo: orcfaxBridgeUtxo,
                    },
                }),
            },
        } as MOSConfig<UTxO>;
    } else {
        return mc as MOSConfig<UTxO>;
    }
}

/**
 * Sets the Marlowe UTxO within the MOSEnv by retrieving the Marlowe validator UTxO.
 * @param mosenv The MOSEnv containing Marlowe-specific UTxO references.
 * @param lucid The Lucid object used for interacting with the system.
 * @returns A Promise resolving to the updated MOSEnv with UTxO.
 */
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
