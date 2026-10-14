import { getAddress, type Address } from "viem";
import { describe, expect, it } from "vitest";
import { defaultForm, planAuction, toCreateParams, START_BUFFER, type CreateContext } from "../src/chain/create";
import { deploymentFor, networkFor } from "../src/chain/config";
import { formatAmount, parseAmount } from "../src/chain/format";
import { kuruPriceOf, kuruProblem, suggestKuruParams, type KuruParams, type SeedLadder } from "../src/chain/kuru";
import { bidProblem, phaseOf, priceAt, publicActions, STATUS, type RawAuction } from "../src/chain/model";

const quote = getAddress("0x00000000000000000000000000000000000000a5");
const sale = getAddress("0x00000000000000000000000000000000000000b5");
const authority = getAddress("0x00000000000000000000000000000000000000c5");
const bidder = getAddress("0x00000000000000000000000000000000000000d5");

const deploymentJson = {
  chainId: 31337,
  deployBlock: 0,
  registry: "0x00000000000000000000000000000000000000a1",
  auction: "0x00000000000000000000000000000000000000a2",
  seeder: "0x00000000000000000000000000000000000000a3",
  factory: "0x00000000000000000000000000000000000000a4",
  quote,
};

function auction(patch: Partial<RawAuction> = {}): RawAuction {
  return {
    authority,
    saleToken: sale,
    quoteToken: quote,
    supply: 1000n * 10n ** 18n,
    lotSize: 10n ** 18n,
    supplyLots: 1000n,
    minPrice: 2_500_000n,
    stepSize: 100_000n,
    stepCount: 6,
    deposit: 1_000_000_000n,
    maxNotional: 1_000_000_000n,
    maxBids: 10_000,
    commitStart: 100n,
    commitDeadline: 200n,
    cancelAfter: 900n,
    status: STATUS.Open,
    bidCount: 0,
    openedCount: 0,
    publishedCount: 0,
    pairA: 0,
    pairB: 0,
    clearingStep: 0,
    clearingPrice: 0n,
    aboveTotal: 0n,
    remaining: 0n,
    atDemand: 0n,
    totalSold: 0n,
    forfeitedTotal: 0n,
    forfeitsBurned: false,
    unsoldReclaimed: false,
    proceedsReclaimed: false,
    seedSaleLots: 0n,
    seedQuoteBps: 0,
    seedLockUntil: 0n,
    seedState: 0,
    seedSale: 0n,
    seedQuote: 0n,
    ...patch,
  };
}

describe("format", () => {
  it("formats with separators and trims fractions", () => {
    expect(formatAmount(1_234_567_890n, 6)).toBe("1,234.5678");
    expect(formatAmount(2_500_000n, 6)).toBe("2.5");
    expect(formatAmount(10n ** 21n, 18)).toBe("1,000");
  });

  it("parses plain decimals within the token's precision", () => {
    expect(parseAmount("2.5", 6)).toBe(2_500_000n);
    expect(parseAmount("1,000", 6)).toBe(1_000_000_000n);
    expect(parseAmount("2.5000001", 6)).toBeNull();
    expect(parseAmount("-1", 6)).toBeNull();
    expect(parseAmount("abc", 6)).toBeNull();
  });
});

describe("phaseOf and publicActions (P3)", () => {
  it("walks through every phase", () => {
    expect(phaseOf(auction(), 50n)).toBe("scheduled");
    expect(phaseOf(auction(), 150n)).toBe("bidding");
    expect(phaseOf(auction({ bidCount: 2, publishedCount: 1 }), 300n)).toBe("awaitingKeys");
    expect(phaseOf(auction({ bidCount: 2, publishedCount: 1 }), 900n)).toBe("cancellable");
    expect(phaseOf(auction({ bidCount: 2, publishedCount: 2, openedCount: 1 }), 950n)).toBe("opening");
    expect(phaseOf(auction({ bidCount: 2, publishedCount: 2, openedCount: 2 }), 950n)).toBe("ready");
    expect(phaseOf(auction({ status: STATUS.Settled }), 950n)).toBe("settled");
    expect(phaseOf(auction({ status: STATUS.Cancelled }), 950n)).toBe("cancelled");
  });

  it("offers open, settle and cancel only when the contract allows them", () => {
    expect(publicActions("opening")).toEqual(["openRemaining"]);
    expect(publicActions("ready")).toEqual(["settle"]);
    expect(publicActions("cancellable")).toEqual(["cancel"]);
    expect(publicActions("awaitingKeys")).toEqual([]);
    expect(publicActions("bidding")).toEqual([]);
  });
});

