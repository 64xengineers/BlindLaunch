import { getAddress } from "viem";
import { describe, expect, it } from "vitest";
import { SEED, STATUS, type AuctionView, type BidView, type Phase, type TokenMeta } from "../src/chain/model";
import { AMOUNT_STEPS, bidReceipt, cleanLots, lotsForSpend, lotsOf, spendCap, spendPresets } from "../src/chain/receipt";
import { hasKuru, kuruRule, lotPriceText, moneyText, noSaleText, outcomeOf, phaseMessage, priceText, tipsFor, tokensText, trackerOf, unitText, wholeLots } from "../src/components/auction";
import { loadView } from "../src/screens/AuctionPage";
import { lootOf, money } from "../src/screens/ResultPage";

const USDC: TokenMeta = { address: getAddress("0x00000000000000000000000000000000000000a5"), name: "USD Coin", symbol: "USDC", decimals: 6 };
const USDM: TokenMeta = { address: getAddress("0x00000000000000000000000000000000000000a6"), name: "USD Money", symbol: "USDM", decimals: 18 };
const WMON: TokenMeta = { address: getAddress("0x00000000000000000000000000000000000000a7"), name: "Wrapped MON", symbol: "WMON", decimals: 18 };
const NCAT: TokenMeta = { address: getAddress("0x00000000000000000000000000000000000000b5"), name: "Neon Cat", symbol: "NCAT", decimals: 18 };
const TKN6: TokenMeta = { address: getAddress("0x00000000000000000000000000000000000000b6"), name: "Six", symbol: "TKN", decimals: 6 };

const E18 = 10n ** 18n;
const usd = (dollars: number) => BigInt(Math.round(dollars * 100)) * 10_000n; // 6-decimal dollars

/** $2.50 + $0.10 a step, six steps, $1,000 bid money, whole NCAT lots, USDC quote. */
function auction(patch: Partial<AuctionView> = {}): AuctionView {
  return {
    id: 4n,
    sale: NCAT,
    quote: USDC,
    authority: getAddress("0x00000000000000000000000000000000000000c5"),
    saleToken: NCAT.address,
    quoteToken: USDC.address,
    supply: 1000n * E18,
    lotSize: E18,
    supplyLots: 1000n,
    minPrice: usd(2.5),
    stepSize: usd(0.1),
    stepCount: 6,
    deposit: usd(1000),
    maxNotional: usd(1000),
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
  } as AuctionView;
}

/* ---------- the bid receipt ---------- */

