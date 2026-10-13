import type { Deployment } from "@blindlaunch/abi";
import { createPublicClient, createWalletClient, defineChain, http, nonceManager, type Abi, type Address, type Hash, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export type Call = { address: Address; abi: Abi; functionName: string; args: readonly unknown[] };

export function createChainContext(config: { rpcUrl: string; privateKey: Hex; deployment: Deployment }) {
  const chain = defineChain({
    id: config.deployment.chainId,
    name: `monad-${config.deployment.chainId}`,
    nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
    rpcUrls: { default: { http: [config.rpcUrl] } },
  });
  const account = privateKeyToAccount(config.privateKey, { nonceManager });
  const publicClient = createPublicClient({ chain, transport: http(config.rpcUrl, { batch: true }) });
  const walletClient = createWalletClient({ account, chain, transport: http(config.rpcUrl) });

  async function attempt(call: Call): Promise<Hash> {
    // Simulate first: a transaction that would revert is never broadcast. A reverted
    // publishKey would still put the secret key on chain (audit M3).
    const { request } = await publicClient.simulateContract({ ...call, account } as never);
    const hash = await walletClient.writeContract(request as never);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`${call.functionName} reverted in ${hash}`);
    return hash;
  }

  /** Simulates, sends, waits and checks the receipt. Retries once after a nonce error. */
  async function send(call: Call): Promise<Hash> {
    try {
      return await attempt(call);
    } catch (error) {
      if (!/nonce|replacement transaction underpriced/i.test(String(error))) throw error;
      nonceManager.reset({ address: account.address, chainId: chain.id });
      return attempt(call);
    }
  }

  return { chain, account, publicClient, walletClient, deployment: config.deployment, send };
}

export type ChainContext = ReturnType<typeof createChainContext>;
