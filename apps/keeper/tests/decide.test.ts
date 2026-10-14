import { describe, expect, it } from "vitest";
import { batches, nextActions, PUBLISH_CANCEL_MARGIN, PUBLISH_STAGGER, SEED, STATUS, type AuctionView } from "../src/decide";

const base: AuctionView = {
  id: 1n,
  status: STATUS.Open,
  bidCount: 3,
  openedCount: 0,
  publishedCount: 0,
  pairA: 0,
  pairB: 0,
  commitDeadline: 1_000n,
  cancelAfter: 2_000n,
  seedState: SEED.None,
  forfeitedTotal: 0n,
  forfeitsBurned: false,
  publishedKeys: [0n, 0n, 0n],
};

describe("nextActions", () => {
  it("publishes only once the chain, not the local clock, reaches the deadline (K3, audit M3)", () => {
    expect(nextActions(base, { keeper: 0, haveSecret: true, chainTime: 999n, hostTime: 999n })).not.toContain("publish");
    expect(nextActions(base, { keeper: 0, haveSecret: true, chainTime: 1_000n, hostTime: 1_000n })).toContain("publish");
  });

  it("does not publish after cancelAfter, without the secret, twice, as a third key, or for an auction with no bids (K3)", () => {
    const ctx = { keeper: 0 as const, haveSecret: true, chainTime: 1_500n, hostTime: 1_500n };
    expect(nextActions(base, { ...ctx, chainTime: 2_000n, hostTime: 2_000n })).not.toContain("publish");
    expect(nextActions(base, { ...ctx, haveSecret: false })).not.toContain("publish");
    expect(nextActions({ ...base, publishedKeys: [5n, 0n, 0n], publishedCount: 1 }, ctx)).not.toContain("publish");
    expect(nextActions({ ...base, publishedCount: 2 }, ctx)).not.toContain("publish");
    expect(nextActions({ ...base, bidCount: 0 }, ctx)).not.toContain("publish");
  });

  it("also waits for the host clock to reach the deadline, so one RPC cannot release a key early", () => {
    expect(nextActions(base, { keeper: 0, haveSecret: true, chainTime: 1_500n, hostTime: 999n })).toEqual([]);
    expect(nextActions(base, { keeper: 0, haveSecret: true, chainTime: 1_500n, hostTime: 1_000n })).toEqual(["publish"]);
  });

  it("staggers keepers by index after the deadline, so they do not publish in lockstep", () => {
    const at = (keeper: 0 | 1 | 2, chainTime: bigint) => nextActions(base, { keeper, haveSecret: true, chainTime, hostTime: chainTime });
    expect(at(0, 1_000n)).toEqual(["publish"]);
    expect(at(1, 1_000n + PUBLISH_STAGGER - 1n)).toEqual([]);
    expect(at(1, 1_000n + PUBLISH_STAGGER)).toEqual(["publish"]);
    expect(at(2, 1_000n + 2n * PUBLISH_STAGGER - 1n)).toEqual([]);
    expect(at(2, 1_000n + 2n * PUBLISH_STAGGER)).toEqual(["publish"]);
  });

  it("does not publish within the safety margin before cancelAfter", () => {
    const at = (chainTime: bigint) => nextActions(base, { keeper: 0, haveSecret: true, chainTime, hostTime: chainTime });
    expect(at(2_000n - PUBLISH_CANCEL_MARGIN - 1n)).toEqual(["publish"]);
    expect(at(2_000n - PUBLISH_CANCEL_MARGIN)).toEqual([]);
  });

  it("opens, then settles, once a pair exists", () => {
    const paired = { ...base, publishedCount: 2 };
    const ctx = { keeper: 1 as const, haveSecret: false, chainTime: 1_500n, hostTime: 1_500n };
    expect(nextActions(paired, ctx)).toEqual(["open"]);
    expect(nextActions({ ...paired, openedCount: 3 }, ctx)).toEqual(["settle"]);
  });

  it("settles an auction with no bids once two keys exist", () => {
    expect(nextActions({ ...base, bidCount: 0, publishedCount: 2 }, { keeper: 0, haveSecret: true, chainTime: 1_500n, hostTime: 1_500n })).toEqual(["settle"]);
  });

  it("cancels when cancelAfter passes without a pair", () => {
    const ctx = { keeper: 2 as const, haveSecret: true, chainTime: 2_000n, hostTime: 2_000n };
    expect(nextActions({ ...base, publishedCount: 1 }, ctx)).toEqual(["cancel"]);
    expect(nextActions({ ...base, publishedCount: 2 }, ctx)).toEqual(["open"]);
  });

  it("hands off the seed and burns forfeits after settlement", () => {
    const settled = { ...base, status: STATUS.Settled, seedState: SEED.Reserved, forfeitedTotal: 10n };
    const ctx = { keeper: 0 as const, haveSecret: true, chainTime: 3_000n, hostTime: 3_000n };
    expect(nextActions(settled, ctx)).toEqual(["handOffSeed", "burnForfeits"]);
    expect(nextActions({ ...settled, seedState: SEED.HandedOff, forfeitsBurned: true }, ctx)).toEqual(["retrySeed"]);
  });

  it("does nothing for a cancelled auction", () => {
    expect(nextActions({ ...base, status: STATUS.Cancelled }, { keeper: 0, haveSecret: true, chainTime: 9_000n, hostTime: 9_000n })).toEqual([]);
  });
});

describe("batches (K6)", () => {
  it("splits 120 items into 50, 50 and 20", () => {
    expect(batches(Array.from({ length: 120 }, (_, i) => i), 50).map((batch) => batch.length)).toEqual([50, 50, 20]);
  });
});
