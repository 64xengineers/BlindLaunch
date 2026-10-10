import type {
  AuctionConfig,
  Bid,
  PriceGrid,
  ValidatedBid,
  ValidationIssue,
  ValidationResult,
} from "./types.js";

function issue(code: ValidationIssue["code"], bidIndex?: number): ValidationIssue {
  if (bidIndex === undefined) {
    return { code };
  }
  return { code, bidIndex };
}

function isPositiveBigint(value: unknown): value is bigint {
  return typeof value === "bigint" && value > 0n;
}

/** `minPrice + step * stepSize`, in quote base units per whole token. */
export function quotePerToken(grid: PriceGrid, step: number): bigint {
  return grid.minPrice + BigInt(step) * grid.stepSize;
}

export function validateGrid(grid: PriceGrid): ValidationResult<PriceGrid> {
  const issues: ValidationIssue[] = [];
  if (!isPositiveBigint(grid.minPrice)) {
    issues.push(issue("grid_min_price"));
  }
  if (!isPositiveBigint(grid.stepSize)) {
    issues.push(issue("grid_step_size"));
  }
  if (!Number.isSafeInteger(grid.stepCount) || grid.stepCount < 1) {
    issues.push(issue("grid_step_count"));
  }
  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return { ok: true, value: grid };
}

export function validateAuctionConfig(
  config: AuctionConfig,
): ValidationResult<AuctionConfig> {
  const issues: ValidationIssue[] = [];
  const grid = validateGrid(config.grid);
  if (!grid.ok) {
    issues.push(...grid.issues);
  }
  if (!isPositiveBigint(config.supply)) {
    issues.push(issue("supply"));
  }
  if (!isPositiveBigint(config.deposit)) {
    issues.push(issue("deposit"));
  }
  if (!isPositiveBigint(config.maxNotional)) {
    issues.push(issue("max_notional"));
  }
  if (
    config.maxSlots !== undefined &&
    (!Number.isSafeInteger(config.maxSlots) || config.maxSlots < 1)
  ) {
    issues.push(issue("max_slots"));
  }
  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return { ok: true, value: config };
}

export function validateBid(
  config: AuctionConfig,
  bid: Bid,
  bidIndex?: number,
): ValidationResult<ValidatedBid> {
  const configResult = validateAuctionConfig(config);
  if (!configResult.ok) {
    return configResult;
  }

  const issues: ValidationIssue[] = [];
  if (typeof bid.quantity !== "bigint" || bid.quantity <= 0n) {
    issues.push(issue("quantity", bidIndex));
  }
  if (
    !Number.isSafeInteger(bid.priceStep) ||
    bid.priceStep < 0 ||
    bid.priceStep >= config.grid.stepCount
  ) {
    issues.push(issue("price_step", bidIndex));
  }
  const slotInRange =
    Number.isSafeInteger(bid.slotIndex) &&
    bid.slotIndex >= 0 &&
    (config.maxSlots === undefined || bid.slotIndex < config.maxSlots);
  if (!slotInRange) {
    issues.push(issue("slot_index", bidIndex));
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const price = quotePerToken(config.grid, bid.priceStep);
  const notional = price * bid.quantity;
  if (notional > config.maxNotional) {
    issues.push(issue("exceeds_max_notional", bidIndex));
  }
  if (notional > config.deposit) {
    issues.push(issue("exceeds_deposit", bidIndex));
  }
  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      slotIndex: bid.slotIndex,
      priceStep: bid.priceStep,
      quantity: bid.quantity,
      price,
      notional,
    },
  };
}

export function validateBids(
  config: AuctionConfig,
  bids: readonly Bid[],
): ValidationResult<ValidatedBid[]> {
  const configResult = validateAuctionConfig(config);
  if (!configResult.ok) {
    return configResult;
  }

  const issues: ValidationIssue[] = [];
  const validated: ValidatedBid[] = [];
  const seenSlots = new Set<number>();

  bids.forEach((bid, bidIndex) => {
    const result = validateBid(config, bid, bidIndex);
    if (!result.ok) {
      issues.push(...result.issues);
      return;
    }
    if (seenSlots.has(result.value.slotIndex)) {
      issues.push(issue("duplicate_slot", bidIndex));
      return;
    }
    seenSlots.add(result.value.slotIndex);
    validated.push(result.value);
  });

  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return { ok: true, value: validated };
}
