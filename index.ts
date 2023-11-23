import { mkRestClient } from "@marlowe.io/runtime-rest-client";

// let runtimeURL = process.env.MARLOWE_RUNTIME_URL;
let runtimeURL = "https://marlowe-runtime-preprod-web.scdev.aws.iohkdev.io";

const client = mkRestClient(runtimeURL);
const hasValidRuntime = await client.healthcheck();

if (!hasValidRuntime) throw new Error("Invalid Marlowe Runtime instance");


