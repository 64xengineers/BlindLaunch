import { blindAuctionV2Abi, keeperRegistryAbi, marketSeederAbi } from "@blindlaunch/abi";
import { defaultRng, isValid, mulBase, openBatches, randomScalar, type Point } from "@blindlaunch/sealed-bid";
import type { Abi } from "viem";
import type { ChainContext } from "./chain";
import { nextActions, SEED, STATUS, type Action, type AuctionView, type KeeperIndex } from "./decide";
import type { KeyStore } from "./keystore";

export const OPEN_BATCH = 50;
/** Most openMany transactions per auction per pass, so one large auction never takes a whole pass. */
export const OPEN_TX_PER_PASS = 4;
const MAX_STEPS_PER_AUCTION = 8;

export type Logger = (event: string, data?: Record<string, unknown>) => void;

export type Keeper = {
  chain: ChainContext;
  store: KeyStore;
  index: KeeperIndex;
  queueTarget: number;
  log: Logger;
  /** This host's clock in unix seconds; publishing waits for it as well as for chain time. Defaults to Date.now(). */
  clock?: () => bigint;
};

/** Function names of every transaction a pass sent, in order. */
export type PassReport = { sent: string[] };

/** What a keeper remembers between passes. In memory only: after a restart the first pass re-reads everything. */
type Memory = {
  /** Every auction below this id is finished: cancelled, or settled with nothing left for keepers to do. */
  firstUnfinished: bigint;
  /** Per auction, every bid slot below this one was seen opened (bids never become unopened). */
  openedBelow: Map<bigint, number>;
  /** Auctions whose missing secret was already reported. */
  missingReported: Set<bigint>;
};

const memories = new WeakMap<Keeper, Memory>();

function memoryOf(keeper: Keeper): Memory {
  let memory = memories.get(keeper);
  if (!memory) {
    memory = { firstUnfinished: 1n, openedBelow: new Map(), missingReported: new Set() };
    memories.set(keeper, memory);
  }
  return memory;
}

const auctionAbi = blindAuctionV2Abi as Abi;
const firstLine = (error: unknown) => String(error).split("\n")[0];
const hostTime = (keeper: Keeper) => keeper.clock?.() ?? BigInt(Math.floor(Date.now() / 1000));

/**
 * One idempotent pass: refill keys, publish this keeper's key for every auction in its window, then
 * move every unfinished auction forward, opening at most OPEN_TX_PER_PASS batches per auction.
 * Publishing goes first because it is the only step with a deadline.
 */
export async function runPass(keeper: Keeper): Promise<PassReport> {
  const report: PassReport = { sent: [] };
  try {
    await topUp(keeper, report);
  } catch (error) {
    // A failed refill (no gas, a full queue, an RPC error) must not stop this keeper publishing,
    // opening and settling the auctions already sealed to its keys.
    keeper.log("refill-error", { error: firstLine(error) });
  }
  const memory = memoryOf(keeper);
  const { publicClient, deployment } = keeper.chain;
  const next = await publicClient.readContract({ address: deployment.auction, abi: blindAuctionV2Abi, functionName: "nextAuctionId" });
  const ids: bigint[] = [];
  for (let id = memory.firstUnfinished; id < next; id += 1n) ids.push(id);

  for (const id of ids) await guarded(keeper, id, () => advance(keeper, id, report, true));
  let firstUnfinished: bigint | undefined;
  for (const id of ids) {
    if (!(await guarded(keeper, id, () => advance(keeper, id, report, false)))) firstUnfinished ??= id;
  }
  memory.firstUnfinished = firstUnfinished ?? next;
  return report;
}

/** Runs one auction's work; an error is logged and counts as unfinished, and the pass goes on. */
async function guarded(keeper: Keeper, id: bigint, work: () => Promise<boolean>): Promise<boolean> {
  try {
    return await work();
  } catch (error) {
    keeper.log("auction-error", { id: id.toString(), error: firstLine(error) });
    return false;
  }
}

async function send(keeper: Keeper, report: PassReport, address: `0x${string}`, abi: Abi, functionName: string, args: readonly unknown[]) {
  const hash = await keeper.chain.send({ address, abi, functionName, args });
  report.sent.push(functionName);
  keeper.log("sent", { functionName, hash, args: args.map(String) });
}