describe("bidProblem (P4)", () => {
  const base = { account: bidder as Address, alreadyBid: false, now: 150n, step: 5, lots: 10n };

  it("accepts a valid bid", () => {
    expect(bidProblem(auction(), base)).toBeNull();
  });

  it("blocks every case the contract would reject or not count", () => {
    expect(bidProblem(auction(), { ...base, account: null })).toMatch(/Connect/);
    expect(bidProblem(auction(), { ...base, now: 250n })).toMatch(/not open/);
    expect(bidProblem(auction(), { ...base, account: authority })).toMatch(/creator/);
    expect(bidProblem(auction(), { ...base, alreadyBid: true })).toMatch(/already/);
    expect(bidProblem(auction({ bidCount: 10_000 }), base)).toMatch(/slot/);
    expect(bidProblem(auction(), { ...base, step: 6 })).toMatch(/ladder/);
    expect(bidProblem(auction(), { ...base, lots: 0n })).toMatch(/how many/);
    // 3.0 tUSD × 334 = 1,002 tUSD, above the 1,000 tUSD deposit.
    expect(priceAt(auction(), 5)).toBe(3_000_000n);
    expect(bidProblem(auction(), { ...base, lots: 334n })).toMatch(/more than one bid may spend/);
    expect(bidProblem(auction(), { ...base, lots: 333n })).toBeNull();
  });
});

describe("kuru (C3, C4)", () => {
  const ladder: SeedLadder = { minPrice: 2_500_000n, stepSize: 100_000n, stepCount: 6, lotSize: 10n ** 18n, saleDecimals: 18, quoteDecimals: 6 };
  const seederTestParams: KuruParams = {
    sizePrecision: 100_000_000n, pricePrecision: 10_000, tickSize: 10, minSize: 1_000_000n, maxSize: 10n ** 16n,
    takerFeeBps: 0n, makerFeeBps: 0n, kuruAmmSpread: 100n,
  };

  it("converts like MarketSeeder (2.5 tUSD at pricePrecision 1e4 is 25,000)", () => {
    expect(kuruPriceOf(2_500_000n, ladder, 10_000)).toBe(25_000n);
    expect(kuruProblem(ladder, seederTestParams)).toBeNull();
  });

  it("rejects what MarketSeeder.validate rejects", () => {
    expect(kuruProblem(ladder, { ...seederTestParams, tickSize: 300 })).toMatch(/between Kuru ticks/);
    expect(kuruProblem({ ...ladder, minPrice: 2_500_001n }, seederTestParams)).toMatch(/exactly/);
    expect(kuruProblem({ ...ladder, minPrice: 100n, stepSize: 100n }, { ...seederTestParams, tickSize: 1 })).toMatch(/two Kuru ticks/);
    expect(kuruProblem({ ...ladder, minPrice: 500_000_000_000n }, seederTestParams)).toMatch(/too high/);
    expect(kuruProblem(ladder, { ...seederTestParams, sizePrecision: 0n })).toMatch(/non-zero/);
    expect(kuruProblem(ladder, { ...seederTestParams, kuruAmmSpread: 15n })).toMatch(/spread/);
  });

  it("suggests valid parameters for a 6-decimal and an 18-decimal quote", () => {
    const usdc = suggestKuruParams(ladder, 1000n * 10n ** 18n);
    expect(usdc).toMatchObject({ pricePrecision: 1_000_000, tickSize: 1000, sizePrecision: 100_000_000n, minSize: 1_000_000n });
    expect(kuruProblem(ladder, usdc)).toBeNull();
    const mon = { ...ladder, minPrice: 5n * 10n ** 17n, stepSize: 10n ** 17n, quoteDecimals: 18 };
    const monParams = suggestKuruParams(mon, 1000n * 10n ** 18n);
    expect(monParams.pricePrecision).toBe(1_000_000_000);
    expect(kuruProblem(mon, monParams)).toBeNull();
  });
});

