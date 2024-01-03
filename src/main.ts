import { Lucid, MaestroConfig } from 'lucid-cardano';
import { mkRestClient } from 'marlowe-runtime-rest-client-txpipe';

import {
    parseMOSConfig,
    parseMOSEnv,
    setOracleConfig,
    setMarloweUTxO,
} from './config.ts';
import { getActiveContracts } from './scan.ts';
import { getApplyInputs } from './feed.ts';
import { buildAndSubmit } from './tx.ts';
import { ConfigError, RequestError } from './error.ts';
import { mosLogger, configLogger, scanLogger } from './logger.ts';

export async function main() {
    try {
        const rawMosConfig = await parseMOSConfig();
        const rawMosEnv = parseMOSEnv();

        const lucid = await Lucid.new(rawMosEnv.provider, rawMosEnv.network);
        lucid.selectWalletFromPrivateKey(rawMosEnv.signingKey);
        const client = mkRestClient(rawMosEnv.marloweRuntimeUrl);

        const mosConfig = await setOracleConfig(rawMosConfig, lucid);

        if (!mosConfig.resolveMethod.address)
            throw new Error('NoAddressConfig');

        const mosEnv = await setMarloweUTxO(rawMosEnv, lucid);

        configLogger.debug(mosConfig);
        configLogger.debug(mosEnv);

        do {
            const activeContracts = await getActiveContracts(
                client,
                mosConfig.resolveMethod.address.mosAddress,
                mosConfig.resolveMethod.address.choiceNames
            );

            const applicableInputs = await getApplyInputs(
                mosConfig.resolveMethod.address.mosAddress,
                activeContracts
            );

            await buildAndSubmit(client, lucid, applicableInputs, mosEnv);

            await new Promise((r) => setTimeout(r, mosConfig.delay));
        } while (true);
    } catch (e) {
        if (e instanceof ConfigError) {
            mosLogger.error(e.name, e.message);
            return;
        } else if (e instanceof RequestError) {
            mosLogger.error(e.name, e.message);
            if (e.name == '404') {
                return;
            }
        } else {
            mosLogger.error(e);
        }
    }
}
