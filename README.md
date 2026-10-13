# Blindlaunch

**Sealed-bid, uniform-price token launches on Monad.**

Blindlaunch is a token launch where speed does not win. A team escrows a fixed token supply. During a commit window, bidders lock the same fixed deposit and submit only a hash of their price and quantity. After the window closes they reveal, the contract computes **one clearing price**, every winner pays that price, and unused deposits are refunded. If nobody settles before the timeout, every deposit and every unsold token goes back to its owner.

Built for the [Monad Metropolis](https://monad.xyz/developers/hackathons/metropolis) hackathon, **Onchain Finance & Trading** track.

| | |
| --- | --- |
| Live app | [blind-launch-one.vercel.app](https://blind-launch-one.vercel.app) |
| Network | Monad Testnet, chain id `10143` |
| BlindAuction | [`0xacC12B4bdae66Ef42939340Fa1811BD629F18cC2`](https://testnet.monadexplorer.com/address/0xacC12B4bdae66Ef42939340Fa1811BD629F18cC2) (source verified) |
| Local setup | [SETUP.md](SETUP.md) |
| Formal docs | [`docs/`](docs/) |

> **Testnet hackathon build.** Test tokens only. The contract is not audited. Do not deploy it to mainnet or fund it with real assets. Nothing here is financial advice.

---

## Contents

- [Why Blindlaunch](#why-blindlaunch)
- [How an auction works](#how-an-auction-works)
- [Pricing rules](#pricing-rules)
- [What is hidden and what is public](#what-is-hidden-and-what-is-public)
- [Deployed contracts](#deployed-contracts)
- [Web app](#web-app)
- [Bid secrets and recovery](#bid-secrets-and-recovery)
- [Architecture](#architecture)
- [Repository](#repository)
- [Quick start](#quick-start)
- [Contract reference](#contract-reference)
- [Deploy and verify](#deploy-and-verify)
- [Hosting](#hosting)
- [Documentation](#documentation)
- [Security model and limitations](#security-model-and-limitations)
- [Roadmap](#roadmap)
- [Handoff status](#handoff-status)
- [References](#references)

---

## Why Blindlaunch

Open token launches are races. Bots read pending transactions, buy first and cheapest, and leave real buyers paying more. Blindlaunch removes the race:

- **Hidden bids.** During bidding only a commitment hash is on chain. Nobody can copy, react to or front-run a bid.
- **One price.** Every winner pays the same clearing price, however high they bid. Bidding high secures a fill, not a worse price.
- **Order does not matter.** Every bid in the window is treated the same. Sending first earns nothing.
- **Escrow by code.** The contract holds the supply and every deposit. Nobody, including the team, can withdraw outside its rules, and a cancel path guarantees refunds.

---

## How an auction works

1. **Create.** Any wallet calls `createAuction` and becomes the auction's **authority**. The contract pulls the full sale supply from that wallet.
2. **Commit (bidding window).** A bidder locks the fixed quote-token deposit and calls `commit` with `hashBid(auctionId, bidder, priceStep, quantity, salt)`. One bid per wallet. The authority cannot bid.
3. **Reveal (15 minutes after close in the web app).** The bidder sends price step, quantity and salt. The contract recomputes the hash, so a bid cannot change after sealing. A revealed bid counts only if the step is on the ladder, quantity > 0, and `price × quantity ≤ deposit` and `≤ maxNotional`. A wrong salt does not consume the commit.
4. **Settle (next 15 minutes).** Anyone calls `settle`. The contract writes the clearing price, clearing step and every allocation.
5. **Claim.** Each bidder calls `claim`: allocated sale tokens plus `deposit − clearingPrice × allocation`. The authority calls `reclaim`: proceeds plus unsold tokens.
6. **Cancel (fallback).** If the auction is still open at `cancelAfter` (30 minutes after close in the web app), anyone calls `cancel`. Every bidder reclaims the full deposit and the authority reclaims the full supply.

A bidder who never reveals is not filled and still claims the full deposit after settlement or cancellation. Gas is paid in MON and never taken from the deposit. The contract takes no fee.

---

## Pricing rules

Prices and amounts are integers. The price at a step is `minPrice + step × stepSize`. Demand at a step is the sum of counted quantities at that step or higher.

1. The **clearing step** is the highest step whose demand covers the supply. If even step 0 is undersubscribed, the auction clears at step 0, every counted bid fills, and the remainder stays with the team. With no counted bids, nothing is sold.
2. Bids **above** the clearing step fill in full.
3. Bids **at** the clearing step share the remaining supply in proportion to quantity, using floor division. Leftover units go one at a time to earlier slots, in repeated passes.
4. Bids **below** the clearing step get nothing.

A winner pays `clearingPrice × allocation`, never more than their own price × quantity, and never more than the deposit.

**Worked example** (also in `packages/auction-core` and `docs/auction-rules.md`): supply 1,000, `minPrice` 50, `stepSize` 10.

| Bidder | Price | Quantity | Allocation |
| --- | ---: | ---: | ---: |
| A | 100 | 400 | 400 |
| B | 80 | 300 | 300 |
| C | 60 | 500 | 300 |
| D | 50 | 400 | 0 |

Clearing price **60**. Total sold 1,000. Proceeds `60 × 1000`. Slot index is commit order, so this assumes A commits first.

---

## What is hidden and what is public

| Information | During bidding | After that bidder reveals | After settlement |
| --- | --- | --- | --- |
| Bidder wallet address | Public | Public | Public |
| Time of bid | Public | Public | Public |
| Deposit (same for everyone) | Public | Public | Public |
| Price and quantity | **Hidden** | Public | Public |
| Allocation and payment | – | – | Public |

Bids are **sealed (hashed), not encrypted**. Confidentiality lasts for the auction, which is when it prevents front-running and copying. It is not permanent. See [`docs/Blindlaunch-OnChain-and-Bid-Visibility.md`](docs/Blindlaunch-OnChain-and-Bid-Visibility.md).

---

## Deployed contracts

All three contracts are verified on Sourcify with **`exact_match`** (solc `0.8.28`, Cancun, optimizer 200 runs), so explorers show the readable source.

| Contract | Address |
| --- | --- |
| BlindAuction | `0xacC12B4bdae66Ef42939340Fa1811BD629F18cC2` |
| SALE (`TestERC20`, "Blindlaunch Sale") | `0x803cbeb14E07249E6DbE64a76751AbF253925ab5` |
| QUOTE (`TestERC20`, "Blindlaunch Quote") | `0x19655Bdde974d7410e8AFaf5FA0158e558043105` |

Check verification: `https://sourcify-api-monad.blockvision.org/v2/contract/10143/<address>`.

The test tokens have 0 decimals and **public mint**, so amounts match the integer examples and testers can fund themselves. The web app mints them automatically when needed. Never use them as real assets.

Deploy transaction for BlindAuction: `0xc5d4c2674abc3c1085560cc502bb6d44c3f8b4fd1259ad4785e000b7684ff922`.

---

## Web app

Source: `apps/web` (Vite 7, React 19, react-router-dom 7, Tailwind CSS 4, viem 2). It reads the chain through the public RPC and writes through MetaMask. There is no backend and no database. It never asks for a private key.

### Pages

| Route | Screen | What it does |
| --- | --- | --- |
| `/` | `Home.tsx` | Hero with animated vault, feature cards, auction list (All / Open / Closed), interactive clearing simulator, bot race demo, privacy and trust, steps, Built on Monad, teams call to action, FAQ, risk notice |
| `/how` | `HowItWorks.tsx` | Steps, simulator, bot race demo, comparison table, privacy and trust, costs, FAQ, risks |
| `/auction/:id` | `BidPage.tsx` | Sticky live status bar, countdown, reminder, seal / reveal / settle / cancel / refund card, recovery reveal, public commitments, live demand chart, rules, costs, verify on chain |
| `/auction/:id/sealed` | `BidSealed.tsx` | Confirmation, commitment hash, phase tracker, **recovery code with copy and download** |
| `/auction/:id/result` | `Result.tsx` | Clearing price, chart, your tokens / payment / refund, allocation table, claim, authority reclaim |
| `/bids` | `MyBids.tsx` | Every bid of the connected wallet across auctions, status, one-click reveal / claim / refund, transaction links |
| `/team` | `TeamDashboard.tsx` | Auctions created by the connected wallet: raised, bidders, price, sold, collect proceeds |
| `/create` | `CreateAuction.tsx` | Create form with live preview, price ladder, quick close times and deadline timeline |
| `/docs` | `Docs.tsx` | Integration guide: addresses, commitment formula, viem snippets, call order, events |

### Features

- **Navbar.** Sticky with a blurred background after scroll. Centred three-column layout on desktop, a menu from 1024 px down, Escape and route change close the menu. The wallet button shows address and MON balance.
- **Automatic setup.** Connecting asks MetaMask to add and switch to Monad Testnet. Test tokens are minted and approved (exact amount, never unlimited) inside the seal and create flows.
- **Recoverable bids.** The salt is built from a free wallet signature plus a random recovery code. See [Bid secrets and recovery](#bid-secrets-and-recovery).
- **64 bid slots** for new auctions (the contract maximum), so a few wallets cannot fill an auction to block others. Auctions created earlier keep 8.
- **Bid guards.** Before sealing, the form blocks what the contract would reject or not count: the creator bidding, a full auction, a second bid, quantity 0, price × quantity above `min(deposit, maxNotional)`, an invalid custom salt, and the last 15 seconds before close.
- **Short errors.** Wallet rejections show "User rejected the request." instead of raw RPC output. Status and errors appear as toasts.
- **Live status bar.** Bidding open, Revealing, Settling, Settled or Cancelled, with stall and refund messages.
- **Reminders.** Browser notifications when an auction you follow closes.
- **Verify on chain.** Explorer links for the contract, tokens and your own seal and reveal transactions.
- **Simulator and bot demo.** `src/clearing.ts` is a browser copy of `UniformClearing.sol`, including multi-pass dust. The bot race uses made-up buyers and says so.
- **Responsive and accessible.** Checked at 375, 900 and 1280 px with no horizontal scroll. `prefers-reduced-motion` respected. Focus states and ARIA labels throughout.
- **Design.** Background `#0D0C3A`, glass cards, amber `#FFC53D`, lavender `#8F8CF0`, teal `#5EEAD4`, Space Grotesk and JetBrains Mono.

### Shared code

| File | Role |
| --- | --- |
| `src/auction.tsx` | Chain state and actions (`commit`, `reveal`, `actOn`, `createAuction`), stored bids, `loadMyBids`, `friendlyError` |
| `src/wallet.ts` | MetaMask, network switch, `hashBid`, `saltMessage`, `deriveSalt`, `combineSalt`, mint and exact approve |
| `src/clearing.ts` | Clearing rule for the simulator, demo and charts |
| `src/components/ui.tsx` | Navbar, chart, countdown, toast, footer, shared UI |
| `src/components/sections.tsx` | Simulator, steps, comparison, FAQ, Monad section, timeline |
| `src/components/trust.tsx` | Bot race, privacy and trust, risks, costs, verify panel, status bar, reminders, rules |

### Browser storage

| Key | Holds |
| --- | --- |
| `blindlaunch:bid:<auctionId>:<account>` | Price step, quantity, salt, recovery code, seal and reveal transaction hashes |
| `blindlaunch:salt:<auctionId>:<account>` | Legacy salt, still read as a fallback |
| `blindlaunch:meta:<auctionId>` | Name and description typed at creation (the contract stores no text, so only the creating browser shows it) |
| `blindlaunch:reminders` | Close reminders |

---

## Bid secrets and recovery

Unless the user types a custom salt, the web app builds it from two factors:

```text
salt = keccak256( keccak256(signature over saltMessage) ‖ recoveryCode )
```

- **Signature.** `personal_sign` over a fixed per-auction message (auction id, contract, chain), free and with no transaction. EOA signatures are deterministic, so the same wallet produces the same value on any device.
- **Recovery code.** 32 random bytes, saved in the bid record and shown once on the sealed page with **Copy** and **Download as a text file**.

**Why two factors.** The price and quantity space is small (6 steps × about 20,000 quantities). A signature alone, for example phished by a site asking for the same message, would let anyone brute-force a bid in seconds. With the code mixed in, a phished signature reveals nothing, and the code is useless without the wallet. A simulated attack trying all 120,000 combinations with only the signature failed. The message tells users never to sign it on another site.

**Revealing.**
- Same browser: one click, using the stored bid.
- Another browser: connect the same wallet, enter the token amount and recovery code, and sign. The app tries every price step against the on-chain commitment and reveals the match. A wrong amount or code fails before any transaction.
- Bids sealed with a custom salt need the browser that sealed them. Smart-contract wallets may not sign deterministically.

---

## Architecture

```text
packages/auction-core          integer clearing reference (TypeScript)
        │
        ▼
contracts/src/UniformClearing.sol
        │
        ▼
contracts/src/BlindAuction.sol     custody, commit, reveal, settle, claim, cancel
        │
        ▼
Monad Testnet (chain id 10143)
        ▲
        │  public RPC (reads)  ·  MetaMask (signed writes)
apps/web                       React interface, no backend
```

Nothing outside the contract decides the clearing price. The web app only sends transactions and draws previews.

---

## Repository

```text
BlindLaunch/
├── README.md
├── SETUP.md                       local setup from a fresh clone
├── docs/
│   ├── auction-rules.md           integer rules and the worked example
│   ├── toolchain.md
│   ├── Blindlaunch-Project-Document.md / .docx
│   ├── Blindlaunch-Design-Note-OnChain-Privacy-Randomness.md / .docx
│   └── Blindlaunch-OnChain-and-Bid-Visibility.md / .docx
├── packages/auction-core/         TypeScript clearing reference and tests
├── apps/web/                      web app (Vite + React + Tailwind), vercel.json
└── contracts/
    ├── foundry.toml               solc 0.8.28, cancun, optimizer 200
    ├── src/BlindAuction.sol       auction and escrow
    ├── src/UniformClearing.sol    on-chain clearing
    ├── src/TestERC20.sol          public-mint testnet token, 0 decimals
    ├── src/IERC20Minimal.sol
    ├── script/Deploy.s.sol        deploy the auction
    ├── script/Demo.s.sol          deploy demo tokens and open one auction
    └── test/BlindAuction.t.sol    16 tests
```

Never commit `.env`, `contracts/broadcast/`, `contracts/cache/` or `contracts/lib/`.

---

## Quick start

Full walkthrough, including MetaMask, faucet and troubleshooting: **[SETUP.md](SETUP.md)**.

Requirements: Node 22 or newer, pnpm 10, MetaMask. Foundry only for contract work.

```bash
pnpm install
pnpm dev                                          # http://localhost:5173
pnpm --filter @blindlaunch/web exec tsc --noEmit  # type check
pnpm --filter @blindlaunch/web build              # production build
```

The web app needs no `.env`. Contract addresses are in `apps/web/src/config.ts`. If styles look broken, restart `pnpm dev`.

Contracts and the reference package:

```bash
cd contracts
git clone --depth 1 --branch v1.17.0 https://github.com/foundry-rs/forge-std lib/forge-std
forge test                                        # 16 passed
cd ..
pnpm --filter @blindlaunch/auction-core test
```

---

## Contract reference

`BlindAuction` is Solidity `0.8.28` for the Cancun EVM. Sale and quote assets must be different ERC-20s. Every transfer is checked against the balance change, so fee-on-transfer tokens are rejected. Every state-changing function is `nonReentrant`. There are no admin keys and no upgrade proxy.

| Limit | Value |
| --- | --- |
| `MAX_STEPS` | 64 |
| `MAX_SLOTS` | 64 |
| `minPrice`, `stepSize`, `supply`, `deposit`, `maxNotional` | greater than 0 |
| Deadlines | `now < commitDeadline < revealDeadline < cancelAfter` |

Parameters used by the web app's create form: `stepSize` 10, `stepCount` 6, `maxNotional = deposit`, `maxSlots` 64, reveal 15 minutes and cancel 30 minutes after close.

Commitment, matching `abi.encode`:

```solidity
keccak256(abi.encode(auctionId, bidder, priceStep, quantity, salt))
```

In viem:

```ts
import { encodeAbiParameters, keccak256 } from "viem";

keccak256(
  encodeAbiParameters(
    [{ type: "uint256" }, { type: "address" }, { type: "uint32" }, { type: "uint256" }, { type: "bytes32" }],
    [auctionId, bidder, priceStep, quantity, salt],
  ),
);
```

| Call | Who | When |
| --- | --- | --- |
| `createAuction` | authority | commit deadline in the future |
| `commit` | bidder | before `commitDeadline` |
| `reveal` | that bidder | `commitDeadline` to `revealDeadline` |
| `settle` | anyone | `revealDeadline` to `cancelAfter` |
| `cancel` | anyone | at or after `cancelAfter`, if still open |
| `claim` | bidder | after settle or cancel |
| `reclaim` | authority | after settle or cancel |

Views: `getAuction`, `getBid`, `claimable`, `quotePrice`, `bidderSlot` (slot + 1, 0 if none), `hashBid`, `nextAuctionId`.

Status moves from `Open` to `Settled` or `Cancelled`. `clearingPrice` is quote base units per sale base unit, `0` when nothing is sold.

---

## Deploy and verify

Fund a testnet wallet from the [faucet](https://faucet.monad.xyz). Keep the key in `.env` or your shell only.

```bash
cd contracts
set -a && source ../.env && set +a
forge script script/Demo.s.sol:Demo --rpc-url "$MONAD_RPC_URL" --chain 10143 --broadcast
```

The demo script deploys SALE and QUOTE, deploys BlindAuction and opens a reference auction. `script/Deploy.s.sol` deploys only the auction. Put the new addresses in `apps/web/src/config.ts`.

Verify on Sourcify (no API key), from `contracts/`:

```bash
forge verify-contract <AUCTION_ADDRESS> src/BlindAuction.sol:BlindAuction \
  --chain 10143 --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org/
forge verify-contract <TOKEN_ADDRESS> src/TestERC20.sol:TestERC20 \
  --chain 10143 --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org/ \
  --constructor-args $(cast abi-encode "constructor(string,string)" "Blindlaunch Sale" "SALE")
```

Repeat the token command with `"Blindlaunch Quote" "QUOTE"`. Each should end with `Status: exact_match`.

---

## Hosting

The app is deployed on **Vercel** from `master`: [blind-launch-one.vercel.app](https://blind-launch-one.vercel.app).

| Setting | Value |
| --- | --- |
| Root directory | `apps/web` |
| Framework preset | Vite |
| Build command | `pnpm build` |
| Output directory | `dist` |
| Node | 22 |

`apps/web/vercel.json` rewrites every path to `index.html`, so routes like `/auction/6` survive a refresh.

MetaMask may show a phishing warning on new shared `*.vercel.app` domains. This is a false flag on the domain. The app only requests exact-amount approvals and one plain-text signature. Report it at [eth-phishing-detect](https://github.com/MetaMask/eth-phishing-detect/issues/new) and [Blockaid](https://report.blockaid.io), or add a custom domain.

---

## Documentation

| Document | Contents |
| --- | --- |
| [SETUP.md](SETUP.md) | Local setup, MetaMask, faucet, usage, contracts, deploy, verify, troubleshooting |
| [Project Document](docs/Blindlaunch-Project-Document.md) | Formal specification: problem, mechanism, architecture, web app, security, limitations, roadmap, worked example, glossary |
| [On-Chain Operation and Bid Visibility](docs/Blindlaunch-OnChain-and-Bid-Visibility.md) | Formal note: what is on chain, escrow, RPC, evidence, verification, who can see which bid data and when |
| [Design Note: On-Chain, Privacy, Randomness](docs/Blindlaunch-Design-Note-OnChain-Privacy-Randomness.md) | Origin of auctions, visibility, randomness, off-chain options and recommendation |
| [auction-rules.md](docs/auction-rules.md) | Integer clearing rules and worked example |

Each formal document also has a `.docx` copy.

---

## Security model and limitations

**Protections:** commitments bound to auction and bidder, uniform deposits, exact balance checks, reentrancy guards, exact-amount approvals, permissionless cancel and refunds, no admin keys, verified source.

**Known limitations:**

- **Temporary privacy.** Revealed bids are public, including before `settle`. Addresses, bid times and deposits are always public. Bids are hashed, not encrypted.
- **Selective non-reveal.** A late revealer can see earlier reveals and choose not to reveal. Unrevealed deposits are fully refunded, so this is a free option today.
- **Shill bidding.** The authority cannot bid from its own wallet but could bid from another wallet to raise the clearing price. The public minimum price is the honest protection. Fees, locked proceeds or an authority bond would raise the cost.
- **Demand reduction.** In uniform-price auctions, large buyers have an incentive to understate demand. "Bidding high costs nothing" holds for small bidders, not whales.
- **Fixed deposit.** It hides size but caps bids at the deposit, nudging large buyers toward several wallets.
- **Coarse ladder.** The create form uses 6 steps of 10. The contract allows up to 64 steps.
- **Liveness.** Bidders must reveal within 15 minutes and someone must settle within the next 15. There is no keeper.
- **Recovery needs the code.** Revealing from another browser needs the wallet, recovery code and token amount.
- **Scope.** Testnet and test tokens only. The create form always uses the SALE token. Auction names live only in the creator's browser. No trading pool after settlement. Not audited.

---

## Roadmap

| Area | Next step |
| --- | --- |
| Mechanism | Partial forfeit of unrevealed deposits, settle bounty, deposit tiers, configurable ladder and windows |
| Anti-shill | Fee on proceeds, vesting of proceeds, authority bond |
| Privacy | Threshold or encrypted bids with no reveal step (for example Arcium) |
| Randomness | Pyth Entropy for a random close or fair tie-break |
| Product | Any ERC-20 or a token factory, Uniswap v4 pool at the clearing price, on-chain metadata, Envio indexer |
| Assurance | Foundry invariant tests (solvency, supply conservation), external audit, then mainnet |

---

## Handoff status

Read this before continuing the build. Update it when a step finishes. Never put keys, seed phrases or `.env` contents here.

Deadline: **13 Oct 2026, 11:59 PM ET**. Default branch: `master`. Working branch: `ui-changes`, merged through pull requests [#6](https://github.com/64xengineers/BlindLaunch/pull/6), [#7](https://github.com/64xengineers/BlindLaunch/pull/7) and [#8](https://github.com/64xengineers/BlindLaunch/pull/8). Commits must not carry a Cursor co-author trailer.

| Step | Status |
| --- | --- |
| Contracts compile, 16 tests pass | Done (10 Oct) |
| Deploy to Monad testnet | Done (10 Oct) |
| Auction run and cancel refund on chain | Done (10 Oct), auctions 1 and 2 |
| Web app with all pages | Done, merged to `master` |
| Navbar rebuild, sticky header | Done, merged |
| Source verification on Sourcify | Done (13 Oct), exact match ×3 |
| Recoverable two-factor salt, 64 slots, sealed wording | Done, merged |
| Formal documents in `docs/` | Done, merged |
| Vercel deployment | Live from `master` |
| Live end-to-end test after latest merge | To do |
| Demo video | To do |
| Submit at [hackathon.monad.xyz](https://hackathon.monad.xyz/) | To do, needs the user's account |

### On-chain record

Wallets created for the first runs (keys only in `.env`):

| Role | Address |
| --- | --- |
| Authority | `0x7622D42d449f23b7cfBf90CB403919274b58cDeB` |
| Bidder | `0x9b039E0cCC184704348FBB0C4aC7eb2D9b45FaCD` |

Auction 1: one bid, step 5, quantity 400, salt `keccak256("blindlaunch-bidder-1")`. Demand 400 against supply 1,000, so it cleared at the minimum price **50**. Allocation 400, payment `20000`, refund `980000`, unsold 600.

| Action | Transaction |
| --- | --- |
| Create auction 1 | `0x1994fad07b50fc9544224c95fc2e7fe0b6a8cea0833d0ea5ef22b9f5e6b48fe9` |
| Commit auction 1 | `0x6ad093d407999e54a7271dcf6281f83994403087ee91143fcae8367732e52fbe` |
| Reveal auction 1 | `0x6b91edccf7c548740c43f47a1721ce731da24ca3dc5baccba42916c8c1645c16` |
| Settle auction 1 | `0xf26ea9ddc38657d8b66b6444742c11f6a52641efc46255ddb21d807304c2c949` |
| Claim auction 1 | `0x574094ebe7bf4b3a214bbb9938b272a6cb52aa4d12995541a7617c106107738f` |
| Reclaim auction 1 | `0xb7a533f0d67d055acbe79bdec18717bcbf100f98694b88e215f9c172b8f3d680` |

Auction 2: supply 100, one commit, never settled. After `cancelAfter`, cancel returned the full `1_000_000` deposit and all 100 sale tokens.

| Action | Transaction |
| --- | --- |
| Create auction 2 | `0x5f752037ab72900b4e7713c28903316ea21b731def3ee057168f4267486622ba` |
| Commit auction 2 | `0xdded3ccda2c5523c8bfcc0f8649bde3a1f806b271a646c28dfa9fe7629b86c30` |
| Cancel auction 2 | `0xca92761f926eaafbab43fc16e751534b032e5df3177de05da73d1ff8ecfa1888` |
| Claim auction 2 | `0x1d2533971dfb6366aa00ffb3c179528c13445309dfa0a171f502166d3a26045a` |
| Reclaim auction 2 | `0x0ae2f606cdb688d50858c349d517ab804e95f9c044d6a1451e28335dea494b1c` |

Auctions 3 to 6 were created from the web app during testing. Auction 6 was created by one wallet, bid on by another, and settled.

### Demo plan

1. Problem: the bot race demo.
2. Idea: the clearing simulator, one price for everyone.
3. Live: create an auction, seal from two wallets (show the hash and recovery code), reveal, settle, result page, claim.
4. Trust: verified contract and transaction links on the explorer.
5. Roadmap: forfeit, settle bounty, encrypted bids, trading pool.

---

## References

- [Monad Metropolis](https://monad.xyz/developers/hackathons/metropolis)
- [Monad testnet docs](https://docs.monad.xyz/developer-essentials/testnets)
- [Monad faucet](https://faucet.monad.xyz)
- [MonadVision explorer](https://testnet.monadexplorer.com) · [Monadscan](https://testnet.monadscan.com)
- [Sourcify on Monad](https://docs.monad.xyz/guides/verify-smart-contract/foundry)
- [Foundry](https://getfoundry.sh) · [viem](https://viem.sh)
