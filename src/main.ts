import { Lucid } from 'lucid-cardano';
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
import { fromNullable } from 'fp-ts/lib/Option.js';

export async function main() {
    try {
        const rawMosConfig = await parseMOSConfig();
        const rawMosEnv = parseMOSEnv();

        const lucid = await Lucid.new(rawMosEnv.provider, rawMosEnv.network);
        lucid.selectWalletFromPrivateKey(rawMosEnv.signingKey);
        const client = mkRestClient(rawMosEnv.marloweRuntimeUrl);

        const mosConfig = await setOracleConfig(rawMosConfig, lucid);
        const mosEnv = await setMarloweUTxO(rawMosEnv, lucid);

        configLogger.debug(mosConfig);
        configLogger.debug(mosEnv);

        do {
            const activeContracts = await getActiveContracts(
                client,
                lucid,
                mosConfig.resolveMethod,
                mosConfig.tags
            );

            const applicableInputs = await getApplyInputs(
                activeContracts,
                mosConfig.resolveMethod,
                lucid
            );

            await buildAndSubmit(
                client,
                lucid,
                applicableInputs,
                mosEnv,
                fromNullable(
                    mosConfig.resolveMethod.charli3?.bridgeValidatorUtxo
                )
            );

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