describe("bid receipt", () => {
  it("$500 at $2.70 buys 185 tokens, pays at most $499.50 and $500.50 comes back for sure", () => {
    const a = auction();
    const presets = spendPresets(a, USDC);
    expect(presets.map((p) => p.key)).toEqual(["100", "250", "500", "max"]);
    expect(presets.map((p) => p.label)).toEqual(["$100", "$250", "$500", "MAX"]);
    expect(presets.map((p) => p.spend)).toEqual([usd(100), usd(250), usd(500), usd(1000)]);

    const lots = lotsForSpend(a, usd(500), 2);
    expect(lots).toBe(185n);
    const r = bidReceipt(a, 2, lots);
    expect(r.price).toBe(usd(2.7));
    expect(r.tokens).toBe(185n * E18);
    expect(r.maxPay).toBe(usd(499.5));
    expect(r.back).toBe(usd(500.5));
    expect(r).toMatchObject({ cap: usd(1000), maxLots: 370n, over: false, valid: true });
    expect(tokensText(a, lots)).toBe("185 NCAT");
    expect(moneyText(r.maxPay, USDC)).toBe("$499.50");
    expect(moneyText(r.back, USDC)).toBe("$500.50");
    expect(r.maxPay + r.back).toBe(a.deposit);
  });

  it("MAX spends the whole cap, rounded down to whole lots", () => {
    const a = auction();
    const max = spendPresets(a, USDC).at(-1)!;
    expect(max).toEqual({ key: "max", label: "MAX", spend: usd(1000) });
    // $1,000 / $2.70 = 370.37 -> 370 lots, $999.00, $1.00 back.
    expect(lotsForSpend(a, max.spend, 2)).toBe(370n);
    expect(bidReceipt(a, 2, 370n)).toMatchObject({ maxPay: usd(999), back: usd(1), over: false, valid: true });
    // $1,000 / $2.50 is exact: everything is at risk, nothing comes back for sure, still valid.
    expect(lotsForSpend(a, max.spend, 0)).toBe(400n);
    expect(bidReceipt(a, 0, 400n)).toMatchObject({ maxPay: usd(1000), back: 0n, over: false, valid: true });
    expect(bidReceipt(a, 0, 401n)).toMatchObject({ over: true, valid: false });
  });

  it("caps spend at maxNotional when it is below the deposit, while the whole deposit is still locked", () => {
    const a = auction({ maxNotional: usd(300) });
    expect(spendCap(a)).toBe(usd(300));
    const presets = spendPresets(a, USDC);
    expect(presets.map((p) => p.key)).toEqual(["100", "250", "max"]);
    expect(presets.at(-1)!.spend).toBe(usd(300));
    const lots = lotsForSpend(a, usd(300), 2);
    expect(lots).toBe(111n);
    expect(bidReceipt(a, 2, 111n)).toMatchObject({ cap: usd(300), maxLots: 111n, maxPay: usd(299.7), back: usd(700.3), over: false, valid: true });
    // 112 x $2.70 = $302.40: under the $1,000 deposit but over the per-bid limit.
    expect(bidReceipt(a, 2, 112n)).toMatchObject({ over: true, valid: false });
    // A maxNotional above the deposit leaves the deposit as the cap.
    expect(spendCap(auction({ maxNotional: usd(5000) }))).toBe(usd(1000));
  });

  it("offers only amounts strictly under the cap, so MAX never repeats one", () => {
    expect(spendPresets(auction({ deposit: usd(500), maxNotional: usd(500) }), USDC).map((p) => p.key)).toEqual(["100", "250", "max"]);
    expect(spendPresets(auction({ deposit: usd(250), maxNotional: usd(250) }), USDC).map((p) => p.key)).toEqual(["100", "max"]);
    expect(spendPresets(auction({ deposit: usd(50), maxNotional: usd(50) }), USDC)).toEqual([{ key: "max", label: "MAX", spend: usd(50) }]);
    expect(AMOUNT_STEPS).toEqual([100n, 250n, 500n]);
  });

  it("gives no lots when one lot costs more than the amount", () => {
    const a = auction({ minPrice: usd(150) });
    expect(lotsForSpend(a, usd(100), 0)).toBe(0n);
    expect(lotsForSpend(a, usd(250), 0)).toBe(1n);
  });

  it("counts packs when one lot is not one whole token", () => {
    const packs = auction({ lotSize: 1000n * E18 });
    expect(wholeLots(packs, NCAT)).toBe(false);
    const lots = lotsForSpend(packs, usd(500), 2); // $2.70 per pack of 1,000
    expect(lots).toBe(185n);
    const r = bidReceipt(packs, 2, lots);
    expect(r.tokens).toBe(185_000n * E18);
    expect(r.maxPay).toBe(usd(499.5));
    expect(tokensText(packs, lots)).toBe("185,000 NCAT");

    const halves = auction({ lotSize: E18 / 2n });
    expect(wholeLots(halves, NCAT)).toBe(false);
    expect(bidReceipt(halves, 0, 3n).tokens).toBe((3n * E18) / 2n);
    expect(tokensText(halves, 3n)).toBe("1.5 NCAT");
  });

  it("works for 6-decimal sale tokens and 18-decimal quote tokens", () => {
    const a = auction({ sale: TKN6, quote: USDM, lotSize: 10n ** 6n, deposit: 1000n * E18, maxNotional: 1000n * E18, minPrice: (25n * E18) / 10n, stepSize: E18 / 10n });
    expect(wholeLots(a, TKN6)).toBe(true);
    const presets = spendPresets(a, USDM);
    expect(presets.map((p) => p.spend)).toEqual([100n * E18, 250n * E18, 500n * E18, 1000n * E18]);
    expect(presets.map((p) => p.label)).toEqual(["$100", "$250", "$500", "MAX"]);
    const lots = lotsForSpend(a, 500n * E18, 2);
    expect(lots).toBe(185n);
    const r = bidReceipt(a, 2, lots);
    expect(r.tokens).toBe(185n * 10n ** 6n);
    expect(r.maxPay).toBe((4995n * E18) / 10n);
    expect(r.back).toBe((5005n * E18) / 10n);
    expect(moneyText(r.maxPay, USDM)).toBe("$499.50");
    expect(moneyText(r.back, USDM)).toBe("$500.50");
    expect(tokensText(a, lots)).toBe("185 TKN");
  });

  it("labels amounts without a dollar sign for other quote tokens", () => {
    const a = auction({ quote: WMON, deposit: 1000n * E18, maxNotional: 1000n * E18, minPrice: (25n * E18) / 10n, stepSize: E18 / 10n });
    expect(spendPresets(a, WMON).map((p) => p.label)).toEqual(["100", "250", "500", "MAX"]);
    const r = bidReceipt(a, 2, lotsForSpend(a, 500n * E18, 2));
    expect(moneyText(r.maxPay, WMON)).toBe("499.5 WMON");
    expect(moneyText(r.back, WMON)).toBe("500.5 WMON");
  });

  it("treats empty and zero amounts as nothing to bid, and flags amounts over the limit", () => {
    const a = auction();
    for (const text of ["", "0", "abc"]) {
      const lots = lotsOf(cleanLots(text));
      expect(lots).toBe(0n);
      expect(bidReceipt(a, 2, lots)).toMatchObject({ maxPay: 0n, back: usd(1000), tokens: 0n, over: false, valid: false });
    }
    const huge = lotsOf(cleanLots("99,999,999,999,999,999,999"));
    expect(huge).toBe(99_999_999_999_999_999_999n);
    expect(bidReceipt(a, 2, huge)).toMatchObject({ over: true, valid: false });
    expect(bidReceipt(a, 2, 371n)).toMatchObject({ over: true, valid: false });
    expect(bidReceipt(a, 5, 1n)).toMatchObject({ price: usd(3), maxPay: usd(3), over: false, valid: true });
  });

  it("reads typed amounts as whole lots", () => {
    expect(cleanLots("12.5")).toBe("12");
    expect(cleanLots("1,000")).toBe("1000");
    expect(cleanLots("1 000_000")).toBe("1000000");
    expect(cleanLots("007")).toBe("7");
    expect(cleanLots("000")).toBe("0");
    expect(cleanLots(".5")).toBe("");
    expect(cleanLots("12abc")).toBe("12");
    expect(lotsOf("12")).toBe(12n);
    expect(lotsOf("")).toBe(0n);
    expect(lotsOf("1.5")).toBe(0n);
  });
});

