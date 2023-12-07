import { Lucid, MaestroConfig } from 'lucid-cardano';
import { ContractId } from '@marlowe.io/runtime-core';
import { mkRestClient } from 'marlowe-runtime-rest-client-txpipe';
import { ApplyInputsToContractRequest } from 'marlowe-runtime-rest-client-txpipe/dist/esm/contract/transaction/endpoints/collection';
import { Address } from 'marlowe-language-core-v1-txpipe';

import { parseMOSConfig, parseMOSEnv } from './config.ts';
import { getActiveContracts } from './scan.ts';
import { getApplyInputs } from './feed.ts';
import { getTx } from './tx.ts';

export async function main() {
    const mosConfig = await parseMOSConfig();
    const mosEnv = parseMOSEnv();

    const lucid = await Lucid.new(mosEnv.provider);
    const client = mkRestClient(mosEnv.marloweRuntimeUrl);

    const mosAddress: Address = {
        address:
            'addr_test1vzuqvqzcnuy9pmrh2sy7tjucufmpwh8gzssz7v6scn0e04gxdvna9',
    };
    const activeContracts = await getActiveContracts(
        client,
        mosAddress,
        mosConfig.choiceNames
    );
    const applicableInputs = await getApplyInputs(mosAddress, activeContracts);
    const tx = await getTx(mosEnv.signTxUrl, client, lucid, applicableInputs);
    console.log(applicableInputs);

}
