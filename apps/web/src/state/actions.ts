import { blindAuctionV2Abi, marketSeederAbi, testTokenAbi, tokenFactoryAbi, type Deployment } from "@blindlaunch/abi";
import { openBatches, seal, verifySealed } from "@blindlaunch/sealed-bid";
import { erc20Abi, getAddress, parseAbi, parseEventLogs, type Abi, type Address, type Chain, type Hash, type PublicClient, type TransactionReceipt, type WalletClient } from "viem";
import type { CreateParams } from "../chain/create";

export const OPEN_BATCH = 50;

export type Writer = {
  publicClient: PublicClient;
  walletClient: WalletClient;
  chain: Chain;
  deployment: Deployment;
};

function sender(w: Writer) {
  const account = w.walletClient.account;
  if (!account) throw new Error("Connect a wallet first.");
  return account;
}

/** Simulates (a call that would revert is never sent), sends, waits, and fails on a reverted receipt. */
export async function execute(w: Writer, address: Address, abi: Abi, functionName: string, args: readonly unknown[]): Promise<TransactionReceipt> {
  const account = sender(w);
  const { request } = await w.publicClient.simulateContract({ address, abi, functionName, args, account, chain: w.chain } as never);
  const hash: Hash = await w.walletClient.writeContract(request as never);
  const receipt = await w.publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`The transaction reverted: ${hash}`);
  return receipt;
}

export async function createToken(w: Writer, input: { name: string; symbol: string; decimals: number; supply: bigint }): Promise<Address> {
  const owner = sender(w).address;
  const receipt = await execute(w, w.deployment.factory, tokenFactoryAbi as Abi, "createToken", [input.name, input.symbol, input.decimals, input.supply, owner]);
  const [created] = parseEventLogs({ abi: tokenFactoryAbi, logs: receipt.logs, eventName: "TokenCreated" });
  if (!created) throw new Error("The token was created but its address was not found in the receipt.");
  return created.args.token;
}

/** Approves exactly `amount` when the current allowance is short. Returns whether a transaction was sent. */
export async function ensureAllowance(w: Writer, token: Address, amount: bigint): Promise<boolean> {
  const owner = sender(w).address;
  const allowance = await w.publicClient.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [owner, w.deployment.auction] });
  if (allowance >= amount) return false;
  await execute(w, token, erc20Abi as Abi, "approve", [w.deployment.auction, amount]);
  return true;
}

/** Testnet and local only: mints the public test quote token. */
export async function mintTestQuote(w: Writer, amount: bigint): Promise<void> {
  await execute(w, w.deployment.quote, testTokenAbi as Abi, "mint", [sender(w).address, amount]);
}

/** Reads the new auction's id from the `AuctionCreated` log, never from `nextAuctionId`. */
export async function createAuction(w: Writer, params: CreateParams): Promise<bigint> {
  const receipt = await execute(w, w.deployment.auction, blindAuctionV2Abi as Abi, "createAuction", [params]);
  const [created] = parseEventLogs({ abi: blindAuctionV2Abi, logs: receipt.logs, eventName: "AuctionCreated" });
  if (!created) throw new Error("The auction was created but its id was not found in the receipt.");
  return created.args.auctionId;
}

export type SealedRecord = { auctionId: bigint; step: number; lots: bigint; commitTx: Hash };

/**
 * Seals with the keeper keys read from chain now, proves the seal opens under every pair, approves
 * the exact deposit if needed, and commits. Nothing secret is kept: the bid opens itself on chain.
 */
export async function placeBid(w: Writer, auctionId: bigint, step: number, lots: bigint): Promise<SealedRecord> {
  const bidder = sender(w).address;
  const [keeperKeys, auction] = await Promise.all([
    w.publicClient.readContract({ address: w.deployment.auction, abi: blindAuctionV2Abi, functionName: "keeperKeysOf", args: [auctionId] }),
    w.publicClient.readContract({ address: w.deployment.auction, abi: blindAuctionV2Abi, functionName: "getAuction", args: [auctionId] }),
  ]);
  const sealed = seal({ chainId: BigInt(w.chain.id), contract: w.deployment.auction, auctionId, bidder, step, quantity: lots, keeperKeys });
  if (!verifySealed(sealed, keeperKeys)) throw new Error("The sealed bid failed its own check and was not sent.");
  await ensureAllowance(w, auction.quoteToken, auction.deposit);
  const receipt = await execute(w, w.deployment.auction, blindAuctionV2Abi as Abi, "commit", [auctionId, sealed.R, sealed.c, sealed.h]);
  return { auctionId, step, lots, commitTx: receipt.transactionHash };
}

