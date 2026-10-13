# Blindlaunch v2 Roadmap (phases 0 to 4)

> **For agentic workers:** phases 0 and 1 have a code-level plan in `2026-10-13-blindlaunch-v2-phase0-1.md`. Phases 2 to 4 are specified here at task level (files, interfaces, behaviour, test cases, commands, exit criteria). Before starting a phase, expand it into its own code-level plan with superpowers:writing-plans, using the results recorded in `docs/superpowers/spikes.md` and the code that exists at that point. Then execute it with superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Ship Blindlaunch v2, sealed bids that open themselves with a Kuru market at the clearing price, on Monad testnet and then mainnet.

**Spec:** `docs/superpowers/specs/2026-10-13-blindlaunch-v2-design.md`

---

## Status

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | Spikes, hygiene, CI | Done on branch `v2/phase-0-1`. Mera device matrix not yet run (needs a person with a passkey device). |
| 1 | `@blindlaunch/sealed-bid`, v2 contracts, full test suite | Done on branch `v2/phase-0-1`. |
| 1b | Fixes for the independent audit (H1, H2, H3, M1, M2, M3, L1, L2, I2, I4) | Done on branch `v2/phase-0-1`. 133 Foundry tests, 37 Vitest tests. |
| 2 | Market seeder, deploy scripts, keeper service, testnet deployment | Next |
| 3 | Web app rebuild | After phase 2 testnet deployment |
| 4 | Mainnet, docs, demo | After phase 3 |

Dependency order: 2.1 → 2.2 → 2.4; 2.3 can run in parallel with 2.1; 3.x needs 2.4 (testnet addresses) and the Mera matrix; 4.x needs 3.x.

## Phase 0 and 1 execution log (deviations from the plan)

| Where | What happened | Resolution |
| --- | --- | --- |
| Task 1.9 | The plan's Solidity field prime `P` literal was two hex digits short; `isValid` rejected every point (caught by `test_generatorIsValid`). | Fixed literal; added `test_constantsMatchTheCurve`, which derives `p` and `INV2` arithmetically. |
| Task 1.11 | `V2Base` calls functions the plan adds in Tasks 1.12 to 1.17, so nothing compiled until the whole contract existed. | Assembled the full contract from the plan's blocks in Task 1.11; each later task added its suite as a checkpoint. All suites pass. |
| Task 1.12 | Legacy codegen cannot copy a memory struct containing `Point[3]` into storage. | `V2Base._store` copies field by field. |
| Task 1.17 | `vm.expectEmit` placed before setup matched the registry's first event. | Moved next to `settle`. |
| Task 1.18 | Stack too deep in the vector test helper. | Split into five helpers; `via_ir` not needed anywhere. |
| Task 1.19 | `reference` is a reserved word. | Renamed to `v1Clearing`. |
| Task 1.19 | Measured gas: 45,271 per opened bid (batches of 50), 295,296 to settle and tally 200 pro-rata bids. | Bounds 57,000 and 370,000 in `Gas.t.sol`. |
| Task 0.5 | `@scure/bip39` 1.6.0 exports `wordlists/english` without `.js`; WebCrypto needs `Uint8Array<ArrayBuffer>`. | Recorded in `spikes.md`. |
| Task 2.0 | Order ids: `s_orderIdCounter()` after posting, verified by `s_orders(id)`; cancel and withdraw return the deposit. | Recorded in `spikes.md`; done ahead of phase 2. |

## Phase 1b: audit fixes (done)

An independent audit of the spec and the phase 0-1 plan found three high, five medium, seven low and four informational items, each high and medium with a passing proof of concept. All fixes are in commit `0c8c977` and the spec's revision log (section 15).

