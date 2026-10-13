import { blindAuctionV2Abi, keeperRegistryAbi, marketSeederAbi } from "@blindlaunch/abi";
import { defaultRng, isValid, mulBase, openBatches, randomScalar, type Point } from "@blindlaunch/sealed-bid";
import type { Abi } from "viem";
import type { ChainContext } from "./chain";
import { nextActions, STATUS, type Action, type AuctionView, type KeeperIndex } from "./decide";
import type { KeyStore } from "./keystore";

export const OPEN_BATCH = 50;
const MAX_STEPS_PER_AUCTION = 8;

export type Logger = (event: string, data?: Record<string, unknown>) => void;

export type Keeper = {
  chain: ChainContext;
  store: KeyStore;
  index: KeeperIndex;
  queueTarget: number;
  log: Logger;
};

/** Function names of every transaction a pass sent, in order. */
export type PassReport = { sent: string[] };

const auctionAbi = blindAuctionV2Abi as Abi;

/** One idempotent pass: refill keys, then move every auction forward as far as it can go. */
export async function runPass(keeper: Keeper): Promise<PassReport> {
  const report: PassReport = { sent: [] };
  await topUp(keeper, report);
  const { publicClient, deployment } = keeper.chain;
  const next = await publicClient.readContract({ address: deployment.auction, abi: blindAuctionV2Abi, functionName: "nextAuctionId" });
  for (let id = 1n; id < next; id += 1n) {
    try {
      await advance(keeper, id, report);
    } catch (error) {
      keeper.log("auction-error", { id: id.toString(), error: String(error).split("\n")[0] });
    }
  }
  return report;
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

async function mySecret(keeper: Keeper, id: bigint): Promise<bigint | undefined> {
  const keys = await keeper.chain.publicClient.readContract({
    address: keeper.chain.deployment.auction,
    abi: blindAuctionV2Abi,
    functionName: "keeperKeysOf",
    args: [id],
  });
  return keeper.store.secretFor(keys[keeper.index].x);
}

async function advance(keeper: Keeper, id: bigint, report: PassReport): Promise<void> {
  for (let step = 0; step < MAX_STEPS_PER_AUCTION; step += 1) {
    const view = await readView(keeper, id);
    if (view.status === STATUS.Cancelled) return;
    const block = await keeper.chain.publicClient.getBlock();
    const secret = view.status === STATUS.Open ? await mySecret(keeper, id) : undefined;
    const actions = nextActions(view, { keeper: keeper.index, haveSecret: secret !== undefined, chainTime: block.timestamp });
    const before = report.sent.length;
    for (const action of actions) await perform(keeper, view, action, secret, report);
    if (report.sent.length === before) return; // nothing changed on chain
  }
}

async function perform(keeper: Keeper, view: AuctionView, action: Action, secret: bigint | undefined, report: PassReport) {
  const { auction, seeder } = keeper.chain.deployment;
  switch (action) {
    case "publish":
      if (secret === undefined) return;
      return send(keeper, report, auction, auctionAbi, "publishKey", [view.id, keeper.index, secret]);
    case "open":
      return openAll(keeper, view, report);
    case "settle":
    case "cancel":
    case "handOffSeed":
    case "burnForfeits":
      return send(keeper, report, auction, auctionAbi, action, [view.id]);
    case "retrySeed": {
      const position = await keeper.chain.publicClient.readContract({
        address: seeder,
        abi: marketSeederAbi,
        functionName: "positionOf",
        args: [view.id],
      });
      if (position.accepted && !position.seeded && !position.unwound) {
        return send(keeper, report, seeder, marketSeederAbi as Abi, "seed", [view.id]);
      }
    }
  }
}

/** Opens every unopened bid with the frozen pair's published keys, 50 per transaction. */
export async function openAll(keeper: Keeper, view: AuctionView, report: PassReport): Promise<void> {
  const { publicClient, deployment } = keeper.chain;
  const bids = await Promise.all(
    Array.from({ length: view.bidCount }, (_, slot) =>
      publicClient
        .readContract({ address: deployment.auction, abi: blindAuctionV2Abi, functionName: "getBid", args: [view.id, slot] })
        .then((bid) => ({ slot, ephemeral: bid.ephemeral, opened: bid.opened })),
    ),
  );
  const plan = openBatches({ publishedKeys: view.publishedKeys, pairA: view.pairA, pairB: view.pairB, bids, batchSize: OPEN_BATCH });
  for (const batch of plan) {
    await send(keeper, report, deployment.auction, auctionAbi, "openMany", [view.id, batch.slots, batch.sharedA, batch.sharedB]);
  }
}
