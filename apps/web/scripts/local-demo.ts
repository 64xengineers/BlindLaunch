/**
 * Fills a local anvil chain with demo data for the web app: one auction that is settled with a
 * Kuru (mock) market, and one that is open for bids. Run after `contracts/script/LocalStack.s.sol`:
 *
 *   anvil &
 *   (cd contracts && MONAD_PRIVATE_KEY=<anvil 0> KEEPER0_OWNER=<anvil 1> KEEPER1_OWNER=<anvil 2> \
 *     KEEPER2_OWNER=<anvil 3> forge script script/LocalStack.s.sol:LocalStack --sig "runLocal()" \
 *     --rpc-url http://127.0.0.1:8545 --broadcast)
 *   pnpm --filter @blindlaunch/web demo:local
 *
 * It plays the keepers itself with fixed keys, so it needs no keeper processes. Never point it at
 * a real network: it time-travels the chain.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { blindAuctionV2Abi, keeperRegistryAbi, parseDeployment } from "@blindlaunch/abi";
import { mulBase } from "@blindlaunch/sealed-bid";
import { createPublicClient, createTestClient, createWalletClient, defineChain, http, type Abi, type Address } from "viem";
import { mnemonicToAccount, type HDAccount } from "viem/accounts";
import { defaultForm, planAuction, START_BUFFER, toCreateParams } from "../src/chain/create";
import { callAuction, createAuction, createToken, ensureAllowance, mintTestQuote, openMarket, openRemaining, placeBid, type Writer } from "../src/state/actions";

const rpc = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const here = fileURLToPath(new URL(".", import.meta.url));
const deployment = parseDeployment(JSON.parse(readFileSync(resolve(here, "../../../deployments/31337.json"), "utf8")));
const chain = defineChain({ id: 31337, name: "anvil", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
const publicClient = createPublicClient({ chain, transport: http(rpc) });
const testClient = createTestClient({ chain, mode: "anvil", transport: http(rpc) });
const accounts: HDAccount[] = Array.from({ length: 10 }, (_, addressIndex) =>
  mnemonicToAccount("test test test test test test test test test test test junk", { addressIndex }),
);
const TOKEN = 10n ** 18n;
const USD = 10n ** 6n;
let keySeed = BigInt(Date.now());

const writer = (account: HDAccount): Writer => ({
  publicClient,
  walletClient: createWalletClient({ account, chain, transport: http(rpc) }),
  chain,
  deployment,
});

async function raw(account: HDAccount, address: Address, abi: Abi, functionName: string, args: readonly unknown[]) {
  const hash = await writer(account).walletClient.writeContract({ address, abi, functionName, args } as never);
  await publicClient.waitForTransactionReceipt({ hash });
}

async function warp(seconds: bigint) {
  await testClient.increaseTime({ seconds: Number(seconds) });
  await testClient.mine({ blocks: 1 });
}

/** One fresh key per keeper for the next auction; returns the secrets. */
async function enqueueKeys(): Promise<bigint[]> {
  const secrets = [0, 1, 2].map(() => (keySeed += 7919n));
  for (const [index, secret] of secrets.entries()) {
    await raw(accounts[index + 1]!, deployment.registry, keeperRegistryAbi as Abi, "enqueue", [index, [mulBase(secret)]]);
  }
  return secrets;
}

async function launch(name: string, symbol: string, biddingMinutes: string) {
  const author = writer(accounts[4]!);
  const token = await createToken(author, { name, symbol, decimals: 18, supply: 10_000n * TOKEN });
  const { plan, errors } = planAuction(
    { ...defaultForm, biddingMinutes, cancelGapMinutes: "60", deposit: "1000" },
    { saleToken: token, saleDecimals: 18, quoteToken: deployment.quote, quoteDecimals: 6, allowedQuotes: [deployment.quote] },
  );
  if (!plan) throw new Error(JSON.stringify(errors));
  await ensureAllowance(author, token, plan.supply);
  const now = (await publicClient.getBlock()).timestamp;
  const id = await createAuction(author, toCreateParams(plan, token, deployment.quote, now));
  await warp(START_BUFFER + 1n);
  return id;
}

async function bid(id: bigint, index: number, step: number, lots: bigint) {
  const w = writer(accounts[index]!);
  await mintTestQuote(w, 1_000n * USD);
  await placeBid(w, id, step, lots);
}

const actualChain = await publicClient.getChainId();
if (actualChain !== 31337) throw new Error(`${rpc} is chain ${actualChain}, not a local anvil (31337). Refusing to write.`);

const settledKeys = await enqueueKeys();
const settled = await launch("Aurora", "AUR", "2");
await bid(settled, 5, 5, 300n);
await bid(settled, 6, 3, 250n);
await bid(settled, 7, 0, 600n);
await warp(121n);
await raw(accounts[9]!, deployment.auction, blindAuctionV2Abi as Abi, "publishKey", [settled, 0, settledKeys[0]]);
await raw(accounts[9]!, deployment.auction, blindAuctionV2Abi as Abi, "publishKey", [settled, 1, settledKeys[1]]);
await openRemaining(writer(accounts[9]!), settled);
await callAuction(writer(accounts[9]!), "settle", settled);
await openMarket(writer(accounts[9]!), settled);

await enqueueKeys();
const open = await launch("Nebula", "NEB", "60");
await bid(open, 5, 4, 120n);
await bid(open, 8, 2, 80n);

console.log(`settled auction ${settled}, open auction ${open} on ${rpc}`);
