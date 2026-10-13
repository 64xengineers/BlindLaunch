# Blindlaunch v2 design: sealed bids that open themselves

Date: 2026-10-13
Status: approved design, implemented through phase 1 (revised 2026-10-13 after the independent audit; see section 15)
Supersedes: the commit-reveal mechanism in `contracts/src/BlindAuction.sol` and the web flows in `apps/web/src/auction.tsx`

## 1. Summary

Blindlaunch v2 is a sealed-bid, uniform-price token launch on Monad in which the bidder acts exactly once. The bid is encrypted to three keeper public keys, committed on chain with a uniform deposit, and decrypted by the contract itself after the bidding window from keys the keepers publish. There is no reveal step, no reveal game, and no bidder action after bidding. Every winner pays one clearing price. In the same settlement flow the contract opens a Kuru order-book market at that price and posts resting orders from unsold tokens and a slice of proceeds.

Decisions already taken with the owner:

| Decision | Choice |
| --- | --- |
| Goal | Proper rebuild, independent of the Metropolis deadline |
| Network | Testnet (10143) for development, CI and demo; mainnet (143) for the final deploy and the Kuru leg |
| Wallets | Mera passkey (headline flow) and injected EIP-6963 wallets, same viem client |
| Sale token on Create | "New token" (factory deploy) or "Existing token" (paste address) |
| Committee | 3 keepers, 2-of-3 threshold, client-side Shamir split, verified on chain |
| Kuru fallback | Keeper-driven seeding with on-chain escrow if `Router.deployProxy` cannot be called from a contract |
| Old contract | `BlindAuction.sol` (v1) stays in the repo untouched; v2 is a new contract |

## 2. Goals and non-goals

Goals

1. Remove the three mechanism loopholes found in the audit: first-come slot filling, the reveal-phase free option, and the authority choosing the price after seeing bids.
2. Make real ERC-20 tokens usable (18-decimal sale token against 6-decimal USDC).
3. End the auction with a live market at the clearing price (Kuru).
4. One transaction per bid, from a phone, with no return trip.
5. Every claim in the docs matches the code; every function has a test.

Non-goals (explicitly out of scope for v2)

- drand timelock encryption, BTX, or any encrypted mempool.
- Distributed key generation among keepers.
- Selling an existing token held by a third party ("blind block"), liquidations, cross-chain bids.
- Protocol fee, external audit, wallets beyond Mera and injected EIP-6963, Envio or Chainlink bounties.
- Browser-automation e2e tests.

## 3. Mechanism

### 3.1 Roles

| Role | Does |
| --- | --- |
| Authority | Creates the auction, escrows the supply, collects proceeds and unsold tokens after settlement, may unwind the seeded market after the lock. Cannot bid from its own address. |
| Bidder | Sends one `commit` with a sealed bid and the uniform deposit. Nothing else. Claims tokens and refund after settlement or cancellation. |
| Keeper i (i = 0, 1, 2) | Pre-registers fresh public keys. After the commit deadline publishes the matching secret key for each auction it is assigned to. Opens bids, settles, seeds. Anyone may do the last three. |
| Anyone | May open bids once two keys are published, settle once all bids are opened, cancel after `cancelAfter` if settlement is impossible. |

### 3.2 Bid encoding

A bid is a single field element `m < 2^232`:

```
m = (step << 224) | (quantity << 128) | nonce
step      uint8   price step on the ladder, 0 .. stepCount-1
quantity  uint96  number of lots
nonce     uint128 random, from the bidder's CSPRNG
```

Quantity is in lots. A lot is `lotSize` sale-token base units (set at creation, normally `10^saleDecimals`). Price is quote-token base units per lot.

Commitment hash: `h = keccak256(abi.encode(chainid, auctionContract, auctionId, bidder, m))`. The nonce makes `h` unguessable even though the step and quantity space is small; the chain id and contract address keep a commitment from being valid anywhere else.

### 3.3 Sharing and encryption

Arithmetic is modulo `n`, the secp256k1 group order
`n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141`.

1. Pick random `a ∈ [1, n)`. Define `f(x) = m + a·x mod n`. Shares `y_i = f(i+1)` for keeper `i ∈ {0,1,2}` (x-coordinates 1, 2, 3).
2. Pick random `r ∈ [1, n)`, `R = r·G`. Resample until `R.x < n` and `R.x ≠ 0`.
3. For each keeper public key `P_i`: `S_i = r·P_i`, `key_i = keccak256(abi.encodePacked(S_i.x, S_i.y, uint8(i)))`, `c_i = y_i XOR key_i` (uint256).
4. The sealed bid is `(R, c_0, c_1, c_2, h)`.

Reconstruction from any two shares uses fixed Lagrange coefficients:

| Keepers | m |
| --- | --- |
| 0 and 1 (x = 1, 2) | `2·y_0 − y_1` |
| 0 and 2 (x = 1, 3) | `(3·y_0 − y_2) · inv2`, `inv2 = (n+1)/2` |
| 1 and 2 (x = 2, 3) | `3·y_1 − 2·y_2` |

All mod `n`. The contract uses `mulmod`/`addmod` and the two constants; no modular inverse at runtime.