/* ---------- what a bid got (mirrors BlindAuctionV2._allocation / _refundOf / _tokensOf) ---------- */

function bid(patch: Partial<BidView> = {}): BidView {
  return {
    bidder: getAddress("0x00000000000000000000000000000000000000d5"),
    opened: true,
    counted: true,
    forfeited: false,
    refundClaimed: false,
    tokensClaimed: false,
    step: 0,
    quantity: 0n,
    prefix: 0n,
    slot: 0,
    ...patch,
  } as BidView;
}

/** Settled at $2.70 (step 2): 900 lots went above it, 100 left for 300 lots asked at $2.70, so pro rata. */
const settled = (patch: Partial<AuctionView> = {}) =>
  auction({ status: STATUS.Settled, clearingStep: 2, clearingPrice: usd(2.7), aboveTotal: 900n, remaining: 100n, atDemand: 300n, totalSold: 1000n, ...patch });

describe("lootOf", () => {
  it("won in full: above the final price, every lot at the one final price", () => {
    const loot = lootOf(settled(), bid({ step: 4, quantity: 185n }));
    expect(loot).toEqual({ kind: "won", tokens: 185n * E18, asked: 185n * E18, paid: usd(499.5), back: usd(500.5), max: usd(2.9), uncounted: false, percent: 100 });
    expect(money(loot.paid, USDC)).toBe("$499.50");
  });

  it("won in full at the final price when that step was not oversubscribed", () => {
    const loot = lootOf(settled({ atDemand: 80n, remaining: 100n, totalSold: 980n }), bid({ step: 2, quantity: 80n }));
    expect(loot).toMatchObject({ kind: "won", tokens: 80n * E18, paid: usd(216), back: usd(784), percent: 100 });
  });

  it("fair share at the final price: floor(rem*(prefix+q)/D) - floor(rem*prefix/D)", () => {
    // 100 * 250 / 300 = 83, 100 * 100 / 300 = 33 -> 50 of 150.
    const loot = lootOf(settled(), bid({ step: 2, quantity: 150n, prefix: 100n }));
    expect(loot).toEqual({ kind: "fair", tokens: 50n * E18, asked: 150n * E18, paid: usd(135), back: usd(865), max: usd(2.7), uncounted: false, percent: 33 });
  });

  it("fair shares at the final price add up to exactly what was left", () => {
    const a = settled();
    const sizes = [100n, 150n, 50n];
    let prefix = 0n;
    let total = 0n;
    for (const quantity of sizes) {
      const loot = lootOf(a, bid({ step: 2, quantity, prefix }));
      expect(loot.tokens / E18).toBeLessThanOrEqual(quantity);
      total += loot.tokens / E18;
      prefix += quantity;
    }
    expect(total).toBe(a.remaining);
    expect(outcomeOf(a).proRata).toBe(true);
    expect(outcomeOf(settled({ atDemand: 100n })).proRata).toBe(false);
  });

  it("missed: a step below the final price gets nothing and all the money back", () => {
    const loot = lootOf(settled(), bid({ step: 1, quantity: 185n }));
    expect(loot).toEqual({ kind: "missed", tokens: 0n, asked: 185n * E18, paid: 0n, back: usd(1000), max: usd(2.6), uncounted: false, percent: 0 });
  });

  it("a fair share that rounds down to zero lots reads as crowded out, never as priced out", () => {
    // 1 * 1 / 3 rounds to 0: the contract gives 0 lots and a full refund, but the bid was at the final price.
    const a = settled({ remaining: 1n, atDemand: 3n });
    const loot = lootOf(a, bid({ step: 2, quantity: 1n, prefix: 0n }));
    expect(loot).toMatchObject({ kind: "fair", tokens: 0n, back: usd(1000) });
    expect(loot.max).toBe(a.clearingPrice);
  });

  it("not counted: full refund, flagged as uncounted", () => {
    const loot = lootOf(settled(), bid({ step: 4, quantity: 185n, counted: false }));
    expect(loot).toEqual({ kind: "refund", tokens: 0n, asked: 185n * E18, paid: 0n, back: usd(1000), max: usd(2.9), uncounted: true, percent: 0 });
  });

  it("forfeited: the deposit is gone and nothing is bought", () => {
    const loot = lootOf(settled(), bid({ step: 4, quantity: 185n, counted: false, forfeited: true }));
    expect(loot).toMatchObject({ kind: "burned", tokens: 0n, paid: 0n, back: 0n, uncounted: false });
  });

  it("cancelled: the whole deposit comes back, even for a bid that would have won or was forfeited", () => {
    const a = auction({ status: STATUS.Cancelled });
    expect(lootOf(a, bid({ step: 4, quantity: 185n }))).toEqual({ kind: "refund", tokens: 0n, asked: 185n * E18, paid: 0n, back: usd(1000), max: usd(2.9), uncounted: false, percent: 0 });
    expect(lootOf(a, bid({ step: 4, quantity: 185n, forfeited: true }))).toMatchObject({ kind: "refund", back: usd(1000) });
  });

  it("uses lotSize for tokens when one lot is a pack", () => {
    const loot = lootOf(settled({ lotSize: 1000n * E18 }), bid({ step: 2, quantity: 150n, prefix: 100n }));
    expect(loot).toMatchObject({ kind: "fair", tokens: 50_000n * E18, asked: 150_000n * E18, paid: usd(135) });
  });
});

