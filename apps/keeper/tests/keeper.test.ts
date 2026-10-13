import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultRng, mulBase, randomScalar, type Point } from "@blindlaunch/sealed-bid";
import { describe, expect, it } from "vitest";
import type { Call, ChainContext } from "../src/chain";
import { SEED, STATUS, type KeeperIndex } from "../src/decide";
import { OPEN_TX_PER_PASS, runPass, type Keeper } from "../src/keeper";
import { KeyStore } from "../src/keystore";

const READ_BATCH = 10;

type AuctionState = {
  status: number;
  bidCount: number;
  openedCount: number;
  publishedCount: number;
  pairA: number;
  pairB: number;
  commitDeadline: bigint;
  cancelAfter: bigint;
  seedState: number;
  forfeitedTotal: bigint;
  forfeitsBurned: boolean;
};

type FakeAuction = {
  auction: AuctionState;
  publishedKeys: [bigint, bigint, bigint];
  keeperKeys: Point[];
  bids: { ephemeral: Point; opened: boolean }[];
  /** The keeper's store lost this auction's secret (for example restored from an old backup). */
  secretLost?: boolean;
};

/** Auctions on a fake chain, ids 1, 2, ... Transactions change them the way the contracts would. */
type World = {
  latest: bigint;
  finalized: bigint;
  host: bigint;
  available: bigint;
  failEnqueue: boolean;
  failing: Set<string>;
  auctions: FakeAuction[];
};

const point = () => mulBase(randomScalar(defaultRng));

function fakeAuction(overrides: Partial<AuctionState> = {}, bidCount = 3): FakeAuction {
  return {
    auction: {
      status: STATUS.Open,
      bidCount,
      openedCount: 0,
      publishedCount: 0,
      pairA: 0,
      pairB: 0,
      commitDeadline: 1_000n,
      cancelAfter: 5_000n,
      seedState: SEED.None,
      forfeitedTotal: 0n,
      forfeitsBurned: false,
      ...overrides,
    },
    publishedKeys: [0n, 0n, 0n],
    keeperKeys: [point(), point(), point()],
    bids: Array.from({ length: bidCount }, () => ({ ephemeral: point(), opened: false })),
  };
}

function world(...auctions: FakeAuction[]): World {
  return {
    latest: 1_500n,
    finalized: 1_500n,
    host: 1_500n,
    available: 3n,
    failEnqueue: false,
    failing: new Set(),
    auctions: auctions.length > 0 ? auctions : [fakeAuction()],
  };
}

/** A paired auction (keys 0 and 2 published) with `bidCount` unopened bids. */
function paired(bidCount: number): FakeAuction {
  const a = fakeAuction({ publishedCount: 2, pairA: 0, pairB: 2 }, bidCount);
  a.publishedKeys = [randomScalar(defaultRng), 0n, randomScalar(defaultRng)];
  return a;
}

function fakeKeeper(w: World, index: KeeperIndex = 0) {
  const sent: Call[] = [];
  const logs: { event: string; data: Record<string, unknown> | undefined }[] = [];
  const blockTags: string[] = [];
  const reads = { inFlight: 0, maxInFlight: 0, auctions: [] as bigint[] };
  const store = new KeyStore(join(mkdtempSync(join(tmpdir(), "keeper-unit-")), "keys.json"));
  const secrets = w.auctions.map((a) => {
    const secret = randomScalar(defaultRng);
    a.keeperKeys[index] = mulBase(secret);
    if (!a.secretLost) store.add([{ x: a.keeperKeys[index]!.x, secret }]);
    return secret;
  });
  const at = (id: unknown) => w.auctions[Number(id) - 1]!;

  const publicClient = {
    async readContract({ functionName, args = [] }: { functionName: string; args?: readonly unknown[] }) {
      reads.inFlight += 1;
      reads.maxInFlight = Math.max(reads.maxInFlight, reads.inFlight);
      await new Promise((resolve) => setTimeout(resolve, 0));
      reads.inFlight -= 1;
      switch (functionName) {
        case "nextAuctionId":
          return BigInt(w.auctions.length + 1);
        case "available":
          return w.available;
        case "getAuction":
          reads.auctions.push(args[0] as bigint);
          return { ...at(args[0]).auction };
        case "publishedKeysOf":
          return [...at(args[0]).publishedKeys];
        case "keeperKeysOf":
          return at(args[0]).keeperKeys;
        case "getBid":
          return { ...at(args[0]).bids[Number(args[1])]! };
        case "positionOf":
          return { accepted: true, seeded: true, unwound: false };
        default:
          throw new Error(`unexpected read ${functionName}`);
      }
    },
    async getBlock({ blockTag = "latest" }: { blockTag?: string } = {}) {
      blockTags.push(blockTag);
      return { timestamp: blockTag === "finalized" ? w.finalized : w.latest };
    },
  };

  async function send(call: Call) {
    if (w.failing.has(call.functionName)) throw new Error(`${call.functionName} reverted`);
    const [id, second, third] = call.args as [bigint, unknown, unknown];
    switch (call.functionName) {
      case "enqueue":
        if (w.failEnqueue) throw new Error("enqueue reverted: insufficient funds for gas");
        w.available += BigInt((second as unknown[]).length);
        break;
      case "publishKey":
        at(id).publishedKeys[Number(second)] = third as bigint;
        at(id).auction.publishedCount += 1;
        break;
      case "openMany":
        for (const slot of second as number[]) at(id).bids[slot]!.opened = true;
        at(id).auction.openedCount += (second as number[]).length;
        break;
      case "settle":
        at(id).auction.status = STATUS.Settled;
        break;
      case "handOffSeed":
        at(id).auction.seedState = SEED.HandedOff;
        break;
      case "burnForfeits":
        at(id).auction.forfeitsBurned = true;
        break;
    }
    sent.push(call);
    return "0x01" as const;
  }

  const chain = {
    publicClient,
    deployment: { auction: "0x00000000000000000000000000000000000000a1", registry: "0x00000000000000000000000000000000000000a2", seeder: "0x00000000000000000000000000000000000000a3" },
    readBatch: READ_BATCH,
    send,
  } as unknown as ChainContext;
  const keeper: Keeper = { chain, store, index, queueTarget: 3, log: (event, data) => logs.push({ event, data }), clock: () => w.host };
  return { keeper, sent, logs, blockTags, reads, secret: secrets[0]! };
}

