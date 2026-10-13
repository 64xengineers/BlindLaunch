# Spike results (phase 0)

Date run: 2026-10-13

## Kuru (Task 0.4)

Run: `MONAD_TESTNET_RPC=https://testnet-rpc.monad.xyz forge test --match-path test/spike/KuruSpike.t.sol -vvvv` against a fork of Monad testnet (chain 10143). Result: **PASS**.

- deployProxy from a contract: **PASS**. A contract (`SpikeTrader`) created market `0xeE57A773D86b28C5Eb65E6CB57932c254D266cD5` on the testnet Router `0x7EFbE105Ca7415dE98F96622173458ac1c054630` with type 0 (ERC20/ERC20), sizePrecision 1e8, pricePrecision 1e4, tickSize 1, minSize 1e6, maxSize 1e16, kuruAmmSpread 100.
- Fee parameters accepted: takerFeeBps 0, makerFeeBps 0.
- Deposit for a contract, resting order from a contract: **PASS**. `MarginAccount.deposit(address(this), token, amount)` from a contract credits it; `addSellOrder(25_000, 10e8, true)` rests; a second contract's `addBuyOrder(25_000, 10e8, false)` fills it.
- Unit check: seller received **25,000,000** quote base units (6 decimals) for 10 base tokens (18 decimals) at price 25,000. Expected 25,000,000. Price is human quote-per-base × pricePrecision; size is human base × sizePrecision, as the spec's conversion assumes.
- Trace notes: Router and MarginAccount are proxies (implementations `0x72caE0a9…`, `0xF10af40F…`). Fills credit the maker through `MarginAccount.creditUsersEncoded` and debit the taker through `debitUser`.
- **Decision for MarketSeeder: primary path** (the seeder contract creates the market, deposits and posts orders itself). The keeper fallback in spec section 7 is not needed on testnet. Re-run this spike on a mainnet fork in phase 4 before the mainnet deploy.

## Mera (Task 0.5)

The spike page is at `/spike/mera` (`apps/web/src/spikes/MeraSpike.tsx`). It needs a person with a passkey-capable device, so it has not been run yet. It gates phase 3 (web), not phase 1 or 2.

| Environment | Create | Sign in | Outputs differ | Vault round trip | Notes |
| --- | --- | --- | --- | --- | --- |
| Chrome desktop, Google Password Manager | not run | not run | not run | not run | run `pnpm dev`, open `http://localhost:5173/spike/mera` |
| Safari desktop, iCloud Keychain | not run | not run | not run | not run | same URL |
| iPhone Safari, iCloud Keychain | not run | not run | not run | not run | needs an HTTPS Vercel preview (owner approval) |
| 1Password | not run | not run | not run | not run | optional |

- `prfSalt` type accepted by `@category-labs/mera` 0.2.0: `Uint8Array` (from `dist/passkey.d.ts`). `getPasskeyPrfOutput` returns `{ credentialId: string, prfOutput: Uint8Array<ArrayBuffer> }`. `createPasskeyWithPrfOutput` returns `PasskeyCredentialMetadata & { prfSalt, prfOutput }`.
- Mera 0.2.0 bundles its own `@noble/curves` 2.2.0 and `@noble/hashes` 2.2.0; peer dependency `viem ^2.28.0`. The viem adapter is `toViemAccount(session)` from `@category-labs/mera/viem`, returning a viem `LocalAccount<"mera">`.
- Deviations from Mera's docs for our pinned versions: `@scure/bip39` 1.6.0 exports the wordlist as `@scure/bip39/wordlists/english` (no `.js`); WebCrypto `importKey` needs `Uint8Array<ArrayBuffer>`.

## Network (Task 0.6)

| Check | Testnet 10143 | Mainnet 143 |
| --- | --- | --- |
| Multicall3 `0xcA11bde05977b3631167028862bE2a173976CA11` | present | present |
| Kuru Router | `0x7EFbE105Ca7415dE98F96622173458ac1c054630` present | `0xd651346d7c789536ebf06dc72aE3C8502cd695CC` present |
| Kuru MarginAccount | `0xd029C2D98ff85D8F64799017fE00a59B1159CE02` (used in spike) | `0x2A68ba1833cDf93fa9Da1EEbd7F46242aD8E90c5` present |
| USDC | n/a (testnet uses a public-mint `TestToken`) | `0x754704Bc059F8C67012fEd69BC8A327a5aafb603`, symbol `USDC`, 6 decimals |
| `cast chain-id` | 10143 | 143 |

## Kuru order ids (Task 2.0)

Run: same fork command, test `test_contractCanCancelItsOwnRestingOrder`. Result: **PASS**.

- After `addSellOrder`, the new order's id is `OrderBook.s_orderIdCounter()` (it was `1` on a fresh market).
- `OrderBook.s_orders(id)` returns `(owner, size, prev, next, flippedId, price, flippedPrice, isBuy)`; owner was the seller contract, size `10e8`, price `25_000`, `isBuy` false.
- `batchCancelOrders([id])` from the owning contract followed by `MarginAccount.withdraw(10e18, base)` returned the full deposit.
- `bestBidAsk()` reports prices scaled to 18 decimals (`2.5e18` for price 25,000 at pricePrecision 1e4) and `type(uint256).max` as the best bid of an empty book. Do not compare it to `addSellOrder` prices without rescaling.
- **Decision:** `MarketSeeder.seed` records each order id by reading `s_orderIdCounter()` right after posting; `unwind` cancels those ids itself. No log parsing is needed.