/* ---------- number formats ---------- */

describe("moneyText", () => {
  it("writes dollar quotes with a $ and two decimals, rounded down, with separators", () => {
    expect(moneyText(usd(500), USDC)).toBe("$500.00");
    expect(moneyText(1_234_567_890n, USDC)).toBe("$1,234.56");
    // `cents: false` only drops decimals that are all zero.
    expect(moneyText(1_234_567_890n, USDC, false)).toBe("$1,234.56");
    expect(moneyText(usd(1_000_000), USDC, false)).toBe("$1,000,000");
    expect(moneyText(0n, USDC)).toBe("$0.00");
    expect(moneyText((4995n * E18) / 10n, USDM)).toBe("$499.50");
  });

  it("treats any symbol containing USD as dollars, ignoring case", () => {
    for (const symbol of ["USDC", "USDT", "AUSD", "usdm"]) expect(moneyText(usd(2.5), { ...USDC, symbol })).toBe("$2.50");
  });

  it("writes other quotes as an amount and the symbol, up to four decimals", () => {
    expect(moneyText(1234n * E18 + 567_891_234n * 10n ** 9n, WMON)).toBe("1,234.5678 WMON");
    expect(moneyText(500n * E18, WMON)).toBe("500 WMON");
    expect(moneyText(1234n * E18 + E18 / 2n, WMON, false)).toBe("1,234.5 WMON");
  });

  it("never cuts bid money to whole units: $12.50 stays $12.50 and 0.05 WMON stays 0.05 WMON", () => {
    expect(moneyText(usd(12.5), USDC, false)).toBe("$12.50");
    expect(moneyText(E18 / 20n, WMON, false)).toBe("0.05 WMON");
    expect(moneyText(E18 / 20n, WMON)).toBe("0.05 WMON");
    expect(moneyText(usd(1000), USDC, false)).toBe("$1,000");
    expect(moneyText(500n * E18, WMON, false)).toBe("500 WMON");
  });

  it("keeps two significant digits for amounts under one unit, so they never read as zero", () => {
    expect(moneyText(12_340_000_000_000n, WMON)).toBe("0.000012 WMON"); // 0.00001234
    expect(moneyText(1_200_000_000_000_000n, USDM)).toBe("$0.0012");
    expect(moneyText(1_000n, USDC, false)).toBe("$0.001");
    expect(moneyText(usd(0.05), USDC)).toBe("$0.05");
  });
});