| Finding | Fix | Regression test |
| --- | --- | --- |
| H1 hostile sale token bricks `settle`, deposits locked | `settle` reads storage only; seed reserved, then `handOffSeed` (retryable) or `releaseSeed` after the lock | `Seed.t.sol::test_hostileSaleTokenCannotLockDeposits` |
| H2 pair chosen after reading bids | Commitment mismatch forfeits the deposit to `0x…dEaD` via `burnForfeits` | `Open.t.sol::test_inconsistentSharesDependOnTheFrozenPairOnly`, `Claim.t.sol::test_forfeitedBidGetsNothingAndIsBurned` |
| H3 floor rounding sells nothing / sybil halves sale | Cumulative rounding by opening order (`Bid.prefix`); `tally` removed | `Settle.t.sol::test_oneLotTwoBiddersSellsTheLot`, `test_oneLotSybilCannotShrinkTheSale`, `test_manySmallBidsAtTheClearingStepSellEverything` |
| M1 paused sale token blocks quote refund | `claimRefund` / `claimTokens`, `reclaimUnsold` / `reclaimProceeds` | `Claim.t.sol::test_pausedSaleTokenDoesNotBlockRefund` |
| M2 trust statement overstated | Rewritten (spec 3.8) | docs |
| M3 keeper broadcasts key early | Keeper rule: simulate, gate on latest block time (spec 6) | phase 2 K3 |
| M4, M5 slot filling, key drain | Documented; keepers skip zero-bid auctions; commit fee and creation bond are future work | phase 2 K3 |
| L1 duplicate keeper keys | Registry `used` set | `KeeperRegistry.t.sol::test_rejectsDuplicateKeysWithinAndAcrossKeepers` |
| L2 zero owner, no skip | `ZeroOwner`, `skip(i, count)` | `test_rejectsZeroOwner`, `test_ownerCanSkipCompromisedKeys` |
| L4 allowance left after hand-off | `handOffSeed` requires both allowances back to 0 | `Seed.t.sol::test_handOffMovesExactAmountsAndReclaimExcludesThem` |
| L5 `seal` trusts its keys | `seal` rejects invalid keys | `seal.test.ts` "refuses invalid keeper keys" |
| L6 `via_ir` fallback would change v1 bytecode | Never used; tests restructured instead | — |
| I2 commitment not domain-bound | `h` includes chain id and contract address | `bid.test.ts`, `Vectors.t.sol` |
| I4 ecrecover trick unverified on Monad | `cast call 0x01` returns `addr(2·G)` on testnet and mainnet | recorded in spec 3.4 |
| Missing tests | `Guards.t.sol` (every entry point on a missing auction, open after settle, bad share in a batch, swapped shares, key 0 and ≥ n, double cancel, EOA sale token, key rollback, payout events, boundaries), on-curve x ≥ n, settle cost independent of bid count, vectors freshness test | as listed |

Measured after the fixes: 42,453 gas per opened bid (batches of 50); `settle` 102,412 gas with 2 bids and with 200 bids.

---

## Phase 2: Seeder, deployment, keepers, testnet

Spike result that shapes this phase: a contract can call Kuru `Router.deployProxy`, deposit to `MarginAccount` for itself, and post and fill orders; prices are human quote-per-base × `pricePrecision`, sizes human base × `sizePrecision` (`spikes.md`). The seeder therefore takes the **primary path**: atomic, no keeper custody.

### Task 2.0: Order-id spike

`MarketSeeder.unwind` must cancel the orders it posted, and `addSellOrder`/`addBuyOrder` return nothing. Extend `contracts/test/spike/KuruSpike.t.sol` with a test that posts an order from a contract and recovers its id by (a) reading the `OrderCreated(orderId, owner, size, price, isBuy)` log in the test, and (b) checking for an on-chain view (for example `s_orderIdCounter` or a getter in the OrderBook ABI from `github.com/Kuru-Labs/kuru-sdk/abi/OrderBook.json`). Then call `batchCancelOrders([id])` and `MarginAccount.withdraw` to confirm the funds come back. Record the outcome in `spikes.md`. If no on-chain way to learn the id exists, `unwind` takes the ids as an argument (read from logs by the web app) and the seeder verifies ownership through a cancel that reverts for orders it does not own.

Test: `test_contractCanCancelItsOwnRestingOrder` passes on the testnet fork.

### Task 2.1: `MarketSeeder`

Files: `contracts/src/MarketSeeder.sol`, `contracts/src/kuru/IKuruRouter.sol`, `IKuruMarginAccount.sol`, `IKuruOrderBook.sol`, `contracts/test/v2/MarketSeeder.t.sol`, `contracts/test/v2/kuru/MockKuru.sol`, `contracts/test/spike/MarketSeederFork.t.sol`.

