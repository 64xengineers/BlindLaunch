import { createPublicClient, http } from "viem";
import { network } from "./config";
import { createReads } from "./reads";

export const publicClient = createPublicClient({ chain: network.chain, transport: http(network.rpcUrl, { batch: true }) });

/** Null when this network has no deployment yet. */
export const reads = network.deployment ? createReads(publicClient, network.deployment) : null;