### 3.4 On-chain scalar-multiplication check

The contract never multiplies points. It verifies a claimed product `Q = k·P` with the ecrecover trick (ethresear.ch thread 2384):

```
ecrecover(bytes32(0), 27 + (P.y & 1), bytes32(P.x), bytes32(mulmod(k, P.x, n)))
  == address(uint160(uint256(keccak256(abi.encodePacked(Q.x, Q.y)))))
```

Preconditions enforced wherever a point enters the contract: `0 < P.x < n`, `P` on the curve (`y² ≡ x³ + 7 mod p`), `0 < k < n`. These hold for `G`, for registered keeper keys (checked at `enqueue`), and for `R` (checked at `commit`). A bid whose `R` fails the check is rejected at `commit`, so no bid can be made unopenable.

Monad support was checked on chain: `ecrecover(0, 27, G.x, 2·G.x mod n)` returns the address of `2·G` on both testnet and mainnet.

Two uses:

- `publishKey`: verify `sk_i·G == P_i` (P = G, Q = P_i).
- `open`: verify `S_i == sk_i·R` (P = R, Q = S_i supplied by the opener, computed off chain as `sk_i·R`).

Each check is one `ecrecover` (3,000 gas) plus a keccak.

### 3.5 Opening and validity

`open(auctionId, slot, S_a, S_b)` where `(a, b)`, `a < b`, is the auction's **frozen pair**: the first two keepers to publish, fixed in the transaction that publishes the second key.

1. Verify `S_a`, `S_b` as above.
2. `y_a = c_a XOR key_a`, `y_b = c_b XOR key_b`.
3. Reconstruct `m'` with the coefficient row for `(a, b)`.
4. If `keccak256(abi.encode(chainid, this, auctionId, bid.bidder, m')) != h`, the bid is opened and **forfeited**: its deposit is added to `forfeitedTotal`, which anyone can later send to `FORFEIT_SINK` (`0x…dEaD`) with `burnForfeits`. It never goes to the authority.
5. Otherwise parse. The bid is counted iff `m' < 2^232`, `step < stepCount`, `quantity > 0`, and `price(step)·quantity ≤ min(deposit, maxNotional)`. A bid that matches its commitment but fails these checks is refunded in full.
6. Counted: `prefix = qtyAtStep[step]`, then `qtyAtStep[step] += quantity`.
7. `openedCount += 1`. Emit `BidOpened(auctionId, slot, bidder, step, quantity, counted, forfeited)`.

Why forfeiture exists. A bidder can craft shares that reconstruct to the committed `m` under one keeper pair and to garbage under the others; if two pairs agreed, all three shares would lie on one line. Which pair opens a bid is not chosen blind: once the first key is published, either remaining keeper can decrypt every bid with that key and its own, then publish (freezing a pair that includes it) or stay silent. Anyone who sees pending `publishKey` transactions can do the same by front-running. So the pair can be chosen after seeing the book. The commitment mismatch is the only pair-dependent outcome, because a matching reconstruction is unique. Making it forfeit the whole deposit, which is at least the maximum payment, means "my bid did not open" is never better than "my bid counted", and the choice of pair is worth nothing.

### 3.6 Clearing and allocation

Prices: `price(step) = minPrice + step·stepSize`, `stepCount ≤ 64`.

Settle (O(stepCount), no external calls):

1. Walk steps from `stepCount−1` down to 0, accumulating `cumulative += qtyAtStep[step]`. The clearing step is the highest step with `cumulative ≥ supplyLots`. If none, clearing step is 0 and every counted bid fills in full. If there are no counted bids at all, `clearingPrice = 0` and `totalSold = 0` (as in v1); otherwise `clearingPrice = price(clearingStep)`.
2. `aboveTotal` = demand strictly above the clearing step (always `< supplyLots`). `remaining = supplyLots − aboveTotal`. `atDemand = qtyAtStep[clearingStep]`.
3. `totalSold = aboveTotal + min(atDemand, remaining)`. When `atDemand > remaining` the at-step bids share `remaining` pro rata with cumulative rounding (below), which sells exactly `remaining`.
4. Store the outcome, set status → Settled, and reserve the seed (section 7). `settle` reads storage only: no token, seeder or other external call can make it revert, so settlement cannot be blocked once two keys are published.

Allocation at claim, computed, not stored:

| Bid | Allocation (lots) |
| --- | --- |
| counted, step > clearingStep | `quantity` |
| counted, step == clearingStep, atDemand ≤ remaining | `quantity` |
| counted, step == clearingStep, otherwise | `floor(remaining·(prefix+q)/atDemand) − floor(remaining·prefix/atDemand)` |
| counted, step < clearingStep, or not counted | 0 |

The pro-rata shares telescope to exactly `remaining` and each is at most `q` (because `remaining < atDemand`). Each share is within one lot of the exact pro-rata amount; which bids get the extra lot depends on opening order, which the opener controls. Plain floor rounding was rejected: with `supply = 1` and two 1-lot bids it sells nothing, and one refunded 1-lot sybil can halve a sale.

