import { Lucid } from "lucid-cardano";
import { mkRestClient } from "marlowe-runtime-rest-client-txpipe";

export async function main() {
    const lucid = await Lucid.new();
    // let runtimeURL = process.env.MARLOWE_RUNTIME_URL;
    let runtimeURL = "https://marlowe-runtime-preprod-web.scdev.aws.iohkdev.io";

    const client = mkRestClient(runtimeURL);
    const hasValidRuntime = await client.healthcheck();

    if (!hasValidRuntime) throw new Error("Invalid Marlowe Runtime instance");
}
