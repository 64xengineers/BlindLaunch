# Blindlaunch

**Uniform-price token launches on Monad.**

Blindlaunch is a sealed-bid token launch for the [Metropolis](https://monad.xyz/developers/hackathons/metropolis) hackathon. A team escrows a fixed token supply. During a commit window, bidders escrow a fixed quote-token deposit and submit a hash of their price and quantity. After that window they reveal. The contract computes one clearing price, winners pay that price, and unused deposits are refunded. If the auction is not settled before the timeout, bidders take their deposits back and the team takes the unsold tokens back.

> **Hackathon status:** The settlement contract is `contracts/src/BlindAuction.sol`. Use [Monad testnet](https://docs.monad.xyz/developer-essentials/testnets) (chain id `10143`) and test tokens only. This is not an audited financial product. Do not deploy it to mainnet or fund it with real assets.

The commit hash hides price and quantity until that bidder reveals. Wallet addresses, deposits, revealed bids, the clearing price, and token transfers are public. Submit this build to the **Onchain Finance & Trading** track.

## Contents

- [What we are building](#what-we-are-building)
- [How the auction works](#how-the-auction-works)
- [Architecture](#architecture)
- [Monad testnet](#monad-testnet)
- [Repository](#repository)
- [Quick start](#quick-start)
- [Contract](#contract)
- [Pricing rules](#pricing-rules)
- [Demo](#demo)
- [Deploy](#deploy)
- [Limitations](#limitations)

## What we are building

A project creates an auction with a fixed supply, a minimum price, a discrete price grid, a cap on bidder slots, a fixed deposit, and three deadlines: commit, reveal, and cancel. Every accepted bidder uses that same window. After reveals, the contract picks the highest grid step whose demand covers the supply and fills bids at that one price.

### Goals

1. Give every accepted bidder the same window and the same clearing price.
2. Hide price and quantity behind a commitment until the bidder reveals.
3. Clear with the same integer rule as `packages/auction-core`.
4. Keep custody and payouts in one Monad contract.
5. Refund deposits and return unsold tokens if nobody settles before the timeout.

### Out of scope for this version

- Mainnet, or custody of valuable assets.
- More than 64 price steps or 64 bidder slots.
- A claim that launch bots are prevented.
- Hiding wallet addresses, deposits, reveals, transfers, or the clearing price.
- A web app. The hackathon surface is the contract, the reference math, and a testnet demo.

## How the auction works

1. **Create.** The authority calls `createAuction` and the contract pulls the sale supply from that wallet.
2. **Commit.** Before `commitDeadline`, a bidder approves the fixed quote deposit and calls `commit` with `hashBid(...)`. The slot index is the commit order, starting at 0. One bid per wallet. The authority cannot bid.
3. **Reveal.** From `commitDeadline` until `revealDeadline`, the bidder calls `reveal` with the price step, quantity, and salt. A matching reveal is stored. A reveal that fails the grid, deposit, or max-notional check is stored and ignored during clearing. A wrong salt does not consume the commit, so the bidder can reveal again.
4. **Settle.** From `revealDeadline` until `cancelAfter`, anyone may call `settle`. The contract writes the clearing price, clearing step, and per-bid allocation.
5. **Claim.** Each bidder calls `claim` and receives their sale tokens plus the unused quote deposit. The authority calls `reclaim` and receives unsold sale tokens plus sale proceeds.
6. **Cancel.** At or after `cancelAfter`, if the auction is still open, anyone may call `cancel`. Bidders then claim their full deposit. The authority reclaims the full supply. No sale proceeds are paid.

A bidder who never reveals is not filled and can still claim the full deposit after settlement or cancellation. Gas is paid in MON and is not taken from the deposit.

## Architecture

```text
packages/auction-core          integer clearing reference (TypeScript)
        │
        ▼
contracts/src/UniformClearing.sol
        │
        ▼
contracts/src/BlindAuction.sol     custody, commit, reveal, settle, refund
        │
        ▼
Monad testnet (chain id 10143)
```

The browser is not part of this build. Nothing outside the contract is allowed to decide the clearing price. `TestERC20` is a public-mint demo token with 0 decimals so amounts match the integer examples. Do not use it as a real asset.

## Monad testnet

| | |
| --- | --- |
| Network | Monad Testnet |
| Chain id | `10143` |
| RPC | `https://testnet-rpc.monad.xyz` |
| Explorer | [testnet.monadscan.com](https://testnet.monadscan.com) |
| Faucet | [faucet.monad.xyz](https://faucet.monad.xyz) |
| Gas token | MON |

Config for Foundry is in `contracts/foundry.toml` under the endpoint name `monad_testnet`.

## Repository

```text
blindlaunch/
├── README.md
├── docs/auction-rules.md          integer rules and the worked example
├── packages/auction-core/         TypeScript clearing reference and tests
└── contracts/
    ├── foundry.toml
    ├── src/BlindAuction.sol       Monad auction
    ├── src/UniformClearing.sol    on-chain clearing
    ├── src/TestERC20.sol          testnet demo token
    ├── src/IERC20Minimal.sol
    ├── script/Deploy.s.sol        deploy the auction
    ├── script/Demo.s.sol          deploy demo tokens and open one auction
    └── test/BlindAuction.t.sol
```

## Quick start

Install [Foundry](https://getfoundry.sh), then run the contract tests:

```bash
cd contracts
forge install foundry-rs/forge-std
forge test
```

The TypeScript reference uses the same clearing cases:

```bash
pnpm install
pnpm --filter @blindlaunch/auction-core test
```

`contracts/lib/` is gitignored. `forge install` is required on a fresh checkout.

## Contract

`BlindAuction` is Solidity `0.8.28`, compiled for the Cancun EVM. Sale and quote assets are ERC-20s, and they must be different tokens. The contract rejects fee-on-transfer tokens because it checks that balances move by the exact amount.

| Limit | Value |
| --- | --- |
| `MAX_STEPS` | 64 |
| `MAX_SLOTS` | 64 |
| `minPrice`, `stepSize`, `supply`, `deposit`, `maxNotional` | must be greater than 0 |
| Deadlines | `commitDeadline < revealDeadline < cancelAfter`, and commit must be in the future |

Commitment, matching `abi.encode`:

```solidity
keccak256(abi.encode(auctionId, bidder, priceStep, quantity, salt))
```

`hashBid` on the contract computes that digest. In viem:

```ts
import { encodeAbiParameters, keccak256 } from "viem";

keccak256(
  encodeAbiParameters(
    [
      { type: "uint256" },
      { type: "address" },
      { type: "uint32" },
      { type: "uint256" },
      { type: "bytes32" },
    ],
    [auctionId, bidder, priceStep, quantity, salt],
  ),
);
```

Status moves from `Open` to `Settled` or `Cancelled`. There is no separate computing state. `clearingPrice` is quote base units per sale base unit. It is `0` when nothing is sold.

| Call | Who | When |
| --- | --- | --- |
| `createAuction` | authority | once, while the commit deadline is still ahead |
| `commit` | bidder | before `commitDeadline` |
| `reveal` | that bidder | from `commitDeadline` until `revealDeadline` |
| `settle` | anyone | from `revealDeadline` until `cancelAfter` |
| `cancel` | anyone | at or after `cancelAfter`, if still open |
| `claim` | bidder | after settle or cancel |
| `reclaim` | authority | after settle or cancel |

Views: `getAuction`, `getBid`, `claimable`, `quotePrice`, `bidderSlot`.

## Pricing rules

Prices and amounts are integers. The price at a step is `minPrice + step * stepSize`. Demand at a step is the sum of counted bid quantities at that step or higher. The clearing step is the highest step whose demand covers the supply. If even the minimum step is undersubscribed, the auction still clears at step 0, every counted bid is filled, and the remainder stays with the team. If no bid is counted, nothing is sold.

At the clearing step:

1. Bids above it are filled in full.
2. Bids at it share the remaining supply in proportion to quantity, capped at the quantity they asked for.
3. Bids below it get nothing.
4. Shares use floor division. Leftover units go one at a time to earlier slots.

A winner pays `clearingPrice * allocation`, which is never more than that bidder's own price times quantity, and never more than the deposit. The rest of the deposit is refunded.

The worked example, also covered by `packages/auction-core` and `docs/auction-rules.md`: supply 1,000, `minPrice` 50, `stepSize` 10.

| Bidder | Price | Quantity | Allocation |
| --- | ---: | ---: | ---: |
| A | 100 | 400 | 400 |
| B | 80 | 300 | 300 |
| C | 60 | 500 | 300 |
| D | 50 | 400 | 0 |

Clearing price 60. Total sold 1,000. Proceeds `60 * 1000`. On Monad, slot index is commit order, so this table assumes A commits first and D commits last.

## Demo

Use two runs on Monad testnet.

**Conventional launch.** Show, in a clearly labelled simulation, that a first-come allocation can give an early buyer a large share. Do not present that simulation as a live market.

**Blindlaunch.**

1. Get testnet MON from the faucet.
2. Run the demo script below. It deploys 0-decimal `SALE` and `QUOTE` tokens and opens the reference auction: supply 1,000, prices 50 through 100, deposit `1_000_000`, eight slots, deadlines one hour apart.
3. From separate wallets, mint quote tokens (`TestERC20.mint` is public), approve the deposit, and commit.
4. Show the commit transactions on [Monadscan](https://testnet.monadscan.com): the deposit is visible and the price is only a hash.
5. Reveal, then `settle`.
6. `claim` and `reclaim`, and show that winners paid the same clearing price.
7. In a second auction, skip `settle` until `cancelAfter`, call `cancel`, and show full deposit refunds.

Suggested pitch: launches reward speed and leak bids; Blindlaunch uses one commit window and one clearing price; the proof is the testnet transactions; the timeout returns every deposit.

## Deploy

Fund a testnet wallet from the faucet. Put its key only in your shell, never in the repo:

```bash
export MONAD_PRIVATE_KEY=0x...
cd contracts
forge script script/Deploy.s.sol:Deploy \
  --rpc-url monad_testnet \
  --chain 10143 \
  --broadcast
```

To deploy the demo tokens and open the reference auction in one step:

```bash
forge script script/Demo.s.sol:Demo \
  --rpc-url monad_testnet \
  --chain 10143 \
  --broadcast
```

The demo script logs the auction address, token addresses, auction id, and authority. `MONAD_PRIVATE_KEY` must be set. `TestERC20.mint` is open so other demo wallets can fund themselves.

## Limitations

- Revealed bids are public. Anyone can read price and quantity after `reveal`, including before `settle`.
- A bidder who wants a fill must reveal. There is no private computation that opens the bid for them.
- Slot order is commit order. Dust at the clearing price prefers earlier commits.
- The contract caps the book at 64 bids and 64 price steps so `settle` stays bounded.
- `TestERC20` can be minted by anyone and uses 0 decimals. It exists so the reference numbers appear as whole units.
- No deployment address is checked in. Record the address from the broadcast log after you deploy.
- The contract has not been audited.

## References

- [Metropolis](https://monad.xyz/developers/hackathons/metropolis)
- [Monad testnet](https://docs.monad.xyz/developer-essentials/testnets)
- [Monad faucet](https://faucet.monad.xyz)
- [Monadscan testnet](https://testnet.monadscan.com)
- [Foundry](https://getfoundry.sh)