describe("planAuction (P1, P10)", () => {
  const ctx: CreateContext = { saleToken: sale, saleDecimals: 18, quoteToken: quote, quoteDecimals: 6, allowedQuotes: [quote] };

  it("plans the default form", () => {
    const { plan, errors } = planAuction(defaultForm, ctx);
    expect(errors).toEqual({});
    expect(plan).toMatchObject({ supply: 1000n * 10n ** 18n, lotSize: 10n ** 18n, minPrice: 2_500_000n, stepSize: 100_000n, stepCount: 6, seedSaleLots: 100n, seedQuoteBps: 2_000 });
    expect(plan?.kuru?.tickSize).toBe(1000);
  });

  it("reports a form error for each createAuction revert", () => {
    const cases: [Partial<typeof defaultForm>, string][] = [
      [{ supplyTokens: "0" }, "supplyTokens"], // BadSupply
      [{ supplyTokens: "1.5" }, "supplyTokens"], // BadLot
      [{ stepCount: "0" }, "stepCount"], // BadGrid
      [{ stepCount: "65" }, "stepCount"],
      [{ floorPrice: "0" }, "floorPrice"],
      [{ stepPrice: "0" }, "stepPrice"],
      [{ deposit: "0" }, "deposit"], // BadDeposit
      [{ deposit: "2" }, "deposit"],
      [{ maxBids: "0" }, "maxBids"], // BadBids
      [{ maxBids: "65536" }, "maxBids"],
      [{ biddingMinutes: "0" }, "biddingMinutes"], // BadSchedule
      [{ biddingMinutes: String(30 * 24 * 60 + 1) }, "biddingMinutes"],
      [{ cancelGapMinutes: "9" }, "cancelGapMinutes"],
      [{ seedTokens: "1001" }, "seedTokens"], // BadSeed
      [{ seedQuotePercent: "100.01" }, "seedQuotePercent"],
      [{ seedTokens: "0", seedQuotePercent: "0" }, "seedTokens"],
      [{ floorPrice: "2.5000001" }, "floorPrice"],
    ];
    for (const [patch, key] of cases) {
      const { plan, errors } = planAuction({ ...defaultForm, ...patch }, ctx);
      expect(plan, JSON.stringify(patch)).toBeNull();
      expect(errors, JSON.stringify(patch)).toHaveProperty(key);
    }
  });

  it("only offers allow-listed payment tokens (P10)", () => {
    const other = getAddress("0x00000000000000000000000000000000000000e5");
    expect(planAuction(defaultForm, { ...ctx, quoteToken: other }).errors).toHaveProperty("quoteToken");
  });

  it("rejects selling the payment token and selling more than the wallet holds", () => {
    expect(planAuction(defaultForm, { ...ctx, saleToken: quote }).errors).toHaveProperty("saleToken");
    expect(planAuction(defaultForm, { ...ctx, balance: 999n * 10n ** 18n }).errors).toHaveProperty("balance");
  });

  it("flags a ladder Kuru cannot list", () => {
    expect(planAuction({ ...defaultForm, floorPrice: "0.000001", stepPrice: "0.000001" }, ctx).errors).toHaveProperty("kuru");
  });

  it("builds the schedule from chain time and zeroes seeding when it is off", () => {
    const { plan } = planAuction({ ...defaultForm, seed: false }, ctx);
    const params = toCreateParams(plan!, sale, quote, 1_000n);
    expect(params.commitStart).toBe(1_000n + START_BUFFER);
    expect(params.commitDeadline).toBe(params.commitStart + 30n * 60n);
    expect(params.cancelAfter).toBe(params.commitDeadline + 60n * 60n);
    expect(params).toMatchObject({ seedSaleLots: 0n, seedQuoteBps: 0, seedLockUntil: 0n, kuruParams: "0x", maxNotional: params.deposit });
    const seeded = toCreateParams(planAuction(defaultForm, ctx).plan!, sale, quote, 1_000n);
    expect(seeded.seedLockUntil).toBe(seeded.cancelAfter + 7n * 86_400n);
    expect(seeded.kuruParams.length).toBe(2 + 8 * 64);
  });
});

describe("network config", () => {
  it("loads the deployment for the chain", () => {
    expect(deploymentFor(31337, { "../../deployments/31337.json": deploymentJson })?.auction).toBe(getAddress(deploymentJson.auction));
    expect(deploymentFor(10143, { "../../deployments/31337.json": deploymentJson })).toBeNull();
  });

  it("allows USDC on mainnet and the deployed test quote elsewhere", () => {
    expect(networkFor("mainnet", {}).quoteTokens).toEqual([getAddress("0x754704Bc059F8C67012fEd69BC8A327a5aafb603")]);
    expect(networkFor("local", { "/deployments/31337.json": deploymentJson }).quoteTokens).toEqual([quote]);
    expect(networkFor("testnet", {}).quoteTokens).toEqual([]);
  });
});