describe("priceText", () => {
  it("uses as many decimals as the price options need, at least two for dollars", () => {
    const a = auction();
    expect(priceText(a, usd(2.7))).toBe("$2.70");
    expect(priceText(a, usd(1234.5))).toBe("$1,234.50");
    const cents = auction({ minPrice: 12_000n, stepSize: 1_000n });
    expect(priceText(cents, 16_000n)).toBe("$0.016");
  });

  it("caps at six decimals, rounding down, when six still tell the options apart", () => {
    const fine = auction({ quote: USDM, minPrice: 1_234_567_891_234_567_891n, stepSize: E18 / 100n });
    expect(priceText(fine, 1_234_567_891_234_567_891n)).toBe("$1.234567");
    const odd = auction({ minPrice: 12_345n, stepSize: 1_000n }); // $0.012345, 6-decimal USDC
    expect(priceText(odd, 12_345n)).toBe("$0.012345");
  });

  it("shows tiny prices with enough digits: never zero, and no two options look the same", () => {
    // 0.000000001 USDM a step: six decimals would show every option as $0.000000.
    const tiny = auction({ quote: USDM, minPrice: 10n ** 9n, stepSize: 10n ** 9n });
    const shown = [0, 1, 2].map((step) => priceText(tiny, 10n ** 9n * BigInt(step + 1)));
    expect(shown).toEqual(["$0.000000001", "$0.000000002", "$0.000000003"]);
    const wmon = auction({ quote: WMON, minPrice: 5n * 10n ** 10n, stepSize: 10n ** 10n });
    expect(priceText(wmon, 5n * 10n ** 10n)).toBe("0.00000005 WMON");
    expect(priceText(wmon, 6n * 10n ** 10n)).toBe("0.00000006 WMON");
    // A 1-wei ladder: options differ only in the last digit, so every digit shows.
    const wei = auction({ quote: USDM, minPrice: 1n, stepSize: 1n });
    expect(priceText(wei, 1_234_567_891_234_567_891n)).toBe("$1.234567891234567891");
    expect(priceText(wei, 1_234_567_891_234_567_892n)).not.toBe(priceText(wei, 1_234_567_891_234_567_891n));
    // A long lowest price keeps four significant digits even below the sixth decimal.
    const long = auction({ quote: USDM, minPrice: 123_456_789n, stepSize: 10n ** 8n });
    expect(priceText(long, 123_456_789n)).toBe("$0.0000000001234");
  });

  it("writes other quotes with the symbol and no forced decimals", () => {
    const quarters = auction({ quote: WMON, minPrice: E18 / 2n, stepSize: E18 / 4n });
    expect(priceText(quarters, (3n * E18) / 4n)).toBe("0.75 WMON");
    expect(priceText(quarters, E18)).toBe("1.00 WMON");
    const whole = auction({ quote: WMON, minPrice: 3n * E18, stepSize: E18 });
    expect(priceText(whole, 1234n * E18)).toBe("1,234 WMON");
  });
});