export async function topUp(keeper: Keeper, report: PassReport): Promise<void> {
  const { publicClient, deployment } = keeper.chain;
  const available = await publicClient.readContract({
    address: deployment.registry,
    abi: keeperRegistryAbi,
    functionName: "available",
    args: [keeper.index],
  });
  const missing = keeper.queueTarget - Number(available);
  if (missing <= 0) return;
  const keys: Point[] = [];
  const entries: { x: bigint; secret: bigint }[] = [];
  while (keys.length < missing) {
    const secret = randomScalar(defaultRng);
    const key = mulBase(secret);
    if (!isValid(key)) continue;
    keys.push(key);
    entries.push({ x: key.x, secret });
  }
  keeper.store.add(entries); // secrets on disk before their keys are on chain
  await send(keeper, report, deployment.registry, keeperRegistryAbi as Abi, "enqueue", [keeper.index, keys]);
}

async function readView(keeper: Keeper, id: bigint): Promise<AuctionView> {
  const { publicClient, deployment } = keeper.chain;
  const [a, publishedKeys] = await Promise.all([
    publicClient.readContract({ address: deployment.auction, abi: blindAuctionV2Abi, functionName: "getAuction", args: [id] }),
    publicClient.readContract({ address: deployment.auction, abi: blindAuctionV2Abi, functionName: "publishedKeysOf", args: [id] }),
  ]);
  return {
    id,
    status: a.status,
    bidCount: a.bidCount,
    openedCount: a.openedCount,
    publishedCount: a.publishedCount,
    pairA: a.pairA,
    pairB: a.pairB,
    commitDeadline: a.commitDeadline,
    cancelAfter: a.cancelAfter,
    seedState: a.seedState,
    forfeitedTotal: a.forfeitedTotal,
    forfeitsBurned: a.forfeitsBurned,
    publishedKeys,
  };
}

/**
 * This keeper's secret for an auction. A missing one (for example KEY_STORE restored from an old
 * backup) means this keeper can never publish for the auction, so it is reported once, as an alert.
 */
async function mySecret(keeper: Keeper, view: AuctionView): Promise<bigint | undefined> {
  const keys = await keeper.chain.publicClient.readContract({
    address: keeper.chain.deployment.auction,
    abi: blindAuctionV2Abi,
    functionName: "keeperKeysOf",
    args: [view.id],
  });
  const key = keys[keeper.index];
  const secret = keeper.store.secretFor(key.x);
  const memory = memoryOf(keeper);
  if (secret === undefined && view.publishedKeys[keeper.index] === 0n && !memory.missingReported.has(view.id)) {
    memory.missingReported.add(view.id);
    keeper.log("key-missing", { level: "alert", id: view.id.toString(), x: `0x${key.x.toString(16)}` });
  }
  return secret;
}

async function seedPending(keeper: Keeper, id: bigint): Promise<boolean> {
  const position = await keeper.chain.publicClient.readContract({
    address: keeper.chain.deployment.seeder,
    abi: marketSeederAbi,
    functionName: "positionOf",
    args: [id],
  });
  return position.accepted && !position.seeded && !position.unwound;
}

/** Settled with nothing left for any keeper to do (cancelled auctions return early in `advance`). */
async function finished(keeper: Keeper, view: AuctionView): Promise<boolean> {
  if (view.status !== STATUS.Settled) return false;
  if (view.seedState === SEED.Reserved || (view.forfeitedTotal > 0n && !view.forfeitsBurned)) return false;
  return view.seedState !== SEED.HandedOff || !(await seedPending(keeper, view.id));
}

/**
 * Moves one auction forward; with `publishOnly`, only publishes this keeper's key. Each action is
 * isolated, so one that keeps failing (a handOffSeed a token blocks) never holds back the next
 * (burnForfeits). Returns whether the auction is finished.
 */
