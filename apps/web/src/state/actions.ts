import { blindAuctionV2Abi, keeperRegistryAbi, marketSeederAbi, testTokenAbi, tokenFactoryAbi, type Deployment } from "@blindlaunch/abi";
import { openBatches, seal, verifySealed } from "@blindlaunch/sealed-bid";
import {
  BaseError,
  ContractFunctionRevertedError,
  erc20Abi,
  getAddress,
  parseAbi,
  parseEventLogs,
  type Abi,
  type Address,
  type Chain,
  type Hash,
  type PublicClient,
  type ReplacementReason,
  type TransactionReceipt,
  type WalletClient,
} from "viem";
import { formatAbiItem } from "viem/utils";
import type { CreateParams } from "../chain/create";

export const OPEN_BATCH = 50;
/** Bids read at once, so no single RPC batch carries more than this many calls. */
export const READ_CHUNK = 50;

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

/**
 * Simulates (a call that would revert is never sent), sends and waits. A transaction the wallet cancelled
 * or swapped for a different call fails (only a same-call speed-up counts), and a reverted one is replayed
 * at its block so the error carries the contract's reason.
 */
export async function execute(w: Writer, address: Address, abi: Abi, functionName: string, args: readonly unknown[]): Promise<TransactionReceipt> {
  const account = sender(w);
  const call = { address, abi, functionName, args, account, chain: w.chain };
  const { request } = await w.publicClient.simulateContract(call as never);
  const hash: Hash = await w.walletClient.writeContract(request as never);
  let replaced: ReplacementReason | undefined;
  const receipt = await w.publicClient.waitForTransactionReceipt({
    hash,
    onReplaced: ({ reason }) => {
      replaced = reason;
    },
  });
  if (replaced === "cancelled") throw new Error("The transaction was cancelled in your wallet, so nothing happened.");
  if (replaced !== undefined && replaced !== "repriced") {
    throw new Error("Your wallet replaced the transaction with a different one, so nothing happened.");
  }
  if (receipt.status !== "success") {
    throw (await revertOf(w, call, receipt.blockNumber)) ?? new Error(`The transaction reverted: ${receipt.transactionHash}`);
  }
  return receipt;
}

/** Replays a call at the block its transaction reverted in, returning the decoded revert, if it reverts again. */
async function revertOf(w: Writer, call: object, blockNumber: bigint): Promise<BaseError | undefined> {
  try {
    await w.publicClient.simulateContract({ ...call, blockNumber } as never);
  } catch (error) {
    if (error instanceof BaseError && error.walk((e) => e instanceof ContractFunctionRevertedError)) return error;
  }
  return undefined;
}

/**
 * The auction ABI plus the KeeperRegistry and MarketSeeder errors its calls bubble up (NoKeeperKeys and the
 * seeder's checks from createAuction, the seeder's from handOffSeed), so those reverts decode to a sentence.
 */
const auctionAbi: Abi = (() => {
  const known = new Set((blindAuctionV2Abi as Abi).filter((item) => item.type === "error").map((item) => formatAbiItem(item)));
  const extra: Abi[number][] = [];
  for (const item of [...(keeperRegistryAbi as Abi), ...(marketSeederAbi as Abi)]) {
    if (item.type !== "error" || known.has(formatAbiItem(item))) continue;
    known.add(formatAbiItem(item));
    extra.push(item);
  }
  return [...(blindAuctionV2Abi as Abi), ...extra];
})();

/** `approve` with no return value: tokens like USDT return nothing, and decoding a `bool` would fail on them. */
const approveAbi = parseAbi(["function approve(address spender, uint256 amount)"]);

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
  await execute(w, token, approveAbi, "approve", [w.deployment.auction, amount]);
  return true;
}

/** Testnet and local only: mints the public test quote token. */
export async function mintTestQuote(w: Writer, amount: bigint): Promise<void> {
  await execute(w, w.deployment.quote, testTokenAbi as Abi, "mint", [sender(w).address, amount]);
}

/** Reads the new auction's id from the `AuctionCreated` log, never from `nextAuctionId`. */
export async function createAuction(w: Writer, params: CreateParams): Promise<bigint> {
  const receipt = await execute(w, w.deployment.auction, auctionAbi, "createAuction", [params]);
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
  if (!verifySealed(sealed, keeperKeys, { chainId: BigInt(w.chain.id), contract: w.deployment.auction, auctionId, bidder })) {
    throw new Error("The sealed bid failed its own check and was not sent.");
  }
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
  // Reads READ_CHUNK bids at a time and sends a batch whenever OPEN_BATCH sealed ones have piled up, so no
  // RPC batch is huge and no bid count needs every bid in memory before the first transaction.
  const pending: Parameters<typeof openBatches>[0]["bids"][number][] = [];
  let sent = 0;
  const send = async (bids: typeof pending) => {
    for (const batch of openBatches({ publishedKeys, pairA: auction.pairA, pairB: auction.pairB, bids, batchSize: OPEN_BATCH })) {
      await execute(w, at, blindAuctionV2Abi as Abi, "openMany", [auctionId, batch.slots, batch.sharedA, batch.sharedB]);
      sent += 1;
    }
  };
  for (let start = 0; start < auction.bidCount; start += READ_CHUNK) {
    const chunk = await Promise.all(
      Array.from({ length: Math.min(READ_CHUNK, auction.bidCount - start) }, (_, offset) =>
        w.publicClient
          .readContract({ address: at, abi: blindAuctionV2Abi, functionName: "getBid", args: [auctionId, start + offset] })
          .then((bid) => ({ slot: start + offset, ephemeral: bid.ephemeral, opened: bid.opened })),
      ),
    );
    pending.push(...chunk.filter((bid) => !bid.opened));
    while (pending.length >= OPEN_BATCH) await send(pending.splice(0, OPEN_BATCH));
  }
  if (pending.length > 0) await send(pending.splice(0));
  return sent;
}

type AuctionCall = "settle" | "cancel" | "handOffSeed" | "releaseSeed" | "burnForfeits" | "claim" | "reclaim";

export function callAuction(w: Writer, functionName: AuctionCall, auctionId: bigint) {
  return execute(w, w.deployment.auction, auctionAbi, functionName, [auctionId]);
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