describe("tokensText and wholeLots", () => {
  it("multiplies lots by the lot size and groups thousands", () => {
    expect(tokensText(auction(), 25_000n)).toBe("25,000 NCAT");
    expect(tokensText(auction({ lotSize: 1000n * E18 }), 25n)).toBe("25,000 NCAT");
    expect(tokensText(auction({ sale: TKN6, lotSize: 10n ** 6n }), 1_234_567n)).toBe("1,234,567 TKN");
  });

  it("knows when one lot is one whole token", () => {
    expect(wholeLots({ lotSize: E18 }, NCAT)).toBe(true);
    expect(wholeLots({ lotSize: 10n ** 6n }, TKN6)).toBe(true);
    expect(wholeLots({ lotSize: E18 }, TKN6)).toBe(false);
    expect(wholeLots({ lotSize: 1000n * E18 }, NCAT)).toBe(false);
  });
});

describe("trackerOf", () => {
  it("puts every phase on the right stage", () => {
    const expected: Record<Phase, ReturnType<typeof trackerOf>> = {
      scheduled: { now: "bid", bad: false, done: false },
      bidding: { now: "bid", bad: false, done: false },
      awaitingKeys: { now: "unlock", bad: false, done: false },
      opening: { now: "unlock", bad: false, done: false },
      ready: { now: "result", bad: false, done: false },
      cancellable: { now: "unlock", bad: true, done: false },
      settled: { now: "result", bad: false, done: true },
      cancelled: { now: "unlock", bad: true, done: false },
    };
    for (const phase of Object.keys(expected) as Phase[]) expect(trackerOf(phase), phase).toEqual(expected[phase]);
  });
});

describe("prices per lot", () => {
  it("says the unit when one lot is a pack, and stays short for whole tokens", () => {
    const packs = auction({ lotSize: 1000n * E18 });
    expect(unitText(auction())).toBe("token");
    expect(unitText(packs)).toBe("pack of 1,000 NCAT");
    expect(unitText(auction({ lotSize: E18 / 2n }))).toBe("pack of 0.5 NCAT");
    expect(lotPriceText(auction(), usd(2.7))).toBe("$2.70");
    expect(lotPriceText(packs, usd(2.7))).toBe("$2.70 per pack of 1,000 NCAT");
  });

  it("says the final price per pack in the settled message", () => {
    const packs = settled({ lotSize: 1000n * E18 });
    expect(phaseMessage("settled", packs, 0n)).toBe("Final price $2.70 per pack of 1,000 NCAT for everyone. Winners can collect.");
    expect(phaseMessage("settled", settled(), 0n)).toBe("Final price $2.70 for everyone. Winners can collect.");
  });
});