Interface (implements `IMarketSeeder`):

```
constructor(address auction, IKuruRouter router, IKuruMarginAccount margin)
kuruParams = abi.encode(uint96 sizePrecision, uint32 pricePrecision, uint32 tickSize,
                        uint96 minSize, uint96 maxSize, uint256 takerFeeBps,
                        uint256 makerFeeBps, uint96 kuruAmmSpread)
validate(SeedConfig)            view: decode params; every ladder price maps to whole ticks;
                                price(0) ≥ 2 ticks; top price fits uint32; tokens report decimals ≤ 36
accept(SeedOrder)               only auction; transferFrom both amounts; store Pending
seed(uint256 auctionId)         anyone; once; market = marketOf[sale][quote] or Router.deployProxy(type 0, …);
                                deposit both to MarginAccount; addSellOrder(ask, size, true);
                                addBuyOrder(bid, size, true); record order ids; emit MarketSeeded
unwind(uint256 auctionId, …)    authority, now ≥ lockUntil; batchCancelOrders; withdraw both balances;
                                transfer everything (including never-seeded pending funds) to authority
marketOf(sale, quote) view
```

Unit conversion (from the spec, confirmed by the spike):

```
kuruPrice = clearingPrice · pricePrecision · 10^saleDecimals / (10^quoteDecimals · lotSize)
askPrice  = ceil(kuruPrice / tickSize) · tickSize        (uint32, checked)
bidPrice  = askPrice − tickSize
askSize   = saleAmount · sizePrecision / 10^saleDecimals   (uint96, ≥ minSize or skip the ask)
bidSize   = quoteAmount · 10^saleDecimals · sizePrecision · pricePrecision
            / (bidPrice · 10^quoteDecimals · 10^saleDecimals)   (uint96, ≥ minSize or skip the bid)
```

Test cases (`MarketSeeder.t.sol` against `MockKuru`, runs in CI):

| ID | Case | Expected |
| --- | --- | --- |
| S1 | `validate` with ladder 50..100 step 10, tick 1, pricePrecision 1e4, 0-decimal tokens | passes |
| S2 | `validate` where a ladder price is between ticks | reverts `OffTick` |
| S3 | `validate` where `price(0)` < 2 ticks | reverts `PriceTooLow` |
| S4 | `validate` where top price overflows uint32 | reverts `PriceTooHigh` |
| S5 | `accept` from a non-auction | reverts `NotAuction` |
| S6 | `accept` pulls exact amounts; second `accept` for same id | reverts `AlreadyAccepted` |
| S7 | `seed` deploys a market once, reuses it for a second auction of the same pair | one `deployProxy` call |
| S8 | `seed` posts ask at `ceil` tick and bid one tick lower with the converted sizes (18-decimal sale, 6-decimal quote, lotSize 1e18, clearing 2.5 USDC/token) | ask 25,000, sizes as computed |
| S9 | `seed` with sale or quote amount below `minSize` | posts only the other side |
| S10 | `seed` twice | second reverts `AlreadySeeded` |
| S11 | `seed` reverting inside Kuru | `BlindAuctionV2.settle` still succeeds, funds pending, retry succeeds after the mock is fixed |
| S12 | `unwind` before `lockUntil` / by non-authority | reverts `Locked` / `NotAuthority` |
| S13 | `unwind` after lock | orders cancelled, all balances to authority, seeder holds 0 |
| S14 | End to end with `BlindAuctionV2`: create with seeding, bid, open, settle | `MarketSeeded` emitted in the settle transaction |

Fork test (`MarketSeederFork.t.sol`, skipped without `MONAD_TESTNET_RPC`): S14 against real Kuru testnet contracts, then a third party buys from the seeded ask at the clearing price.

Exit: `forge test` green; fork test green with RPC.

### Task 2.2: Deploy scripts and deployments record

Files: `contracts/script/DeployV2.s.sol`, `contracts/script/DemoV2.s.sol`, `deployments/testnet.json`, `deployments/mainnet.json` (written by the script), `.env.example` (add `KEEPER0_OWNER`, `KEEPER1_OWNER`, `KEEPER2_OWNER`, `KURU_ROUTER`, `KURU_MARGIN`).