Refund `= deposit − clearingPrice·allocation`, never negative because `clearingPrice ≤ price(step)` and `price(step)·quantity ≤ deposit`. A forfeited bid's refund is 0.

Bounds that make every product fit in 256 bits without a 512-bit mulDiv: `supplyLots < 2^96`, `quantity < 2^96`, `price(stepCount−1) < 2^128`, `deposit, maxNotional < 2^128`. Enforced at creation and in parsing.

### 3.7 Timeline

```
commitStart ≤ commitDeadline ≤ cancelAfter
commit:   commitStart ≤ now < commitDeadline
publish:  commitDeadline ≤ now < cancelAfter, fewer than 2 keys published, status Open
open:     2 keys published (pair frozen), status Open
settle:   2 keys published, openedCount == bidCount, status Open      (no time limit)
cancel:   now ≥ cancelAfter, status Open, fewer than 2 keys published
```

Creation constraints: `commitStart ≥ now`, `commitDeadline − commitStart ∈ [60 s, 30 d]`, `cancelAfter − commitDeadline ∈ [10 min, 30 d]`. Settlement takes no bidder action; the gap exists only for keepers to publish and open.

Cancel refunds every deposit and the whole supply, as in v1. The branches are mutually exclusive: once two keys are in (before `cancelAfter`), the auction can only settle, since opening and settling are permissionless and have no deadline. If `cancelAfter` passes with fewer than two keys, no further key can be published and the auction can only cancel. A keeper who has read the bids can still choose between the branches only if it is the last keeper able to publish before `cancelAfter` (section 3.8).

### 3.8 Trust statement (to be quoted in docs)

- Two of three keepers colluding can decrypt bids before the window closes and pass them to a bidder, who can then bid with that knowledge or place shill bids. They cannot alter, drop or add anyone else's bid.
- After the first key is published, any one other keeper can read every bid before the pair is frozen. Forfeiture (section 3.5) removes the value of choosing the pair, but if the remaining keeper is offline, the reading keeper alone decides whether the auction settles or cancels.
- Two of three keepers must publish before `cancelAfter` for the auction to settle. If they do not, the auction cancels and everyone is refunded.
- After publication every bid is public, as in any commit-reveal design.
- Bidder addresses, bid count and bid timing are public throughout. The uniform deposit hides bid size.
- Keeper keys are per auction and never reused (the registry rejects duplicates). Publishing a key for one auction reveals nothing about another.
- The authority chooses both tokens. A sale token that misbehaves after bidding can withhold sale tokens but cannot block settlement or any quote refund. A quote token that misbehaves can withhold refunds, so the web app only offers allow-listed quote tokens (USDC and WMON on mainnet).

## 4. Contracts

Foundry, Solidity 0.8.28, Cancun. New files in `contracts/src/`; `BlindAuction.sol` (v1) is untouched. `forge-std` becomes a git submodule under `contracts/lib/` so `forge test` works from a clean clone.

### 4.1 `Secp256k1.sol` (library)

```
struct Point { uint256 x; uint256 y; }
function generator() → Point
function isValid(Point) → bool                          // 0 < x < n, 0 < y < p, on curve
function mulEquals(Point P, uint256 k, Point Q) → bool   // ecrecover trick
function reconstruct(uint8 a, uint8 b, uint256 ya, uint256 yb) → uint256
function shareKey(Point S, uint8 i) → uint256
constant N, P, GX, GY, INV2
```

### 4.2 `KeeperRegistry.sol`

```
constructor(address[3] keeperOwners)
function setAuction(address)                   // once, by deployer
function setOwner(uint8 i, address owner)      // current owner; owner ≠ 0
function enqueue(uint8 i, Point[] keys)        // keeper i owner; each key valid and never seen before
function skip(uint8 i, uint256 count)          // keeper i owner; discards queued keys after a leak
function available(uint8 i) → uint256
function consume(uint8 i, uint256 auctionId) → Point   // only the auction contract; pops FIFO
event KeysEnqueued(uint8 i, uint256 count)
event KeyConsumed(uint8 i, uint256 auctionId, uint256 x, uint256 y)
```

Keys are consumed per auction so that publishing one never exposes another auction's shares. A key that appears twice (in one queue or across keepers) would let one keeper act as two, so `enqueue` rejects duplicates.

### 4.3 `TestToken.sol` and `IERC20.sol`

`TestToken(name, symbol, decimals)`: public-mint ERC-20 with standard `Transfer`/`Approval` events, deployed on testnet only. `IERC20.sol` adds `approve`, `allowance`, `decimals`, `name`, `symbol` to the v2 interface. `TestERC20.sol` and `IERC20Minimal.sol` stay untouched so the verified v1 deployment still matches its source.

### 4.4 `TokenFactory.sol`

```
function createToken(string name, string symbol, uint8 decimals, uint256 supply, address to) → address
event TokenCreated(address token, address creator, string name, string symbol, uint8 decimals, uint256 supply)
```

Deploys a minimal fixed-supply ERC-20 (`LaunchToken.sol`: events, no mint after construction). Used by the "New token" create mode. The creator then approves and calls `createAuction` (three wallet prompts; acceptable).

