import type { Deployment } from "@blindlaunch/abi";
import { createPublicClient, createWalletClient, defineChain, http, type Abi, type Address, type Hash, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export type Call = { address: Address; abi: Abi; functionName: string; args: readonly unknown[] };

/**
 * Most calls in one JSON-RPC batch. Monad's public RPCs accept 100 (rpc.monad.xyz, rpc1), 10
 * (rpc2, rpc3) or 1 (rpc-mainnet.monadinfra.com) and reject larger batches.
 */
export const DEFAULT_RPC_BATCH = 10;

export function createChainContext(config: { rpcUrl: string; privateKey: Hex; deployment: Deployment; rpcBatch?: number }) {
  const readBatch = config.rpcBatch ?? DEFAULT_RPC_BATCH;
  const chain = defineChain({
    id: config.deployment.chainId,
    name: `monad-${config.deployment.chainId}`,
    nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
    rpcUrls: { default: { http: [config.rpcUrl] } },
  });
  // No nonce manager: it caches the last nonce it handed out, so after a transaction that was
  // broadcast but never mined every later one would use a nonce that can never execute. The keeper
  // sends one transaction at a time, so each send reads the next nonce from the chain instead.
  const account = privateKeyToAccount(config.privateKey);
  const publicClient = createPublicClient({ chain, transport: http(config.rpcUrl, { batch: { batchSize: readBatch } }) });
  const walletClient = createWalletClient({ account, chain, transport: http(config.rpcUrl) });

  async function attempt(call: Call): Promise<Hash> {
    // Simulate first: a transaction that would revert is never broadcast. A reverted
    // publishKey would still put the secret key on chain (audit M3).
    const { request } = await publicClient.simulateContract({ ...call, account } as never);
    const nonce = await publicClient.getTransactionCount({ address: account.address, blockTag: "pending" });
    const hash = await walletClient.writeContract({ ...(request as object), nonce } as never);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`${call.functionName} reverted in ${hash}`);
    return hash;
  }

  /** Simulates, sends, waits and checks the receipt. Retries once, with a fresh nonce, after a nonce error. */
  async function send(call: Call): Promise<Hash> {
    try {
      return await attempt(call);
    } catch (error) {
      if (!/nonce|replacement transaction underpriced/i.test(String(error))) throw error;
      return attempt(call);
    }
  }

  return { chain, account, publicClient, walletClient, deployment: config.deployment, readBatch, send };
}

export type ChainContext = ReturnType<typeof createChainContext>;