describe("runPass on a fake chain", () => {
  it("opens an auction of more than 100 bids, reading only a JSON-RPC batch's worth at a time", async () => {
    const w = world(paired(120));
    const { keeper, sent, reads } = fakeKeeper(w, 1);

    const report = await runPass(keeper);

    expect(report.sent).toEqual(["openMany", "openMany", "openMany", "settle"]);
    const opened = sent.filter((call) => call.functionName === "openMany").map((call) => call.args[1] as number[]);
    expect(opened.map((slots) => slots.length)).toEqual([50, 50, 20]);
    expect(opened.flat()).toEqual(Array.from({ length: 120 }, (_, slot) => slot));
    expect(reads.maxInFlight).toBeLessThanOrEqual(READ_BATCH);
  });

  it("publishes only once the finalized block, not Monad's speculative latest block, reaches the deadline", async () => {
    const w = world();
    w.latest = 1_000n; // the Proposed block is past the deadline...
    w.finalized = 999n; // ...but the finalized one is not
    const { keeper, sent, blockTags, secret } = fakeKeeper(w, 2);

    expect((await runPass(keeper)).sent).toEqual([]);
    expect(blockTags).toContain("finalized");
    expect(blockTags).not.toContain("latest");

    w.finalized = 1_100n;
    expect((await runPass(keeper)).sent).toEqual(["publishKey"]);
    expect(sent[0]!.args).toEqual([1n, 2, secret]);
  });

  it("does not publish while the host clock is before the deadline, whatever the RPC says", async () => {
    const w = world();
    w.host = 999n;
    const { keeper } = fakeKeeper(w, 0);

    expect((await runPass(keeper)).sent).toEqual([]);
    w.host = 1_000n;
    expect((await runPass(keeper)).sent).toEqual(["publishKey"]);
  });

  it("keeps publishing when the key refill fails, and logs the failure", async () => {
    const w = world();
    w.available = 0n;
    w.failEnqueue = true;
    const { keeper, logs } = fakeKeeper(w, 0);

    const report = await runPass(keeper);

    expect(report.sent).toEqual(["publishKey"]);
    expect(logs).toContainEqual({ event: "refill-error", data: { error: expect.stringMatching(/insufficient funds/) } });
  });

  it("publishes for every auction before opening any, and caps opening per auction per pass", async () => {
    const w = world(paired(6 * 50), fakeAuction());
    const { keeper, sent } = fakeKeeper(w, 0);

    const first = await runPass(keeper);
    expect(first.sent).toEqual(["publishKey", ...Array.from({ length: OPEN_TX_PER_PASS }, () => "openMany")]);
    expect(sent[0]!.args[0]).toBe(2n);

    const second = await runPass(keeper);
    expect(second.sent).toEqual(["openMany", "openMany", "settle"]);
    expect(w.auctions[0]!.bids.every((bid) => bid.opened)).toBe(true);
  });

  it("stops re-reading auctions that are finished", async () => {
    const w = world(
      fakeAuction({ status: STATUS.Settled }),
      fakeAuction({ status: STATUS.Cancelled }),
      fakeAuction({ commitDeadline: 9_000n, cancelAfter: 99_000n }),
    );
    const { keeper, reads } = fakeKeeper(w, 0);

    await runPass(keeper);
    expect(new Set(reads.auctions)).toEqual(new Set([1n, 2n, 3n]));
    reads.auctions.length = 0;
    await runPass(keeper);
    expect(new Set(reads.auctions)).toEqual(new Set([3n]));
  });

  it("burns forfeits even when handing off the seed keeps failing", async () => {
    const w = world(fakeAuction({ status: STATUS.Settled, seedState: SEED.Reserved, forfeitedTotal: 10n }));
    w.failing.add("handOffSeed");
    const { keeper, logs } = fakeKeeper(w, 0);

    expect((await runPass(keeper)).sent).toEqual(["burnForfeits"]);
    expect(logs).toContainEqual({ event: "action-error", data: { id: "1", action: "handOffSeed", error: expect.stringMatching(/reverted/) } });
  });

  it("raises an alert, once, when the store has no secret for an open auction's key", async () => {
    const lost = fakeAuction();
    lost.secretLost = true;
    const w = world(lost);
    const { keeper, logs } = fakeKeeper(w, 1);

    expect((await runPass(keeper)).sent).toEqual([]);
    await runPass(keeper);
    const alerts = logs.filter((entry) => entry.event === "key-missing");
    expect(alerts).toEqual([{ event: "key-missing", data: expect.objectContaining({ level: "alert", id: "1" }) }]);
  });
});