### 4.5 `BlindAuctionV2.sol`

Storage per auction:

```
authority, saleToken, quoteToken, supply, lotSize, supplyLots
minPrice, stepSize, stepCount, deposit, maxNotional, maxBids
commitStart, commitDeadline, cancelAfter
keeperKeys[3] (Point), publishedKey[3] (uint256, 0 = not published), publishedCount, pairA, pairB
status, bidCount, openedCount, qtyAtStep[64]
clearingStep, clearingPrice, aboveTotal, remaining, atDemand, totalSold
forfeitedTotal, forfeitsBurned, unsoldReclaimed, proceedsReclaimed
seed: seedSaleLots, seedQuoteBps, seedLockUntil, kuruParams (bytes, opaque to the auction),
      seedState (None | Reserved | HandedOff | Released), seedSale, seedQuote
```

Per bid: `bidder, opened, counted, forfeited, refundClaimed, tokensClaimed, step, quantity, prefix, h, ephemeral R, c[3]`.

Constants: `MAX_STEPS = 64`, `MAX_BIDS = 65_535`, `MIN_COMMIT = 60`, `MAX_COMMIT = 30 days`, `MIN_CANCEL_GAP = 10 minutes`, `MAX_CANCEL_GAP = 30 days`, `MAX_AMOUNT = 2^128 − 1`, `MAX_LOTS = 2^96 − 1`, `FORFEIT_SINK = 0x…dEaD`.

Functions (all state-changing ones `nonReentrant`):

```
createAuction(CreateParams) → auctionId
  tokens non-zero, distinct, contracts; supply % lotSize == 0, supplyLots < 2^96;
  ladder and deposit bounds; deposit, maxNotional ≥ minPrice; maxBids ∈ [1, 65_535] (UI default 10,000);
  schedule; seed config (seedSaleLots ≤ supplyLots, seedQuoteBps ≤ 10000, lockUntil ≥ cancelAfter,
  seeder.validate); consumes one key per keeper; pulls supply (balance-checked)
commit(auctionId, Point R, uint256[3] c, bytes32 h)
publishKey(auctionId, uint8 i, uint256 sk)         // freezes the pair on the second key
open(auctionId, uint32 slot, Point Sa, Point Sb)
openMany(auctionId, uint32[] slots, Point[] Sa, Point[] Sb)   // skips slots already opened
settle(auctionId)                                  // storage only; reserves the seed
cancel(auctionId)                                  // now ≥ cancelAfter and publishedCount < 2
burnForfeits(auctionId)                            // anyone, once, after settle
handOffSeed(auctionId)                             // anyone; approve exact, seeder.accept pulls, try seed
releaseSeed(auctionId)                             // anyone, after seedLockUntil, if never handed off
claim(auctionId)                                   // both legs still unclaimed, to msg.sender
claimRefund(auctionId, to) / claimTokens(auctionId, to)
reclaim(auctionId)                                 // authority, both legs
reclaimUnsold(auctionId, to) / reclaimProceeds(auctionId, to)
view: getAuction, getBid, bidderSlot, keeperKeysOf, publishedKeysOf, qtyAtStepOf, kuruParamsOf,
      hashBid, quotePrice, canSettle, canCancel, allocationOf, claimable
admin: setSeeder(address) once by the deployer, non-zero
```

Events: `SeederSet`, `AuctionCreated`, `BidCommitted`, `KeyPublished`, `BidOpened(auctionId, slot, bidder, step, quantity, counted, forfeited)`, `AuctionSettled(auctionId, clearingStep, clearingPrice, totalSold)`, `AuctionCancelled`, `RefundClaimed`, `TokensClaimed`, `UnsoldReclaimed`, `ProceedsReclaimed`, `ForfeitsBurned`, `SeedReserved`, `SeedHandedOff`, `SeedReleased`.

Transfers keep v1's balance-before/after checks (`_pull`/`_push`); fee-on-transfer tokens are rejected on the way in. Payouts are split per token so a sale token that pauses or blacklists cannot hold back a quote refund.

Solvency (proved in the audit and checked by the fuzz test): quote paid out = Σ refunds + forfeits burned + proceeds + seed quote = `bidCount·deposit`; sale paid out = Σ allocations·lotSize + unsold + seed sale = `supply`; cancelled auctions return every deposit and the supply.

### 4.6 `UniformClearing.sol`

Kept as the reference library and used by tests as the oracle. v2 does not call it at runtime (demand is aggregated per step). The differential fuzz test proves v2 picks the same clearing step and price, sells the same total, and gives each bid within one lot of v1's allocation.

## 5. Shared TypeScript package `packages/sealed-bid`

Replaces `packages/auction-core` (dead code, deleted). Dependencies: `@noble/secp256k1`, `@noble/hashes`, `viem` (for keccak/abi encoding). Exports:

