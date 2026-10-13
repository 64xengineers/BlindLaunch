import type { Address, Hex } from "viem";
import { parseAmount } from "./format";
import { encodeKuruParams, kuruProblem, suggestKuruParams, type KuruParams } from "./kuru";

const MAX_AMOUNT = 2n ** 128n - 1n;
const MAX_LOTS = 2n ** 96n - 1n;
const MAX_BIDS = 65_535;
const DAY = 86_400;
/**
 * Gap between the chain time read just before sending and `commitStart`, so the transaction still lands
 * before bidding opens when the wallet takes a while to confirm (`commitStart < block.timestamp` reverts).
 */
export const START_BUFFER = 120n;

export type CreateForm = {
  supplyTokens: string;
  floorPrice: string;
  stepPrice: string;
  stepCount: string;
  deposit: string;
  maxBids: string;
  startMinutes: string;
  biddingMinutes: string;
  cancelGapMinutes: string;
  seed: boolean;
  seedTokens: string;
  seedQuotePercent: string;
  lockDays: string;
};

export const defaultForm: CreateForm = {
  supplyTokens: "1000",
  floorPrice: "2.5",
  stepPrice: "0.1",
  stepCount: "6",
  deposit: "1000",
  maxBids: "10000",
  startMinutes: "0",
  biddingMinutes: "30",
  cancelGapMinutes: "60",
  seed: true,
  seedTokens: "100",
  seedQuotePercent: "20",
  lockDays: "7",
};

export type CreateContext = {
  saleToken: Address | null;
  saleDecimals: number;
  quoteToken: Address;
  quoteDecimals: number;
  allowedQuotes: readonly Address[];
  /** Authority's sale-token balance, when known. */
  balance?: bigint;
};

export type CreatePlan = {
  supply: bigint;
  lotSize: bigint;
  minPrice: bigint;
  stepSize: bigint;
  stepCount: number;
  deposit: bigint;
  maxBids: number;
  startDelay: bigint;
  biddingSeconds: bigint;
  cancelGapSeconds: bigint;
  seedSaleLots: bigint;
  seedQuoteBps: number;
  lockSeconds: bigint;
  kuru: KuruParams | null;
};

export type CreateErrors = Partial<Record<keyof CreateForm | "quoteToken" | "saleToken" | "kuru" | "balance", string>>;

function wholeNumber(text: string): bigint | null {
  return /^\d+$/.test(text.trim()) ? BigInt(text.trim()) : null;
}

