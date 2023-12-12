import { Lucid, MaestroConfig } from 'lucid-cardano';
import { mkRestClient } from 'marlowe-runtime-rest-client-txpipe';
import { Address } from 'marlowe-language-core-v1-txpipe';

import { parseMOSConfig, parseMOSEnv } from './config.ts';
import { getActiveContracts } from './scan.ts';
import { getApplyInputs } from './feed.ts';
import { buildAndSubmit } from './tx.ts';

export async function main() {
    const mosConfig = await parseMOSConfig();
    const mosEnv = parseMOSEnv();

    const lucid = await Lucid.new(mosEnv.provider);
    const client = mkRestClient(mosEnv.marloweRuntimeUrl);

    const mosAddress: Address = {
        address:
            'addr_test1vzuqvqzcnuy9pmrh2sy7tjucufmpwh8gzssz7v6scn0e04gxdvna9',
    };

    do {
        const activeContracts = await getActiveContracts(
            client,
            mosAddress,
            mosConfig.choiceNames
            );

        const applicableInputs = await getApplyInputs(mosAddress, activeContracts);
        console.log(applicableInputs);
        const txHash = await buildAndSubmit(
            mosEnv.signTxUrl,
            client,
            lucid,
            applicableInputs
            );
        console.log("TxHash: ", txHash);
        await new Promise(r => setTimeout(r, mosConfig.delay));
    } while (true)

}
