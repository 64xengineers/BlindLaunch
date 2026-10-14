import { encodeAbiParameters, type Hex } from "viem";

/** `MarketSeeder.KuruParams`. Units: price = human quote-per-base × pricePrecision; size = human base × sizePrecision. */
export type KuruParams = {
  sizePrecision: bigint;
  pricePrecision: number;
  tickSize: number;
  minSize: bigint;
  maxSize: bigint;
  takerFeeBps: bigint;
  makerFeeBps: bigint;
  kuruAmmSpread: bigint;
};

export type SeedLadder = {
  minPrice: bigint;
  stepSize: bigint;
  stepCount: number;
  lotSize: bigint;
  saleDecimals: number;
  quoteDecimals: number;
};

const UINT32_MAX = 2n ** 32n - 1n;
const UINT96_MAX = 2n ** 96n - 1n;

/** Same conversion as `MarketSeeder._kuruPrice`; null when the price is not a whole Kuru price. */
export function kuruPriceOf(price: bigint, ladder: SeedLadder, pricePrecision: number): bigint | null {
  const numerator = price * BigInt(pricePrecision) * 10n ** BigInt(ladder.saleDecimals);
  const denominator = 10n ** BigInt(ladder.quoteDecimals) * ladder.lotSize;
  return numerator % denominator === 0n ? numerator / denominator : null;
}

/** 10^n for some n >= 0, as Kuru requires of both precisions. */
export function isPowerOfTen(value: bigint | number): boolean {
  if (typeof value === "number" && !Number.isSafeInteger(value)) return false;
  let rest = BigInt(value);
  if (rest <= 0n) return false;
  while (rest % 10n === 0n) rest /= 10n;
  return rest === 1n;
}

/**
 * Market parameters for a ladder: price precision of up to 9 quote decimals, a power-of-ten tick
 * near 10 bps of the floor that every ladder price lands on, 8 size decimals, Kuru's default fees,
 * and a largest order above the smallest.
 */
export function suggestKuruParams(ladder: SeedLadder, supply: bigint): KuruParams {
  const pricePrecision = 10 ** Math.min(ladder.quoteDecimals, 9);
  const floor = kuruPriceOf(ladder.minPrice, ladder, pricePrecision) ?? 0n;
  const step = ladder.stepCount > 1 ? (kuruPriceOf(ladder.stepSize, ladder, pricePrecision) ?? 0n) : 0n;
  let tick = 1n;
  while (tick * 10n * 1_000n <= floor) tick *= 10n;
  while (tick > 1n && (floor % tick !== 0n || step % tick !== 0n || floor < 2n * tick)) tick /= 10n;
  const sizePrecision = 10n ** BigInt(Math.min(ladder.saleDecimals, 8));
  const minSize = sizePrecision >= 100n ? sizePrecision / 100n : 1n;
  let maxSize = (supply * sizePrecision) / 10n ** BigInt(ladder.saleDecimals);
  if (maxSize > UINT96_MAX) maxSize = UINT96_MAX;
  // Kuru wants the largest order strictly above the smallest, even for a supply under one minimum order.
  if (maxSize <= minSize) maxSize = minSize * 10n;
  return { sizePrecision, pricePrecision, tickSize: Number(tick), minSize, maxSize, takerFeeBps: 30n, makerFeeBps: 10n, kuruAmmSpread: 100n };
}

/**
 * Mirrors `MarketSeeder.validate` (and the Kuru Router rules its `_decode` copies), so a bad ladder
 * is reported in the form, not as a revert.
 */
export function kuruProblem(ladder: SeedLadder, k: KuruParams): string | null {
  if (k.sizePrecision === 0n || k.pricePrecision === 0 || k.tickSize === 0 || k.minSize === 0n) return "Kuru parameters must be non-zero.";
  if (!isPowerOfTen(k.sizePrecision) || !isPowerOfTen(k.pricePrecision)) return "Kuru price and size precision must be powers of ten.";
  if (k.maxSize <= k.minSize) return "Kuru maximum order size must be above the minimum.";
  if (k.takerFeeBps >= 10_000n) return "Kuru fees must be under 100%.";
  if (k.makerFeeBps > k.takerFeeBps) return "Kuru maker fee must be at most the taker fee.";
  if (k.kuruAmmSpread < 10n || k.kuruAmmSpread >= 500n || k.kuruAmmSpread % 10n !== 0n) return "Kuru AMM spread must be 10 to 490 bps in steps of 10.";
  if (ladder.saleDecimals > 36 || ladder.quoteDecimals > 36) return "Tokens with more than 36 decimals are not supported.";
  const tick = BigInt(k.tickSize);
  for (let step = 0; step < ladder.stepCount; step += 1) {
    const kuruPrice = kuruPriceOf(ladder.minPrice + BigInt(step) * ladder.stepSize, ladder, k.pricePrecision);
    if (kuruPrice === null) return "A ladder price cannot be expressed exactly on Kuru. Use fewer decimals.";
    // Like MarketSeeder, a Kuru price must stay strictly below 2^32 - 1.
    if (kuruPrice >= UINT32_MAX) return "The top price is too high for a Kuru market.";
    if (kuruPrice % tick !== 0n) return "A ladder price falls between Kuru ticks.";
    if (step === 0 && kuruPrice < 2n * tick) return "The lowest price must be at least two Kuru ticks.";
  }
  return null;
}

export function encodeKuruParams(k: KuruParams): Hex {
  return encodeAbiParameters(
    [
      { type: "uint96" }, { type: "uint32" }, { type: "uint32" }, { type: "uint96" },
      { type: "uint96" }, { type: "uint256" }, { type: "uint256" }, { type: "uint96" },
    ],
    [k.sizePrecision, k.pricePrecision, k.tickSize, k.minSize, k.maxSize, k.takerFeeBps, k.makerFeeBps, k.kuruAmmSpread],
  );
}
