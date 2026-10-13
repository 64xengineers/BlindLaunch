import { createPublicClient, http, type Chain } from "viem";
import { network } from "./config";
import { createReads } from "./reads";

/** Monad's public RPCs allow 50 calls a second and count every call inside a JSON-RPC batch, so no batch carries more. */
export const RPC_BATCH_SIZE = 50;
/** Reads made together share one Multicall3 call of up to this much calldata (about 60 bid reads). The local chain has no Multicall3 and reads one by one. */
export const MULTICALL_BYTES = 4096;

export function createReadClient(chain: Chain, rpcUrl: string) {
  return createPublicClient({
    chain,
    transport: http(rpcUrl, { batch: { batchSize: RPC_BATCH_SIZE } }),
    batch: { multicall: { batchSize: MULTICALL_BYTES } },
  });
}

export const publicClient = createReadClient(network.chain, network.rpcUrl);

/** Null when this network has no deployment yet. */
export const reads = network.deployment ? createReads(publicClient, network.deployment) : null;
