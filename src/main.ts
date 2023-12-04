
import { parseMOSConfig, parseMOSEnv } from "./config.ts"
import { Lucid, MaestroConfig } from "lucid-cardano"
import { mkRestClient } from "@marlowe.io/runtime-rest-client";

export async function main() {
    const mosConfig = await parseMOSConfig();
    const mosEnv = parseMOSEnv();

    const lucid = await Lucid.new(mosEnv.provider);
    const client = mkRestClient(mosEnv.marlowe_runtime_url);

    const hasValidRuntime = await client.healthcheck();
    if (!hasValidRuntime) throw new Error("Invalid Marlowe Runtime instance");
}
