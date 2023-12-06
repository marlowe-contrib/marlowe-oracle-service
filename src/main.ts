
import { Lucid, MaestroConfig } from "lucid-cardano"
import { ContractId } from "@marlowe.io/runtime-core";
import { mkRestClient } from "marlowe-runtime-rest-client-txpipe";
import { ApplyInputsRequest } from "marlowe-runtime-lifecycle-txpipe/dist/esm/api";
import { Address } from "marlowe-language-core-v1-txpipe";

import { parseMOSConfig, parseMOSEnv } from "./config.ts"
import { getActiveContracts } from "./scan.ts"
import { getApplyInputs } from "./feed.ts"

export async function main() {
    const mosConfig = await parseMOSConfig();
    const mosEnv = parseMOSEnv();

    const lucid = await Lucid.new(mosEnv.provider);
    const client = mkRestClient(mosEnv.marloweRuntimeUrl);

    const mosAddress: Address = { address: "addr_test1vzuqvqzcnuy9pmrh2sy7tjucufmpwh8gzssz7v6scn0e04gxdvna9" };
    const activeContracts = await getActiveContracts(client, mosAddress, mosConfig.choiceNames);
    const applicableInputs = await getApplyInputs(activeContracts);

    const fulfilled: [ContractId, ApplyInputsRequest][] = [];
    applicableInputs.map ( (res, idx) => {
	if (res.status === "fulfilled") {
	    fulfilled.push(res.value);
	} else {
	    console.log(res);
	}
    }
    );
    console.log(fulfilled);
}