`DeployV2` order: `KeeperRegistry(owners)` → `BlindAuctionV2(registry)` → `MarketSeeder(auction, router, margin)` → `auction.setSeeder` → `registry.setAuction` → `TokenFactory` → on testnet `TestToken("Blindlaunch USD", "tUSD", 6)`. Writes addresses and deployment block to `deployments/<chain>.json` with `vm.writeJson`. Verification: `forge verify-contract --verifier sourcify` for each address; record the Sourcify `match` status.

Tests:

| ID | Case | Expected |
| --- | --- | --- |
| D1 | `forge script DeployV2 --fork-url $MONAD_TESTNET_RPC` (no broadcast) | completes, prints 6 addresses |
| D2 | Same against local anvil with mock Kuru | completes; `auction.seeder()` and `registry.auction()` wired |
| D3 | `deployments/testnet.json` schema check in keeper tests | keys `chainId, deployBlock, registry, auction, seeder, factory, quote` |

### Task 2.3: Keeper service `apps/keeper`

Files:

```
apps/keeper/package.json, tsconfig.json, README.md
src/config.ts       env parsing (CHAIN, RPC_URL, KEEPER_INDEX, KEEPER_PRIVATE_KEY, KEY_STORE,
                    QUEUE_TARGET=20, POLL_MS=2000, DEPLOYMENTS path)
src/keystore.ts     JSON file {cursorBlock, keys: {pubX: secretHex}}, written atomically, mode 600
src/chain.ts        viem public + wallet clients, explicit nonce manager, retry on nonce errors
src/abi.ts          generated from contracts/out (BlindAuctionV2, KeeperRegistry, MarketSeeder)
src/topUp.ts        available(index) < target → generate keys (sealed-bid randomScalar/mulBase), store, enqueue
src/scan.ts         getLogs(AuctionCreated, KeyConsumed) from cursor in 2,000-block windows
src/publish.ts      for my consumed keys whose auction is Open, has bids, fewer than 2 keys, and whose
                    commitDeadline ≤ latest block timestamp < cancelAfter: simulate, then publishKey
src/open.ts         for Open auctions with publishedCount = 2: read unopened bids, sharedPoint(sk, R)
                    for the frozen pair from published keys, openMany in batches of 50
src/settle.ts       canSettle → settle; seedState Reserved → handOffSeed; forfeits → burnForfeits;
                    seeder pending → seeder.seed
src/loop.ts         one pass = topUp, scan, publish, open, settle; sleep POLL_MS; --once runs one pass
src/cli.ts          entry: `pnpm --filter @blindlaunch/keeper start [--once]`
```

Any keeper can open and settle any auction, since published keys are on chain. Only publishing needs this keeper's secret.

Test cases (Vitest; the e2e runs against a local anvil started by the test, with `DeployV2` broadcast to it and the Kuru mock):

| ID | Case | Expected |
| --- | --- | --- |
| K1 | keystore round trip, file mode 600, atomic write survives a crash mid-write (temp file then rename) | reload equals saved |
| K2 | topUp enqueues `QUEUE_TARGET − available` keys and stores every secret before sending the tx | registry `available` = target |
| K3 | publish skips auctions with no bids, before the deadline **by latest block time** (local clock ahead of chain), after `cancelAfter`, already published, or with 2 keys; never broadcasts a transaction whose simulation reverts | no tx, and no `publishKey` calldata in any mined block |
| K4 | publish sends exactly one tx for an eligible auction; second pass is a no-op | idempotent |
| K5 | open computes the same shared points as `sealed-bid` `openBid` | equal |
| K6 | open batches 120 bids as 50/50/20 | 3 txs |
| K7 | settle, handOffSeed and burnForfeits for a 300-bid pro-rata auction with one forfeited bid | settled, seed handed off, forfeit burned |
| K8 | e2e: create auction, 5 bidders seal with `sealed-bid`, warp past deadline, run keepers 0 and 2 with `--once` | settled, finalized, allocations equal `clearing.ts` prediction |
| K9 | e2e restart safety: run every keeper `--once` twice more | no tx sent |
| K10 | e2e liveness: only keeper 1 alive past `cancelAfter` | auction stays Open with 1 key, `cancel` succeeds, refunds paid |
| K11 | nonce error on send (mocked) | retried once with a fresh nonce |

