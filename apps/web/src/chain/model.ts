import type { blindAuctionV2Abi } from "@blindlaunch/abi";
import type { Address, ReadContractReturnType } from "viem";
import { formatAmount } from "./format";

export type RawAuction = ReadContractReturnType<typeof blindAuctionV2Abi, "getAuction">;
export type RawBid = ReadContractReturnType<typeof blindAuctionV2Abi, "getBid">;
export type TokenMeta = { address: Address; name: string; symbol: string; decimals: number };
export type AuctionView = RawAuction & { id: bigint; sale: TokenMeta; quote: TokenMeta };
export type BidView = RawBid & { slot: number };

export const STATUS = { None: 0, Open: 1, Settled: 2, Cancelled: 3 } as const;
export const SEED = { None: 0, Reserved: 1, HandedOff: 2, Released: 3 } as const;

export type Phase = "scheduled" | "bidding" | "awaitingKeys" | "opening" | "ready" | "cancellable" | "settled" | "cancelled";

type PhaseInput = Pick<RawAuction, "status" | "commitStart" | "commitDeadline" | "cancelAfter" | "publishedCount" | "openedCount" | "bidCount">;

/** Where an auction is, from chain state and the current time (seconds). */
export function phaseOf(a: PhaseInput, now: bigint): Phase {
  if (a.status === STATUS.Cancelled) return "cancelled";
  if (a.status === STATUS.Settled) return "settled";
  if (now < a.commitStart) return "scheduled";
  if (now < a.commitDeadline) return "bidding";
  if (a.publishedCount < 2) return now >= a.cancelAfter ? "cancellable" : "awaitingKeys";
  return a.openedCount < a.bidCount ? "opening" : "ready";
}

export type PublicAction = "openRemaining" | "settle" | "cancel";

/** Buttons anyone may press. They mirror `canSettle`, `canCancel` and the open rules. */
export function publicActions(phase: Phase): PublicAction[] {
  if (phase === "opening") return ["openRemaining"];
  if (phase === "ready") return ["settle"];
  if (phase === "cancellable") return ["cancel"];
  return [];
}

export function priceAt(a: Pick<RawAuction, "minPrice" | "stepSize">, step: number): bigint {
  return a.minPrice + BigInt(step) * a.stepSize;
}

/** "token" when one lot is one whole token, otherwise "1,000 MOON". */
export function lotLabel(a: Pick<RawAuction, "lotSize">, sale: TokenMeta): string {
  return a.lotSize === 10n ** BigInt(sale.decimals) ? sale.symbol : `${formatAmount(a.lotSize, sale.decimals)} ${sale.symbol}`;
}

export function formatPrice(price: bigint, a: Pick<RawAuction, "lotSize">, sale: TokenMeta, quote: TokenMeta): string {
  return `${formatAmount(price, quote.decimals, 6)} ${quote.symbol} per ${a.lotSize === 10n ** BigInt(sale.decimals) ? sale.symbol : `lot of ${lotLabel(a, sale)}`}`;
}

export type BidContext = { account: Address | null; alreadyBid: boolean; now: bigint; step: number; lots: bigint };

/** Why a bid would not go through or would not count, checked before the wallet is asked to sign. */
export function bidProblem(a: RawAuction, ctx: BidContext): string | null {
  if (!ctx.account) return "Connect a wallet or sign in with a passkey to bid.";
  if (phaseOf(a, ctx.now) !== "bidding") return "Bidding is not open.";
  if (ctx.account.toLowerCase() === a.authority.toLowerCase()) return "The creator of an auction cannot bid in it.";
  if (ctx.alreadyBid) return "This wallet already sealed a bid in this auction.";
  if (a.bidCount >= a.maxBids) return "Every bid slot is taken.";
  if (ctx.step < 0 || ctx.step >= a.stepCount) return "Pick a price on the ladder.";
  if (ctx.lots <= 0n) return "Enter how many you want.";
  const notional = priceAt(a, ctx.step) * ctx.lots;
  const limit = a.deposit < a.maxNotional ? a.deposit : a.maxNotional;
  if (notional > limit) return "That is more than one bid may spend. Lower the price or the amount.";
  return null;
}
