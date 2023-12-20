import { Lucid, MaestroConfig, UTxO } from 'lucid-cardano';
import { mkRestClient } from 'marlowe-runtime-rest-client-txpipe';
import { Address } from 'marlowe-language-core-v1-txpipe';

import { parseMOSConfig, parseMOSEnv, setOracleConfig } from './config.ts';
import { getActiveContracts } from './scan.ts';
import { getApplyInputs } from './feed.ts';
import { buildAndSubmit } from './tx.ts';
import { ConfigError, RequestError } from './error.ts';

export async function main() {
    try {
        const mosConfig = await parseMOSConfig();
        const mosEnv = parseMOSEnv();

        const lucid = await Lucid.new(mosEnv.provider, mosEnv.network);
        lucid.selectWalletFromPrivateKey('COMPLETE ME');
        const client = mkRestClient(mosEnv.marloweRuntimeUrl);

        const mosAddress: Address = {
            address:
                'addr_test1vzuqvqzcnuy9pmrh2sy7tjucufmpwh8gzssz7v6scn0e04gxdvna9',
        };

        const oracleConfig = await setOracleConfig(lucid, mosConfig);

        do {
            const activeContracts = await getActiveContracts(
                client,
                mosAddress,
                mosConfig.choiceNames
            );

            const applicableInputs = await getApplyInputs(
                mosAddress,
                activeContracts
            );
            console.log(applicableInputs);
            const txHash = await buildAndSubmit(
                client,
                lucid,
                applicableInputs
            );
            console.log('TxHash: ', txHash);
            await new Promise((r) => setTimeout(r, mosConfig.delay));
        } while (true);
    } catch (e) {
        if (e instanceof ConfigError) {
            console.log(e.name, e.message);
            return;
        } else if (e instanceof RequestError) {
            console.log(e.name, e.message);
            if (e.name == '404') {
                return;
            }
        }
    }
}