async function advance(keeper: Keeper, id: bigint, report: PassReport, publishOnly: boolean): Promise<boolean> {
  const budget = { openTx: OPEN_TX_PER_PASS };
  for (let step = 0; step < MAX_STEPS_PER_AUCTION; step += 1) {
    const view = await readView(keeper, id);
    if (view.status === STATUS.Cancelled) return true;
    // Finalized, not latest: Monad's latest block is only Proposed and can still be dropped, so a
    // key published against it could go on chain before commitDeadline is final (audit M3).
    const block = await keeper.chain.publicClient.getBlock({ blockTag: "finalized" });
    const secret = view.status === STATUS.Open ? await mySecret(keeper, view) : undefined;
    const actions = nextActions(view, {
      keeper: keeper.index,
      haveSecret: secret !== undefined,
      chainTime: block.timestamp,
      hostTime: hostTime(keeper),
    }).filter((action) => !publishOnly || action === "publish");
    if (actions.includes("open") && budget.openTx <= 0) return false; // the rest waits for the next pass
    const before = report.sent.length;
    for (const action of actions) {
      try {
        await perform(keeper, view, action, secret, report, budget);
      } catch (error) {
        keeper.log("action-error", { id: id.toString(), action, error: firstLine(error) });
      }
    }
    if (report.sent.length === before) return publishOnly ? false : finished(keeper, view); // nothing changed on chain
  }
  return false;
}

async function perform(
  keeper: Keeper,
  view: AuctionView,
  action: Action,
  secret: bigint | undefined,
  report: PassReport,
  budget: { openTx: number },
) {
  const { auction, seeder } = keeper.chain.deployment;
  switch (action) {
    case "publish":
      if (secret === undefined) return;
      return send(keeper, report, auction, auctionAbi, "publishKey", [view.id, keeper.index, secret]);
    case "open":
      return openSome(keeper, view, report, budget);
    case "settle":
    case "cancel":
    case "handOffSeed":
    case "burnForfeits":
      return send(keeper, report, auction, auctionAbi, action, [view.id]);
    case "retrySeed":
      if (await seedPending(keeper, view.id)) return send(keeper, report, seeder, marketSeederAbi as Abi, "seed", [view.id]);
  }
}

/**
 * Opens unopened bids with the frozen pair's published keys, 50 per transaction and at most
 * `budget.openTx` transactions. Reads bids `readBatch` at a time (Monad's public RPCs reject
 * JSON-RPC batches above 100 calls, some above 10), starting past the slots already seen opened,
 * and stops reading once it has enough unopened bids for its budget.
 */
export async function openSome(keeper: Keeper, view: AuctionView, report: PassReport, budget: { openTx: number }): Promise<void> {
  const { publicClient, deployment, readBatch } = keeper.chain;
  const memory = memoryOf(keeper);
  const want = budget.openTx * OPEN_BATCH;
  let openedBelow = memory.openedBelow.get(view.id) ?? 0;
  let gap = false;
  const unopened: { slot: number; ephemeral: Point; opened: boolean }[] = [];
  for (let start = openedBelow; start < view.bidCount && unopened.length < want; start += readBatch) {
    const slots = Array.from({ length: Math.min(readBatch, view.bidCount - start) }, (_, i) => start + i);
    const read = await Promise.all(
      slots.map((slot) =>
        publicClient
          .readContract({ address: deployment.auction, abi: blindAuctionV2Abi, functionName: "getBid", args: [view.id, slot] })
          .then((bid) => ({ slot, ephemeral: bid.ephemeral, opened: bid.opened })),
      ),
    );
    for (const bid of read) {
      if (!bid.opened) {
        gap = true;
        unopened.push(bid);
      } else if (!gap) {
        openedBelow = bid.slot + 1;
      }
    }
  }
  memory.openedBelow.set(view.id, openedBelow);
  const plan = openBatches({
    publishedKeys: view.publishedKeys,
    pairA: view.pairA,
    pairB: view.pairB,
    bids: unopened.slice(0, want),
    batchSize: OPEN_BATCH,
  });
  for (const batch of plan) {
    budget.openTx -= 1;
    await send(keeper, report, deployment.auction, auctionAbi, "openMany", [view.id, batch.slots, batch.sharedA, batch.sharedB]);
  }
}