/** Opens every still-sealed bid with the published keys. Anyone may do this once two keys are out. */
export async function openRemaining(w: Writer, auctionId: bigint): Promise<number> {
  const at = w.deployment.auction;
  const [auction, publishedKeys] = await Promise.all([
    w.publicClient.readContract({ address: at, abi: blindAuctionV2Abi, functionName: "getAuction", args: [auctionId] }),
    w.publicClient.readContract({ address: at, abi: blindAuctionV2Abi, functionName: "publishedKeysOf", args: [auctionId] }),
  ]);
  const bids = await Promise.all(
    Array.from({ length: auction.bidCount }, (_, slot) =>
      w.publicClient
        .readContract({ address: at, abi: blindAuctionV2Abi, functionName: "getBid", args: [auctionId, slot] })
        .then((bid) => ({ slot, ephemeral: bid.ephemeral, opened: bid.opened })),
    ),
  );
  const plan = openBatches({ publishedKeys, pairA: auction.pairA, pairB: auction.pairB, bids, batchSize: OPEN_BATCH });
  for (const batch of plan) {
    await execute(w, at, blindAuctionV2Abi as Abi, "openMany", [auctionId, batch.slots, batch.sharedA, batch.sharedB]);
  }
  return plan.length;
}

type AuctionCall = "settle" | "cancel" | "handOffSeed" | "releaseSeed" | "burnForfeits" | "claim" | "reclaim";

export function callAuction(w: Writer, functionName: AuctionCall, auctionId: bigint) {
  return execute(w, w.deployment.auction, blindAuctionV2Abi as Abi, functionName, [auctionId]);
}

/** One leg of a claim or reclaim, paid to the connected wallet. */
export function claimLeg(w: Writer, functionName: "claimRefund" | "claimTokens" | "reclaimUnsold" | "reclaimProceeds", auctionId: bigint) {
  return execute(w, w.deployment.auction, blindAuctionV2Abi as Abi, functionName, [auctionId, sender(w).address]);
}

export function seedCall(w: Writer, functionName: "seed" | "unwind", auctionId: bigint) {
  return execute(w, w.deployment.seeder, marketSeederAbi as Abi, functionName, [auctionId]);
}

/** Hands the reserved seed to the seeder when it is still Reserved (seedState 1). */
async function handOffIfReserved(w: Writer, auctionId: bigint): Promise<void> {
  const auction = await w.publicClient.readContract({ address: w.deployment.auction, abi: blindAuctionV2Abi, functionName: "getAuction", args: [auctionId] });
  if (auction.seedState === 1) await callAuction(w, "handOffSeed", auctionId);
}

/** Hands the reserved seed to the seeder, then opens the Kuru market: two transactions, never one try/catch. */
export async function openMarket(w: Writer, auctionId: bigint): Promise<void> {
  await handOffIfReserved(w, auctionId);
  const position = await w.publicClient.readContract({ address: w.deployment.seeder, abi: marketSeederAbi, functionName: "positionOf", args: [auctionId] });
  if (position.accepted && !position.seeded && !position.unwound) await seedCall(w, "seed", auctionId);
}

/**
 * The seeder ABI plus a local `seedInto` fragment (and its two new errors, so a revert still decodes to a
 * sentence) until the generated ABI carries them. Items the generated ABI already has are taken from the fragment.
 */
const seedIntoFragment = parseAbi(["function seedInto(uint256 auctionId, address market)", "error NotAKuruMarket()", "error MarketMismatch()"]);
const fragmentNames = new Set<string>(seedIntoFragment.map((item) => item.name));
const seedIntoAbi: Abi = [...(marketSeederAbi as Abi).filter((item) => !("name" in item && item.name && fragmentNames.has(item.name))), ...seedIntoFragment];

/**
 * Mainnet path, where only Kuru may create markets: hands the reserved seed off if needed, then seeds the
 * existing Kuru market for this token. The seeder checks it against Kuru's registry (NotAKuruMarket,
 * MarketMismatch), and the simulation surfaces that before anything is sent.
 */
export async function seedIntoMarket(w: Writer, auctionId: bigint, market: Address): Promise<TransactionReceipt> {
  await handOffIfReserved(w, auctionId);
  return execute(w, w.deployment.seeder, seedIntoAbi, "seedInto", [auctionId, getAddress(market)]);
}
