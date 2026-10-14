import { priceAt, type RawAuction, type TokenMeta } from "./model";

/* The bid receipt's maths, kept pure so the screen and the tests share it.
   A bid is `lots` at one price option (`step`). It locks the whole deposit now,
   pays at most lots x price, and the rest of the deposit comes back for sure. */

type Limits = Pick<RawAuction, "deposit" | "maxNotional">;
type Ladder = Pick<RawAuction, "minPrice" | "stepSize">;

/** One-tap spend amounts, in whole quote tokens. Each is offered only when it is under the cap. */
export const AMOUNT_STEPS: readonly bigint[] = [100n, 250n, 500n];

/** An amount chip: its key ("500" or "max"), its label ("$500", "500" or "MAX") and what it spends in base units. */
export type SpendPreset = { key: string; label: string; spend: bigint };

/** The most one bid may spend: min(deposit, maxNotional), the same limit the contract and `bidProblem` use. */
export function spendCap(a: Limits): bigint {
  return a.deposit < a.maxNotional ? a.deposit : a.maxNotional;
}

/** The amount chips: every step strictly under the cap, then MAX (the whole cap). Dollar quotes get a "$". */
export function spendPresets(a: Limits, quote: Pick<TokenMeta, "symbol" | "decimals">, steps: readonly bigint[] = AMOUNT_STEPS): SpendPreset[] {
  const unit = 10n ** BigInt(quote.decimals);
  const cap = spendCap(a);
  const dollars = /usd/i.test(quote.symbol);
  return [
    ...steps.filter((amount) => amount * unit < cap).map((amount) => ({ key: String(amount), label: dollars ? `$${amount}` : `${amount}`, spend: amount * unit })),
    { key: "max", label: "MAX", spend: cap },
  ];
}

/** Whole lots a spend buys at price option `step`: floor(spend / price). */
export function lotsForSpend(a: Ladder, spend: bigint, step: number): bigint {
  return spend / priceAt(a, step);
}

/** Whole lots only, from what was typed: "12.5" means 12 (never 125), "1,000" means 1000, leading zeros go. */
export function cleanLots(text: string): string {
  return (text.replace(/[,\s_]/g, "").split(".")[0] ?? "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
}

/** The lots in the amount box: a plain number, otherwise none. */
export function lotsOf(text: string): bigint {
  return /^\d+$/.test(text) ? BigInt(text) : 0n;
}

export type BidReceipt = {
  /** The most one bid may spend. */
  cap: bigint;
  /** The chosen price option, per lot. */
  price: bigint;
  /** Tokens (base units) the bid asks for: lots x lotSize. */
  tokens: bigint;
  /** "You pay at most": lots x price. */
  maxPay: bigint;
  /** The most lots the cap allows at this price. */
  maxLots: bigint;
  /** "Comes back for sure": deposit - maxPay. Only meaningful when `valid`. */
  back: bigint;
  /** More than one bid may spend. */
  over: boolean;
  /** Something to bid on: at least one lot and not over the limit. */
  valid: boolean;
};

/** The receipt for `lots` at price option `step`. */
export function bidReceipt(a: Limits & Ladder & Pick<RawAuction, "lotSize">, step: number, lots: bigint): BidReceipt {
  const cap = spendCap(a);
  const price = priceAt(a, step);
  const maxPay = price * lots;
  const over = lots > 0n && maxPay > cap;
  return { cap, price, tokens: lots * a.lotSize, maxPay, maxLots: cap / price, back: a.deposit - maxPay, over, valid: lots > 0n && !over };
}