Exit: `pnpm --filter @blindlaunch/keeper test` green including the anvil e2e.

### Task 2.4: Testnet deployment and live run

Steps (owner approves each broadcast; deployer and keeper keys come from the owner's `.env`, never committed):

1. Fund deployer and three keeper addresses from the Monad faucet.
2. `forge script DeployV2 --rpc-url $MONAD_TESTNET_RPC --broadcast`, then verify on Sourcify.
3. Start three keepers locally (`pnpm keepers`, three env files).
4. `DemoV2` script: create a 1,000-lot auction with a 2-minute window and seeding, five bidder wallets bid through a TS script using `sealed-bid`.
5. Watch: keys published, bids opened, settled, `MarketSeeded`, Kuru testnet market has resting orders at the clearing price.

Tests: T1 the run above completes without manual contract calls; T2 a sixth wallet buys from the seeded ask on Kuru at the clearing price; T3 every bidder and the authority claim, the auction contract holds 0 of both tokens.

Exit: addresses in `deployments/testnet.json`; run log (tx hashes) appended to `spikes.md`.

---

## Phase 3: Web application

Prerequisite: Mera matrix in `spikes.md` run on at least desktop Chrome and iPhone Safari.

### Task 3.1: Chain layer

Files: `apps/web/src/chain/config.ts` (per chain: id, RPC, explorer, addresses from `deployments/*.json`, `VITE_CHAIN`), `clients.ts` (public client with `batch: { multicall: true }`, Multicall3 address), `abi/` (generated by a `pnpm abi` script from `contracts/out`), `reads.ts` (`listAuctions(from nextAuctionId down, page 20)`, `getAuctionView`, `getBids`, `getMyBids` via multicall), `events.ts` (`BidOpened` history for the result table), `kuru.ts` (`calculatePrecisions` port and the seeder's price/size conversion, used for the Create preview).

Tests (Vitest, pure functions and a mocked client): C1 listAuctions pages newest first with no cap; C2 reads decode every `Auction` field; C3 kuru conversion matches Task 2.1 S8 numbers; C4 ladder-to-tick check matches `MarketSeeder.validate` on S1 to S4 inputs.

### Task 3.2: Auth

Files: `auth/providers.ts` (EIP-6963 discovery), `auth/injected.ts` (connect, `eth_accounts` reconnect, `chainChanged`, switch-before-write), `auth/mera.ts` (create or sign in, `toViemAccount`, second ceremony with `prfSalt = sha256("blindlaunch.vault.v1")` for the vault key), `auth/session.tsx` (one `Signer` type for both).

Tests: A1 EIP-6963 announcements dedupe by `rdns`; A2 reconnect uses `eth_accounts` without a popup; A3 wrong chain triggers a switch before `writeContract`; A4 Mera path derives the same address as the spike for a fixed PRF output (unit test with a fake WebAuthn client, which Mera supports through `webAuthnClient`).

### Task 3.3: Bids

Files: `bids/seal.ts` (wraps `sealed-bid` `seal` with the auction's keeper keys), `bids/vault.ts` (AES-GCM with the vault key), `bids/storage.ts` (records keyed by `chainId:auction:auctionId:bidder`, schema-validated on read), `bids/open.ts` ("Open remaining bids" from published keys).

Tests: B1 seal output passes the contract's `isValid` rule and opens with `openBid`; B2 vault round trip, wrong key fails; B3 corrupted storage entries are dropped, not thrown; B4 open.ts builds the same `openMany` calldata as the keeper; B5 seal reads keeper keys from `keeperKeysOf` and the domain from the connected chain and the deployment, never from cache; B6 before sending `commit`, the app re-opens its own sealed bid locally with `openBid` against the sealed record and refuses to send if it would forfeit.

### Task 3.4: State and actions

Files: `state/store.tsx` (auctions, selected auction, bids, my bids; 5 s polling with backoff; stops when tab hidden), `state/actions.ts` (createToken, createAuction, commit, openRemaining, settle, tally, cancel, claim, reclaim, unwind; every write checks `receipt.status` and reads the auction id from the `AuctionCreated` log), `state/errors.ts` (decode custom errors to plain sentences).

Tests: X1 reverted receipt surfaces as an error, not success; X2 auction id comes from the log even when another auction was created in the same block; X3 every custom error in the ABI has a sentence; X4 polling stops when hidden and resumes.

### Task 3.5 to 3.8: Screens

| Screen | Behaviour | Tests |
| --- | --- | --- |
| Create | "New token" (factory) or "Existing token" (address → name, symbol, decimals, balance); quote token from an allowlist (tUSD on testnet; USDC, WMON on mainnet); ladder, lot size, deposit, max bids, windows, seeding, Kuru preview; validation mirrors every `createAuction` revert | P1 each contract revert has a matching form error; P2 three-step flow (token, approve, create) resumes after a rejected step; P10 quote token outside the allowlist cannot be chosen |
| Auction | Status bar (sealed, keys, opened, settled), countdown, bid card (one tx plus exact approve), "Open remaining bids", "Settle", "Cancel" shown only when `can*` is true, demand chart after opening | P3 buttons follow `canSettle`/`canCancel`; P4 bid form blocks invalid notional before signing |
| Sealed | Reads the record from vault storage and chain; never claims a custom salt | P5 reload while disconnected shows chain data and asks to connect for the private record |
| Result | Clearing price, sold, allocation table from `BidOpened` (counted, refunded, forfeited), Kuru market link; "Claim" plus separate "Claim refund only" and "Claim tokens" when one leg fails; authority: reclaim legs, hand off seed, release seed after lock; anyone: burn forfeits | P6 table equals `clearing.ts` for the reference example; P9 a failing tokens leg still lets the refund be claimed |
| My bids, Team | From chain via multicall plus vault records; Team shows unwind after lock | P7 lists auctions past id 20 |
| Home, How, Docs, NotFound | v2 copy, addresses per chain, ErrorBoundary, route id validation | P8 `/auction/abc` renders NotFound, app stays mounted |

Delete in Task 3.8: `apps/web/src/auction.tsx`, `wallet.ts`, `clearing.ts`, `spikes/MeraSpike.tsx` and its route, unused `Field`/`Logo` exports.

### Task 3.9: Scripted end to end

`apps/web/scripts/e2e.ts`: against anvil plus `DeployV2` plus the keeper `--once`, call the same `state/actions.ts` functions the UI calls: createToken, createAuction with seeding, five commits, keepers, claim, reclaim, unwind after warp. Assert balances and the seeded market. Runs in CI.

### Task 3.10: Manual QA on testnet

Checklist run on the Vercel preview (owner approves the deploy): desktop Chrome with MetaMask; iPhone Safari with a passkey; create a token and auction, bid from both, close, watch keepers, claim, see the Kuru market. Record results in `docs/superpowers/qa-testnet.md`.

Exit: `pnpm typecheck && pnpm test && pnpm build` green; e2e green; QA checklist complete.

---

## Phase 4: Mainnet, docs, demo

| Task | Work | Exit / tests |
| --- | --- | --- |
| 4.1 | Re-run the Kuru spike and `MarketSeederFork` on a **mainnet** fork (Router `0xd651…95CC`, MarginAccount `0x2A68…90c5`, USDC 6 decimals) | both green on fork |
| 4.2 | Mainnet `DeployV2` (owner-funded deployer, owner approves broadcast), Sourcify verification, `deployments/mainnet.json` | M1 verification `exact_match` or `match`; M2 `seeder()`/`auction()` wiring read back |
| 4.3 | Keepers on mainnet: three hosts chosen by the owner, separate keys, `QUEUE_TARGET` 20, alerting on missed publication | M3 a mainnet auction with 3 small bids settles and seeds without manual calls |
| 4.4 | Docs: rewrite `README.md`, `SETUP.md` (branch `master`, both chains, keepers), `docs/Blindlaunch-Project-Document.md`, `docs/auction-rules.md`, both design notes, `docs/toolchain.md`; trust statement from spec 3.8 verbatim | M4 every number and claim in docs traced to code or a test (checklist in the PR) |
| 4.5 | Demo staging on mainnet: one auction in each state (bidding, opening, settled with live Kuru market) | M5 links resolve |
| 4.6 | Video (90 s script from the brief) and write-up, including Even's admitted gaps vs v2, the committee trust assumption, and measured gas | owner review |
| 4.7 | Final review: superpowers:requesting-code-review on the full diff, then superpowers:finishing-a-development-branch | review findings resolved |

---

## Master test catalogue

| Area | Where | Count today | Covers |
| --- | --- | --- | --- |
| v1 contract | `contracts/test/BlindAuction.t.sol` | 16 | Unchanged record of the deployed v1 |
| Tokens | `test/v2/Tokens.t.sol` | 6 | Metadata, events, allowances, factory validation |
| Curve library | `test/v2/Secp256k1.t.sol` | 11 | Constants, point validation incl. on-curve x ≥ n, ecrecover scalar check (fuzz), reconstruction for all pairs (fuzz), share key parity |
| Keeper registry | `test/v2/KeeperRegistry.t.sol` | 10 | FIFO, ownership, rotation, zero owner, duplicate keys, skip, validation, auction-only consume |
| Create | `test/v2/Create.t.sol` | 13 | Every `createAuction` revert, lots, single-step ladder, keeper keys, fee-on-transfer sale token |
| Commit | `test/v2/Commit.t.sol` | 8 | Window, authority, one bid per wallet, max bids, ephemeral validation, fee-on-transfer quote |
| Publish | `test/v2/Publish.t.sol` | 7 | Timing, key check, double and third publication, frozen sorted pair, after cancel |
| Open | `test/v2/Open.t.sol` | 11 | Every pair, wrong shared point, invalid bids of five kinds (one forfeits), copied ciphertext forfeits, inconsistent shares vs frozen pair (H2), prefixes, batching |
| Settle | `test/v2/Settle.t.sol` | 12 | Reference example with event, undersubscribed, no bids, invalid only, exact fill, cumulative pro-rata, H3 regressions, guards, no deadline |
| Claim | `test/v2/Claim.t.sol` | 13 | Payouts and zero residual, invalid refunds, no unsold remainder, lots in base units, split legs, M1 regression, forfeits burned, guards, cancel, no cancel once paired, reentrancy, claimable view |
| Seed | `test/v2/Seed.t.sol` | 12 | setSeeder, validate at create, config bounds, reserve without calls, hand-off amounts and allowances, failed hand-off then release, seed retry, greedy seeder, nothing sold, sold out, zero quote share, H1 regression |
| Guards | `test/v2/Guards.t.sol` | 10 | Missing auction on every entry point, open after settle, bad share in a batch, swapped shares, key 0 and ≥ n, double cancel, EOA sale token, key rollback, payout events, boundaries |
| Parity | `test/v2/Vectors.t.sol` | 1 (6 vectors) | TS-sealed bids open on chain for every pair; out-of-ladder and zero-quantity refunded; corrupted case forfeits |
| Differential and solvency | `test/v2/Fuzz.t.sol` | 1 × 256 runs | v2 vs v1 clearing (same step, price and total; within one lot per bid), random forfeits, zero residual balance, all pairs |
| Gas | `test/v2/Gas.t.sol` | 2 | 200 bids: open bound 54,000 per bid, settle bound 129,000; settle cost equal for 2 and 200 bids |
| Kuru spike | `test/spike/KuruSpike.t.sol` | 2 (fork) | Contract-driven market creation and fill; order id recovery and cancel |
| sealed-bid | `packages/sealed-bid/tests` | 37 | Curve, encoding, domain binding, Shamir, seal/open, key validation, clearing mirror with 2,000-book differential, vectors freshness |
| Phase 2 | this file | S1 to S14, D1 to D3, K1 to K11, T1 to T3 | Seeder, deploy, keepers, live testnet |
| Phase 3 | this file | C1 to C4, A1 to A4, B1 to B6, X1 to X4, P1 to P10, e2e | Web |
| Phase 4 | this file | M1 to M5 | Mainnet and docs |