```
encodeBid({step, quantity, nonce}) → bigint m ; decodeBid(m)
commitmentHash(auctionId, bidder, m) → Hex
shamirSplit(m, rng) → [y0, y1, y2] ; shamirReconstruct(a, b, ya, yb) → m
seal({auctionId, bidder, step, quantity, keeperKeys:[P0,P1,P2]}, rng) → {R, c:[c0,c1,c2], h, record:{m, r}}
sharedPoint(sk_i, R) → S_i           // used by keepers and by the web app to open bids
openBid({R, c, h, auctionId, bidder, keys:{[i]: sk_i}}) → {m, valid}  // mirrors the contract
clearing: findClearingStep(qtyAtStep, supplyLots), allocation(bid, outcome), totalSold(...)
vectors: generateVectors(seed) → JSON used by Solidity parity tests
```

Pure, no DOM, runs in browser and Node. Vitest unit tests. A script `pnpm --filter sealed-bid vectors` writes `contracts/test/vectors/sealed-bid.json` (checked in).

## 6. Keeper service `apps/keeper`

Node 22+, TypeScript, viem. One codebase, three identities selected by `KEEPER_INDEX`. Config via env: `CHAIN` (testnet|mainnet), `RPC_URL`, `KEEPER_INDEX`, `KEEPER_PRIVATE_KEY` (gas, also the registry owner for that index), `KEY_STORE` (path to a JSON file of `{pubkeyX: skHex}` entries, file mode 600), `QUEUE_TARGET` (default 20), `POLL_MS` (default 2000).

Loop (idempotent, all state read from chain each pass):

1. If `available(index) < QUEUE_TARGET`, generate keys, append to `KEY_STORE`, `enqueue`.
2. Scan `AuctionCreated` logs from the deployment block (cursor persisted in `KEY_STORE` file). For each auction whose `keeperKeys[index]` is in the store, `publishedKey[index] == 0`, `publishedCount < 2` and `bidCount > 0`: publish. **Timing rule:** read the latest block and send only when its timestamp is ≥ `commitDeadline` and < `cancelAfter`, and only after `eth_call` simulates `publishKey` successfully. A transaction that reverts still puts the secret key on chain, so a key must never be broadcast early. Auctions with no bids are skipped; they cancel at `cancelAfter` and return the supply.
3. For each Open auction with `publishedCount ≥ 2` and `openedCount < bidCount`: compute `S_a, S_b` for unopened slots from the two published keys (read from chain, so any keeper can open bids for any pair) and call `openMany` in batches of 50.
4. If `canSettle`: `settle`. If `seedState == Reserved`: `handOffSeed`. If `forfeitedTotal > 0` and not burned: `burnForfeits`.
5. If the seeder reports a pending seed for the auction: call `seeder.seed` (section 7).

Transactions are sent with explicit nonce management and retried on `nonce too low`/`replacement underpriced`. `--once` flag runs one pass and exits (used in tests). `pnpm keepers` runs three instances locally with three env files.

## 7. Market seeding `MarketSeeder.sol`

Addresses (from docs.kuru.io/contracts/Contract-addresses):

| | Router | MarginAccount |
| --- | --- | --- |
| Testnet 10143 | `0x7EFbE105Ca7415dE98F96622173458ac1c054630` | `0xd029C2D98ff85D8F64799017fE00a59B1159CE02` |
| Mainnet 143 | `0xd651346d7c789536ebf06dc72aE3C8502cd695CC` | `0x2A68ba1833cDf93fa9Da1EEbd7F46242aD8E90c5` |

Interfaces used: `Router.deployProxy(type, base, quote, sizePrecision, pricePrecision, tickSize, minSize, maxSize, takerFeeBps, makerFeeBps, kuruAmmSpread) → address`, `MarginAccount.deposit(user, token, amount)`, `OrderBook.addSellOrder(uint32 price, uint96 size, bool postOnly)`, `OrderBook.addBuyOrder(...)`, `OrderBook.batchCancelOrders(uint40[])`, `MarginAccount.withdraw(amount, token)`.

Per-auction `KuruParams` stored at creation: `sizePrecision, pricePrecision, tickSize, minSize, maxSize, takerFeeBps, makerFeeBps, kuruAmmSpread, marketType (0 = ERC20/ERC20)`. The web app computes them with a port of the SDK's `calculatePrecisions` and checks that every ladder price maps to a whole number of ticks and that `price(0)` is at least two ticks, so `bidPrice` is never zero. `createAuction` re-checks both.

Unit conversion in the seeder:

```
kuruPrice = clearingPrice · pricePrecision · 10^saleDecimals / (10^quoteDecimals · lotSize)
askPrice  = ceil(kuruPrice / tickSize) · tickSize
bidPrice  = askPrice − tickSize
kuruSize(baseUnits) = baseUnits · sizePrecision / 10^saleDecimals
```

Hand-off from the auction (phase 1, independent of Kuru): `settle` only reserves the seed. If seeding is configured and `totalSold > 0`, it stores `seedSale = min(seedSaleLots, unsoldLots)·lotSize` and `seedQuote = proceeds·seedQuoteBps/10000` and sets `seedState = Reserved`. Anyone then calls `handOffSeed`: the auction approves exactly those amounts, `seeder.accept(order)` pulls them, the auction checks both balance deltas and that both allowances are back to 0, sets `HandedOff`, and calls `try seeder.seed(auctionId)`. If anything before `seed` fails, the whole call reverts and can be retried. If the seed is never handed off, anyone can call `releaseSeed` after `seedLockUntil`, which returns the reserved amounts to the authority. `reclaim` always excludes the reserved amounts, so they are paid exactly once.

