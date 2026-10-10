/** Quote base units per whole token at each allowed step. */
export type PriceGrid = {
  minPrice: bigint;
  stepSize: bigint;
  stepCount: number;
};

/** One sealed bid after it has been decoded for the reference implementation. */
export type Bid = {
  slotIndex: number;
  priceStep: number;
  quantity: bigint;
};

export type AuctionConfig = {
  supply: bigint;
  grid: PriceGrid;
  /** Fixed escrow. Caps spend at the bidder's own price. */
  deposit: bigint;
  /** Reject `price * quantity` above this bound. */
  maxNotional: bigint;
  /** When set, `slotIndex` must be in `0 .. maxSlots - 1`. */
  maxSlots?: number;
};

export type ValidatedBid = Bid & {
  price: bigint;
  notional: bigint;
};

export type AuctionOutcome = {
  status: "no_demand" | "cleared";
  clearingPriceStep: number | null;
  clearingPrice: bigint | null;
  totalSold: bigint;
  unsold: bigint;
  proceeds: bigint;
  /** Same order as the validated bids passed to clearing. */
  allocations: bigint[];
};

export type ValidationCode =
  | "grid_min_price"
  | "grid_step_size"
  | "grid_step_count"
  | "supply"
  | "deposit"
  | "max_notional"
  | "max_slots"
  | "quantity"
  | "price_step"
  | "slot_index"
  | "exceeds_deposit"
  | "exceeds_max_notional"
  | "duplicate_slot";

export type ValidationIssue = {
  code: ValidationCode;
  bidIndex?: number;
};

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ValidationIssue[] };