describe("Kuru rules and tips", () => {
  const kuru = { seedSaleLots: 100n, seedQuoteBps: 2500, seedLockUntil: 2_000_000_000n };

  it("promises only tokens left unsold, up to the set amount, before settle", () => {
    const text = kuruRule(auction(kuru));
    expect(text).toContain("up to 100 NCAT from the tokens left unsold");
    expect(text).toContain("25% of the money raised");
    expect(text).toMatch(/^Opens at the final price if anything sells/);
    expect(kuruRule(auction({ ...kuru, seedSaleLots: 0n }))).not.toContain("NCAT");
  });

  it("shows the real amounts after settle: min(seedSaleLots, unsold) lots", () => {
    // 1000 lots, 980 sold: only 20 unsold, so Kuru gets 20 NCAT, not 100.
    const a = settled({ ...kuru, totalSold: 980n, seedState: SEED.Reserved, seedSale: 20n * E18, seedQuote: usd(661.5) });
    const text = kuruRule(a);
    expect(text).toContain("20 NCAT and $661.50");
    expect(text).not.toContain("100 NCAT");
    expect(kuruRule(settled({ ...kuru, totalSold: 0n, seedState: SEED.None }))).toBe("No market: nothing was sold");
    expect(kuruRule(auction({ ...kuru, status: STATUS.Cancelled }))).toBe("No market: the launch was called off");
  });

  it("says Kuru is not set up, and never shows the Kuru tip, on launches without Kuru", () => {
    expect(hasKuru(auction())).toBe(false);
    expect(kuruRule(auction())).toBe("Not set up for this launch");
    expect(tipsFor(false).some((tip) => tip.includes("Kuru"))).toBe(false);
    expect(hasKuru(auction(kuru))).toBe(true);
    expect(tipsFor(true).some((tip) => tip.includes("Kuru"))).toBe(true);
    expect(tipsFor(true).length).toBe(tipsFor(false).length + 1);
  });
});

describe("launches that sold nothing or got no bids", () => {
  it("gives a possible reason for a no-sale result and promises no money back to forfeited bids", () => {
    const none = settled({ totalSold: 0n, bidCount: 3, forfeitedTotal: 0n });
    expect(noSaleText(none)).toBe("None of the bids counted, so nothing was sold. Every bidder gets all their bid money back.");
    expect(noSaleText(none)).not.toContain("lowest price");
    const cheat = settled({ totalSold: 0n, bidCount: 3, forfeitedTotal: usd(1000) });
    expect(noSaleText(cheat)).toContain("Bids that broke the rules lose their bid money");
    expect(noSaleText(cheat)).not.toMatch(/everyone/i);
    expect(phaseMessage("settled", cheat, 0n)).toBe(noSaleText(cheat));
  });

  it("says plainly that nobody bid, never that bids are unlocking or keys never came", () => {
    const empty = auction({ bidCount: 0 });
    expect(noSaleText(settled({ totalSold: 0n, bidCount: 0 }))).toMatch(/^Nobody bid/);
    expect(phaseMessage("awaitingKeys", empty, 300n)).toBe("Bidding closed with no bids. Nothing will be sold.");
    expect(phaseMessage("cancellable", empty, 950n)).toBe("Bidding closed with no bids. Anyone can call the launch off now.");
    expect(phaseMessage("awaitingKeys", auction({ bidCount: 2 }), 300n)).toMatch(/Every bid unlocks by itself/);
  });
});

describe("launch page loading", () => {
  it("says 'does not exist' only when the contract has no such launch", () => {
    expect(loadView(null, null, false)).toBe("missing");
    expect(loadView(null, "network down", false)).toBe("missing");
  });

  it("shows a retryable error, not 'does not exist', when the read failed", () => {
    expect(loadView(undefined, "HTTP request failed.", false)).toBe("failed");
    expect(loadView(undefined, null, true)).toBe("loading");
    expect(loadView(undefined, null, false)).toBe("loading");
    expect(loadView({ auction: 1 }, "a later poll failed", false)).toBe("ready");
  });
});