Primary path inside the seeder (verified by the phase-0 spike). `seed`:

1. If no market recorded for (sale, quote): `Router.deployProxy(...)`, record the address from the return value.
2. Approve and `MarginAccount.deposit(address(this), token, amount)` for both.
3. `addSellOrder(askPrice, kuruSize(seedSale), true)`; `addBuyOrder(bidPrice, floor(seedQuote / askPrice in Kuru units), true)`.
4. Record `lockUntil`. Emit `MarketSeeded(auctionId, market, askPrice, bidPrice)`.

A Kuru revert never reverts `settle`, which makes no external calls, and never reverts `handOffSeed` after `accept`. After `lockUntil`, the authority calls `unwind(auctionId, orderIds)`: cancels the orders it owns, withdraws both balances from `MarginAccount`, and transfers everything (including any `pending`) to the authority.

Fallback path (not needed: the phase 0 spike showed a contract can call `deployProxy`, deposit, post and cancel orders; kept for reference): `seed` is replaced by `release(auctionId)`, which transfers the seed funds to the configured keeper address and records the amounts. `release` requires that the keeper has already granted the seeder an allowance of `type(uint256).max` on both tokens; the keeper service grants it at startup. The keeper performs the Kuru calls with the SDK, then calls `confirm(auctionId, market)`, which checks `Router.verifiedMarket(market)` is set with matching base and quote and records the market. If `confirm` has not happened by `lockUntil`, the authority calls `recover(auctionId)`, which pulls the released amounts back from the keeper through that allowance and sends them to the authority. This path is documented in the README as non-atomic.

## 8. Web application

### 8.1 Structure (`apps/web/src/`)

```
chain/      config.ts (per-chain addresses, VITE_CHAIN), clients.ts (public client, batching/multicall),
            abi/ (generated from contracts/out by `pnpm abi`), reads.ts (auction + bid readers), events.ts
auth/       providers.ts (EIP-6963 discovery), injected.ts, mera.ts (passkey → viem account),
            session.tsx (current signer, auto-reconnect, chainChanged, switch-before-write)
bids/       seal.ts (packages/sealed-bid), vault.ts (Mera-derived AES-GCM key), storage.ts (namespaced), open.ts
state/      store.tsx (auctions, selected, bids, my bids; polling), actions.ts, errors.ts (ABI error decoding)
screens/    Home, HowItWorks, Create, Auction, Sealed, Result, MyBids, Team, Docs, NotFound
components/ ui.tsx, sections.tsx, trust.tsx (dead exports removed)
```

`auction.tsx`, `wallet.ts`, `clearing.ts`, `styles.css` are removed.

### 8.2 Behaviour

- Networks: `VITE_CHAIN=testnet|mainnet` selects addresses, RPC, explorer. Chain switch is requested before every write; a `chainChanged` listener keeps the banner current.
- Auth: wallet picker lists EIP-6963 providers plus "Passkey (Face ID / Touch ID)". Mera flow: `getPasskeyPrfOutput({ rpId: location.hostname })` → BIP-39/32 → `createSecp256k1SigningSession` → `toViemAccount`. Credential id stored in localStorage for pinning. A second ceremony with `prfSalt = sha256("blindlaunch.vault.v1")` derives the vault key (AES-256-GCM via WebCrypto) that encrypts the bidder's local bid records. Both keys from one passkey: the "One Passkey, Many Keys" story.
- Create: mode "New token" (name, symbol, decimals, supply → `TokenFactory.createToken`) or "Existing token" (address → reads `name/symbol/decimals/balanceOf`). Then ladder (min price, step size, step count), lot size (default one whole token), deposit, max bids, windows (start, bidding length, cancel gap), seed config (sale lots, proceeds %, lock), Kuru params computed and previewed. Validation mirrors every contract check so a revert is never the first error the user sees. Auction id is read from the `AuctionCreated` log in the receipt.
- Bid: price step + quantity → `seal()` → one `commit` transaction. An exact-amount `approve` precedes it when the allowance is short; a Mera session signs both without a second passkey prompt, an injected wallet shows two prompts. Deposit and the maximum payment are shown before signing. The bid record `{auctionId, chainId, contract, m, r}` is vault-encrypted and stored.
- Auction page: live polling (5 s) of the auction and its bids; status bar shows bids sealed, keys published, bids opened; buttons "Open remaining bids" (the app computes `S_a, S_b` from published keys), "Settle", "Cancel" appear only when the corresponding `can*` view returns true. Explorer links for every transaction.
- Result: clearing price, total sold, allocation table from `BidOpened` events and `allocationOf`, market link to Kuru, claim/reclaim.
- My bids: reconstructed from chain (`bidderSlot` across auctions via multicall) plus vault records; shows sealed/opened/counted/allocation/claimable.
- Transactions: `receipt.status` checked; reverts decoded through the ABI's custom errors; user rejection reported plainly.
- Routing: `/auction/:id` validates the id; unknown routes render NotFound; an ErrorBoundary wraps the app.
- No auction names in localStorage. Names come from the token contract.

