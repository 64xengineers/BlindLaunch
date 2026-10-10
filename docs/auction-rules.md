# Auction rules

These rules are the reference for the TypeScript implementation, the later
circuit, and the on-chain program. Prices and amounts are integers.
Floating-point arithmetic is not used for pricing, allocation, or accounting.

## Units

- Token amounts are integer base units.
- A bid price is an integer step on a configured grid.
- `quotePerToken(step) = minPrice + step * stepSize`.
- `step` is in `0 .. stepCount - 1`.
- `minPrice` and `stepSize` are quote base units per whole token.
- `stepSize` must be greater than zero. `stepCount` must be at least 1.
- `minPrice` may be zero only when a later parameter check explicitly allows it.
  This prototype requires `minPrice > 0`.

The worked example uses quote units where 100 means `$1.00`, 80 means `$0.80`,
60 means `$0.60`, and 50 means `$0.50`. With `minPrice = 50` and
`stepSize = 10`, those prices are steps 5, 3, 1, and 0.

## Bid validation

A bid is rejected when any of the following is true:

- quantity is zero or negative
- the price step is not on the grid
- `bidPrice * quantity` exceeds the configured maximum notional
- `bidPrice * quantity` exceeds the fixed deposit

The deposit caps maximum spend at the bidder's own price, because a winner
never pays more than the bid price. Transaction fees are paid in SOL and are
not taken from the deposit. The deposit is escrow, not revenue.

One bid per wallet. Bid replacement is not supported in this version. The
auction authority cannot bid in its own auction; the program enforces that
check in a later phase.

## Clearing price

Demand at a price step is the sum of valid bid quantities whose price step is
at least that step.

The clearing step is the highest step where demand is at least the sale
supply.

If demand at the minimum price is still below the supply, the auction is
undersubscribed. It still clears, at the minimum price. Every valid bid is
filled in full. Unsold tokens stay with the team. Winners pay the minimum
price.

If there are no valid bids, nothing is sold. The clearing price is absent,
`totalSold` is 0, and the unsold amount is the full supply.

## Allocation

At the clearing price:

1. Bids strictly above the clearing price are filled in full.
2. Bids exactly at the clearing price share the remaining supply in proportion
   to their requested quantities, and never receive more than they requested.
3. Bids below the clearing price receive nothing.
4. Proportional shares use floor division:
   `floor(remaining * quantity / totalQuantityAtClearingPrice)`.
5. Leftover units are given one at a time, in ascending `slotIndex`, to
   bidders at the clearing price who still have unfilled quantity.
6. The sum of allocations never exceeds the sale supply.

When the auction is undersubscribed, demand at the minimum price is less than
supply, so every valid bid is filled in full and the remainder is unsold.

Proceeds are `clearingPrice * totalSold`, in quote base units.

## Reference case

Supply: 1,000 tokens.

| Bidder | Price | Quantity | Allocation |
| --- | ---: | ---: | ---: |
| A | 100 | 400 | 400 |
| B | 80 | 300 | 300 |
| C | 60 | 500 | 300 |
| D | 50 | 400 | 0 |

Clearing price: 60. Total sold: 1,000. Proceeds: `60 * 1000`.