/** Turns the Create form into contract parameters, with a message for every `createAuction` revert it would hit. */
export function planAuction(form: CreateForm, ctx: CreateContext): { plan: CreatePlan | null; errors: CreateErrors } {
  const errors: CreateErrors = {};
  const lotSize = 10n ** BigInt(ctx.saleDecimals);

  if (!ctx.allowedQuotes.some((quote) => quote.toLowerCase() === ctx.quoteToken.toLowerCase())) {
    errors.quoteToken = "Choose one of the listed payment tokens.";
  }
  if (ctx.saleToken && ctx.saleToken.toLowerCase() === ctx.quoteToken.toLowerCase()) {
    errors.saleToken = "The token for sale and the payment token must differ.";
  }

  const tokens = wholeNumber(form.supplyTokens);
  if (tokens === null || tokens === 0n) errors.supplyTokens = "Enter a whole number of tokens above zero.";
  else if (tokens > MAX_LOTS) errors.supplyTokens = "That is more tokens than one auction can sell.";
  const supply = (tokens ?? 0n) * lotSize;
  if (ctx.balance !== undefined && supply > ctx.balance) errors.balance = "Your wallet does not hold that many tokens.";

  const stepCount = Number(form.stepCount);
  if (!Number.isInteger(stepCount) || stepCount < 1 || stepCount > 64) errors.stepCount = "Use 1 to 64 price levels.";

  const minPrice = parseAmount(form.floorPrice, ctx.quoteDecimals);
  if (minPrice === null || minPrice === 0n) errors.floorPrice = "Enter a lowest price above zero.";
  const stepSize = parseAmount(form.stepPrice, ctx.quoteDecimals);
  if (stepSize === null) errors.stepPrice = "Enter a price step.";
  else if (stepCount > 1 && stepSize === 0n) errors.stepPrice = "With more than one level, the step must be above zero.";
  if (minPrice !== null && stepSize !== null && !errors.stepCount && minPrice + BigInt(Math.max(stepCount - 1, 0)) * stepSize > MAX_AMOUNT) {
    errors.stepPrice = "The top price is too large.";
  }

  const deposit = parseAmount(form.deposit, ctx.quoteDecimals);
  if (deposit === null || deposit === 0n) errors.deposit = "Enter a deposit above zero.";
  else if (deposit > MAX_AMOUNT) errors.deposit = "The deposit is too large.";
  else if (minPrice !== null && deposit < minPrice) errors.deposit = "The deposit must cover at least one token at the lowest price.";

  const maxBids = Number(form.maxBids);
  if (!Number.isInteger(maxBids) || maxBids < 1 || maxBids > MAX_BIDS) errors.maxBids = `Use 1 to ${MAX_BIDS.toLocaleString()} bids.`;

  const startMinutes = wholeNumber(form.startMinutes);
  if (startMinutes === null) errors.startMinutes = "Enter whole minutes.";
  const bidding = wholeNumber(form.biddingMinutes);
  if (bidding === null || bidding < 1n || bidding * 60n > BigInt(30 * DAY)) errors.biddingMinutes = "Bidding lasts 1 minute to 30 days.";
  const cancelGap = wholeNumber(form.cancelGapMinutes);
  if (cancelGap === null || cancelGap < 10n || cancelGap * 60n > BigInt(30 * DAY)) {
    errors.cancelGapMinutes = "Keepers get 10 minutes to 30 days to open the bids.";
  }

  let seedSaleLots = 0n;
  let seedQuoteBps = 0;
  let lockSeconds = 0n;
  let kuru: KuruParams | null = null;
  if (form.seed) {
    const seedTokens = wholeNumber(form.seedTokens);
    if (seedTokens === null) errors.seedTokens = "Enter a whole number of tokens.";
    else if (tokens !== null && seedTokens > tokens) errors.seedTokens = "You cannot seed more tokens than you sell.";
    seedSaleLots = seedTokens ?? 0n;
    const percent = parseAmount(form.seedQuotePercent, 2);
    if (percent === null || percent > 10_000n) errors.seedQuotePercent = "Use 0 to 100%.";
    seedQuoteBps = Number(percent ?? 0n);
    if (seedSaleLots === 0n && seedQuoteBps === 0) errors.seedTokens = "Seed some tokens or some proceeds, or turn seeding off.";
    const lockDays = wholeNumber(form.lockDays);
    if (lockDays === null || lockDays > 3_650n) errors.lockDays = "Lock for 0 to 3,650 days.";
    lockSeconds = (lockDays ?? 0n) * BigInt(DAY);
    if (minPrice !== null && stepSize !== null && !errors.stepCount && !errors.floorPrice && !errors.stepPrice) {
      const ladder = { minPrice, stepSize, stepCount, lotSize, saleDecimals: ctx.saleDecimals, quoteDecimals: ctx.quoteDecimals };
      kuru = suggestKuruParams(ladder, supply);
      const problem = kuruProblem(ladder, kuru);
      if (problem) errors.kuru = problem;
    }
  }

  if (Object.keys(errors).length > 0) return { plan: null, errors };
  return {
    plan: {
      supply,
      lotSize,
      minPrice: minPrice!,
      stepSize: stepSize!,
      stepCount,
      deposit: deposit!,
      maxBids,
      startDelay: startMinutes! * 60n,
      biddingSeconds: bidding! * 60n,
      cancelGapSeconds: cancelGap! * 60n,
      seedSaleLots,
      seedQuoteBps,
      lockSeconds,
      kuru,
    },
    errors,
  };
}

export type CreateParams = {
  saleToken: Address;
  quoteToken: Address;
  supply: bigint;
  lotSize: bigint;
  minPrice: bigint;
  stepSize: bigint;
  stepCount: number;
  deposit: bigint;
  maxNotional: bigint;
  maxBids: number;
  commitStart: bigint;
  commitDeadline: bigint;
  cancelAfter: bigint;
  seedSaleLots: bigint;
  seedQuoteBps: number;
  seedLockUntil: bigint;
  kuruParams: Hex;
};

/** Absolute schedule from the latest chain time, computed right before `createAuction` is sent. */
export function toCreateParams(plan: CreatePlan, saleToken: Address, quoteToken: Address, chainTime: bigint): CreateParams {
  const commitStart = chainTime + START_BUFFER + plan.startDelay;
  const commitDeadline = commitStart + plan.biddingSeconds;
  const cancelAfter = commitDeadline + plan.cancelGapSeconds;
  const seeding = plan.kuru !== null;
  return {
    saleToken,
    quoteToken,
    supply: plan.supply,
    lotSize: plan.lotSize,
    minPrice: plan.minPrice,
    stepSize: plan.stepSize,
    stepCount: plan.stepCount,
    deposit: plan.deposit,
    maxNotional: plan.deposit,
    maxBids: plan.maxBids,
    commitStart,
    commitDeadline,
    cancelAfter,
    seedSaleLots: seeding ? plan.seedSaleLots : 0n,
    seedQuoteBps: seeding ? plan.seedQuoteBps : 0,
    seedLockUntil: seeding ? cancelAfter + plan.lockSeconds : 0n,
    kuruParams: seeding ? encodeKuruParams(plan.kuru!) : "0x",
  };
}