### 8.3 Pages kept and content updated

Home (auction list from chain, simulator, bot demo), How it works (rewritten for v2), Docs (addresses per chain, sealing format, call sequence), Team dashboard (authority's auctions with seed/unwind actions).

## 9. Networks and configuration

| | Testnet | Mainnet |
| --- | --- | --- |
| Chain id | 10143 | 143 |
| RPC | `https://testnet-rpc.monad.xyz` | `https://rpc.monad.xyz` |
| Explorer | `https://testnet.monadscan.com` | `https://monadscan.com` |
| Quote token | `TestToken("Blindlaunch USD", "tUSD", 6)` public mint | USDC `0x754704Bc059F8C67012fEd69BC8A327a5aafb603` (6 decimals) |
| Kuru | addresses in section 7 | addresses in section 7 |

Deployment order per chain: `KeeperRegistry` → `BlindAuctionV2(registry, seeder placeholder)` → `MarketSeeder(auction, router, marginAccount)` → `auction.setSeeder` → `registry.setAuction` → `TokenFactory` → (testnet) `TestToken` quote. Scripts under `contracts/script/` with `.env` values; all contracts verified on Sourcify (`sourcify-api-monad.blockvision.org`).

## 10. Testing strategy

| Layer | Tool | What |
| --- | --- | --- |
| `Secp256k1.sol` | Foundry | constants derived arithmetically, `isValid` (off curve, on-curve x ≥ n, x = 0, y bounds), `mulEquals` true/false (fuzz), `reconstruct` for all three pairs (fuzz), `shareKey` parity |
| `BlindAuctionV2` unit | Foundry | every revert path of every function (including `MissingAuction` on every entry point); happy paths for each phase; invalid-bid branches (forfeiting hash mismatch, refunded m ≥ 2^232, step out of range, qty 0, notional over deposit, notional over maxNotional); zero-bid settle; undersubscribed; exact clearing; cumulative pro-rata; audit regressions (H1 hostile sale token, H2 inconsistent shares, H3 1-lot cases, M1 paused sale token); split claims and reclaims; seed reserve, hand-off, release; cancel exclusivity with settle; events with `expectEmit`; boundaries (maxBids 65,535, top price 2^128 − 1, quantity 2^96 − 1) |
| Parity | Foundry + vectors | bids sealed by the TS package (bound to chain 31337 and a fixed contract address) open on chain to the same bid, refund or forfeit; v2 clearing matches `UniformClearing.clear` within one lot per bid with the same total |
| Invariants | Foundry fuzz/invariant | contract never holds more than owed; Σ allocation ≤ supplyLots; allocation ≤ quantity; refund ≥ 0; every bid opened exactly once; no state change after Settled/Cancelled except claims; reentrancy via hook token fails |
| Gas | Foundry | 200 bids opened with `openMany` batches of 50 (bound recorded); settle cost identical with 2 and 200 bids |
| Seeder | Foundry fork (testnet RPC) | `deployProxy` from a contract, deposit, resting orders, unwind; skipped when no RPC env |
| `sealed-bid` | Vitest | round trips, pair reconstruction, encode/decode bounds, domain binding, keeper key validation, cumulative clearing vs v1 on 2,000 books, checked-in vectors equal freshly generated ones |
| Keeper | Vitest + anvil | end to end on a local anvil: create → 3 bids → time warp → publish → open → settle; restart safety (`--once` twice is a no-op) |
| Web | Vitest | pure modules (`seal`, `vault`, `storage`, `errors`, `calculatePrecisions` port); a viem script against anvil exercises create/bid/open/settle/claim through the same action functions the UI calls |
| CI | GitHub Actions | `forge build && forge test`, `pnpm -r typecheck`, `pnpm -r test`, vectors up to date |

## 11. Repository and documentation changes

Delete: `Blindlaunch-Guide.docx`, `Blindlaunch System Architecture.pdf`, `docs/*.docx`, `apps/web/src/styles.css`, `packages/auction-core/`, `apps/web/src/clearing.ts`, unused exports in `ui.tsx`. Remove the Solana section from `.gitignore` and `lib/` from `contracts/.gitignore` (submodule).

Rewrite: `README.md`, `SETUP.md` (branch `master`, keepers, both chains), `docs/Blindlaunch-Project-Document.md` (v2 mechanism, 2-of-3 trust statement, lazy allocation, Kuru), `docs/auction-rules.md` (lots, price per lot, cumulative pro-rata, forfeiture), `docs/toolchain.md`. The two visibility/privacy design notes are rewritten to describe v2 and reference BTX as future work. `apps/web/src/screens/Docs.tsx` links to `master`.

Add: `docs/superpowers/specs/` (this file), `docs/superpowers/plans/`, `.github/workflows/ci.yml`, `apps/keeper/README.md`, `contracts/test/vectors/`.

## 12. Phases and exit criteria

| Phase | Scope | Exit criteria |
| --- | --- | --- |
| 0 Spikes and hygiene | forge-std submodule; CI; delete stale files; Kuru testnet spike (contract calls `deployProxy`, deposits, posts orders); Mera PRF spike page (two salts, two keys, iPhone + desktop); Multicall3 presence check on both chains | Spike results recorded in `docs/superpowers/spikes.md`; CI green on master |
| 1 Contracts and crypto | `packages/sealed-bid`, `Secp256k1`, `KeeperRegistry`, `TokenFactory`, `LaunchToken`, `TestToken`, `BlindAuctionV2` with the seeder hand-off tested against mock seeders; full test matrix of section 10 except seeder | `forge test` and vitest green; gas table recorded; parity vectors checked in |
| 2 Keeper, seeder, testnet | `MarketSeeder`, `settle → seed`, keeper service, deploy scripts, testnet deployment, Sourcify verification | A scripted auction runs end to end on testnet with three keeper processes and a Kuru market appears at the clearing price |
| 3 Web | New structure, auth (both), create, bid, auction, result, my bids, team, docs pages, error handling, polling | Scripted anvil e2e green; manual run on testnet from a phone with a passkey (via the Vercel preview URL, since passkeys need HTTPS) and from desktop MetaMask |
| 4 Mainnet and docs | Mainnet deploy + verification, USDC quote, README/SETUP/project document rewrite, demo staging (auctions in each phase), demo video and write-up | All docs match code; mainnet auction settled with a Kuru market; submission checklist complete |

## 13. Risks and spikes

| Risk | Handling |
| --- | --- |
| Kuru `deployProxy` not callable from a contract, or testnet Router differs from mainnet | Phase 0 spike on testnet fork; fallback path in section 7 |
| Kuru price/size precision makes ladder prices land between ticks | App computes params from the ladder and rejects ladders that do not map to whole ticks; seeder rounds ask up / bid down |
| Mera PRF unavailable on some desktop authenticators | Injected wallet remains available; the picker explains which passkey managers support PRF |
| Public RPC rate limits (25 rps) | Multicall/batched transport, 5 s polling, exponential backoff; keeper polls at 2 s with one `eth_getLogs` per pass |
| Keeper liveness | Three independent processes; `cancelAfter` refund path; "Open remaining bids" and "Settle" available to anyone in the UI |
| Griefing by filling `maxBids` | No settle loop limits the cap; the creator sets it (UI default 10,000, hard cap 65,535). Every slot locks a full deposit; slots filled with valid floor bids still lock honest bidders out, so the cap is not a monopoly defence on its own. Accepted for v2, documented; a commit fee is future work |
| Keeper key queue drained by spam auctions | Each `createAuction` consumes one key per keeper; keepers refill in batches of 50 every pass and skip auctions with no bids; creation reverts with `NoKeeperKeys` while empty. A refundable creation bond is future work |
| Keeper key broadcast before the deadline | Keeper simulates and gates on latest block time (section 6); tested in phase 2 (K3) |
| Hostile quote token chosen by the authority | Quote-token allowlist in the web app; documented in the trust statement |
| Authority shill bids act as a hidden reserve | The authority cannot bid from its own address, but other wallets can. Documented; the seeded market opens at the clearing price either way |
| Monad charges the gas limit, not gas used | Gas bounds are revm measurements; re-measure on testnet in phase 2 |
| ecrecover edge cases (`R.x ≥ n`, off-curve `R`) | Rejected at `commit`; covered by unit tests |

## 14. Open questions resolved in this document

- Forfeiture: only a commitment mismatch forfeits, to `0x…dEaD` (section 3.5). Bids that match but are out of range are refunded.
- Pro-rata rounding: cumulative in opening order; the clearing step sells exactly the remaining supply (section 3.6).
- Per-auction keeper keys: required, never reused (section 4.2).
- Bid data on chain, not only in logs: yes, for permissionless opening without log access.
- Settlement and the seed hand-off are separate transactions, so nothing external can block settlement (sections 3.6, 7).

## 15. Revision log

| Date | Change | Reason |
| --- | --- | --- |
| 2026-10-13 | Frozen pair; publish only before `cancelAfter`; cancel only with fewer than 2 keys; paginated tally; seed hand-off with gas floor; v1 token files untouched | Self-review while planning |
| 2026-10-13 | Forfeit on commitment mismatch | Audit H2: the pair can be chosen after reading bids, by a keeper or by front-running `publishKey` |
| 2026-10-13 | Cumulative pro-rata rounding; tally removed | Audit H3: floor rounding sold 0 of 1 lot with two bids; a 1-lot sybil halved a sale |
| 2026-10-13 | `settle` makes no external calls; seed reserved, then `handOffSeed` / `releaseSeed` | Audit H1: a sale token whose `balanceOf` reverts bricked settle and locked every deposit |
| 2026-10-13 | Claims and reclaims split per token | Audit M1: a paused sale token held back the quote refund |
| 2026-10-13 | Commitment binds chain id and contract; registry rejects duplicate keys and zero owners, adds `skip`; keeper publish timing rule; trust statement corrected | Audit M2, M3, L1, L2, I2 |
