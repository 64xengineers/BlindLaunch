# Blindlaunch

**Private, uniform-price token launches on Solana.**

Blindlaunch is a sealed-bid token launch prototype designed to reduce
the advantage of bots and first-come-first-served trading. Participants
submit encrypted bids during a fixed window. After bidding closes, a
private computation determines one clearing price and each bidder's
allocation. Winners pay the same clearing price; unused deposits are
refunded. If computation fails or times out, participants can recover
their deposits and the team can reclaim unsold tokens.

> **Hackathon / prototype status:** This repository is a build plan and
> implementation target, not an audited financial product. Start on
> Solana devnet with test tokens only. Do not use real funds or mainnet
> until the program, circuit, settlement flow, and integrations have
> been independently reviewed. Arcium and Meteora APIs change; verify
> the current official docs and example versions before implementation

## Contents

-   [What we are building](#what-we-are-building)
-   [Product goals and non-goals](#product-goals-and-non-goals)
-   [How the auction works](#how-the-auction-works)
-   [Architecture](#architecture)
-   [Technology stack](#technology-stack)
-   [Repository structure](#repository-structure)
-   [Prerequisites](#prerequisites)
-   [Quick start](#quick-start)
-   [Implementation roadmap](#implementation-roadmap)
-   [Auction and pricing rules](#auction-and-pricing-rules)
-   [On-chain program design](#on-chain-program-design)
-   [Arcium privacy circuit](#arcium-privacy-circuit)
-   [Web application requirements](#web-application-requirements)
-   [Keeper / automation](#keeper--automation)
-   [Meteora liquidity pool
    integration](#meteora-liquidity-pool-integration)
-   [Security, privacy, and failure
    handling](#security-privacy-and-failure-handling)
-   [Testing and acceptance criteria](#testing-and-acceptance-criteria)
-   [Hackathon demo plan](#hackathon-demo-plan)
-   [Environment variables](#environment-variables)
-   [Troubleshooting](#troubleshooting)
-   [Official references](#official-references)
-   [Limitations and honest claims](#limitations-and-honest-claims)

## What we are building

A token team creates an auction with a fixed supply, a minimum
acceptable price, a discrete price grid, a fixed maximum number of
bidder slots, a fixed deposit per bidder, and a deadline. Participants
submit their desired price and quantity privately. After the deadline,
the protocol computes a uniform clearing price and allocations.

The core product promise is **price discovery without publicly revealing
losing bids**. The protocol aims to make transaction ordering less
important during the sale; it does not eliminate every form of bot
activity or guarantee that the token's post-launch market price remains
stable.

### Product goals

1.  Give every accepted bidder the same bidding window and rules.
2.  Keep bid values encrypted while the auction is open and during
    private computation.
3.  Compute one deterministic clearing price and bounded allocations.
4.  Keep custody and payouts in a small, auditable Solana program.
5.  Make the failure path first-class: if private computation does not
    complete before a configured timeout, allow refunds.
6.  Provide a simple UI that clearly shows auction status, transaction
    progress, and final results.
7.  Demonstrate the difference between a conventional launch and a
    sealed-bid launch.

### Non-goals for the first hackathon version

-   Mainnet deployment or production custody of valuable assets.
-   A general-purpose auction engine with unlimited bidders.
-   Claiming that all launch bots are prevented.
-   Hiding public blockchain facts such as wallet addresses, deposits,
    token transfers, or final allocations.
-   Building a complex admin dashboard before the end-to-end auction
    works.

## How the auction works

1.  **Create:** the project authority creates an auction, deposits the
    sale tokens into a program-controlled token vault, and sets
    immutable or carefully validated parameters.
2.  **Bid:** a bidder connects a Solana wallet, enters a price step and
    quantity, encrypts the bid in the browser using the supported Arcium
    client flow, and submits the ciphertext plus the fixed deposit.
3.  **Close:** after the deadline, anyone can call the close
    instruction. The auction moves from `Open` to `Computing`, and the
    program queues the Arcium computation.
4.  **Compute:** the Arcium circuit evaluates the fixed-size encrypted
    bid list and produces the clearing price, total sold, and per-bidder
    allocations required for settlement.
5.  **Settle:** the program validates the result, transfers tokens to
    winners, refunds unused deposits, and pays the team the sale
    proceeds according to the protocol rules.
6.  **Open trading:** when the integration is ready, create the
    configured Meteora pool at the auction clearing price.
7.  **Refund on timeout:** if a valid result is not received by the
    timeout, move to `Cancelled`; each bidder can reclaim their deposit,
    and the authority can reclaim the sale tokens under the cancellation
    rules.

**Public versus private:** wallet addresses, transactions, deposits,
ciphertexts, final clearing price, total sold, and token transfers may
be publicly observable. Losing bid values should not be revealed. Winner
allocations become inferable from public token transfers. Never describe
the entire auction as anonymous.

## Architecture

``` text
┌──────────────────────────────┐
│ React / Next.js web app      │
│ Wallet connection            │
│ Bid validation + encryption  │
│ Auction status + results     │
└──────────────┬───────────────┘
               │ Solana transactions
               ▼
┌──────────────────────────────┐
│ Solana program (Anchor)      │
│ Auction + bid accounts       │
│ Token / USDC vaults          │
│ State machine + settlement   │
│ Timeout refunds              │
└──────────────┬───────────────┘
               │ queue / result callback
               ▼
┌──────────────────────────────┐
│ Arcium MPC / Arcis circuit   │
│ Encrypted fixed-size bids    │
│ Clearing price + allocations │
└──────────────────────────────┘

Optional post-settlement integration:
Solana program / integration service → Meteora DAMM v2 pool

Permissionless automation:
Keeper script → close eligible auctions / trigger permitted settlement actions
```

### Trust boundaries

-   **Browser:** validates input and encrypts bids, but must not be
    trusted to determine the auction outcome.
-   **Solana program:** enforces deposits, deadlines, state transitions,
    result validation, and payouts.
-   **Arcium:** performs the private computation under the security
    assumptions of its network and cryptographic implementation.
-   **Keeper:** is a convenience, not a trusted authority. Any eligible
    user should be able to trigger permissionless close/settle actions.
-   **Meteora:** is a separate trading venue integration. Pool creation
    should not be allowed to bypass auction settlement rules.

## Technology stack

Use a single, compatible version set. Do not blindly combine the newest
packages with an older Arcium example.

  -----------------------------------------------------------------------
  Layer                   Recommended technology  Responsibility
  ----------------------- ----------------------- -----------------------
  Frontend                Next.js or React +      Auction pages, wallet
                          TypeScript              connection, bid UX

  Wallet                  Solana Wallet Adapter / Connect and sign
                          supported               transactions
                          wallet-standard tooling 

  Solana program          Rust + Anchor           Auction state, vaults,
                                                  deposits, payouts

  Private computation     Arcium + Arcis (Rust)   Encrypted bid
                                                  calculation

  Arcium client           `@arcium-hq/client`     Client-side encryption
                                                  and computation
                                                  integration, following
                                                  current examples

  Scripts                 TypeScript              Keeper, deployment,
                                                  test and demo scripts

  Test framework          Anchor tests +          Program integration and
                          TypeScript unit tests   pricing correctness

  Token                   SPL Token / Token-2022  Sale token and quote
                          only if deliberately    token handling
                          supported               

  Trading pool            Meteora DAMM v2 SDK, if Post-auction pool
                          confirmed compatible    creation
  -----------------------------------------------------------------------

**Version gate:** the supplied guide notes that its examples targeted
Arcium `0.13.2` while a newer toolchain was `0.15.0` at the time it was
written. Treat those numbers as historical context, not as current
version recommendations. Check the official docs and example manifests,
pin compatible versions, and record the versions used by the team.

## Repository structure

Use a monorepo so the program, circuit, frontend, scripts, and tests can
be developed and reviewed together.

``` text
blindlaunch/
├── README.md
├── package.json
├── pnpm-workspace.yaml
├── .gitignore
├── .env.example
├── apps/
│   └── web/
│       ├── app/
│       │   ├── page.tsx
│       │   ├── auctions/
│       │   └── create/
│       ├── components/
│       ├── hooks/
│       ├── lib/
│       │   ├── solana.ts
│       │   ├── arcium.ts
│       │   ├── validation.ts
│       │   └── formatting.ts
│       └── tests/
├── programs/
│   └── blindlaunch/
│       ├── src/
│       │   ├── lib.rs
│       │   ├── state.rs
│       │   ├── instructions/
│       │   └── errors.rs
│       └── tests/
├── encrypted-ixs/
│   └── clearing_price/
│       ├── src/
│       └── tests/
├── packages/
│   └── auction-core/
│       ├── src/
│       │   ├── clearingPrice.ts
│       │   ├── allocation.ts
│       │   └── types.ts
│       └── tests/
├── scripts/
│   ├── deploy-devnet.ts
│   ├── create-demo-auction.ts
│   ├── keeper.ts
│   └── demo-bidders.ts
├── docs/
│   ├── architecture.md
│   ├── threat-model.md
│   └── demo-runbook.md
└── tests/
    └── e2e/
```

Names can change to match the current Arcium starter template. Keep the
program and encrypted instruction layout that the installed CLI
generates when required by its toolchain.

## Prerequisites

Use **macOS or Linux** for the Arcium development environment unless the
current official installation documentation explicitly supports your
setup. The supplied guide says Arcium does not natively support Windows;
do not assume WSL is supported without checking.

Install or verify:

-   Git
-   Node.js LTS and the package manager selected by the repo (`pnpm` is
    recommended for this layout)
-   Rust toolchain
-   Solana CLI
-   Anchor / Arcium CLI versions compatible with each other
-   Docker, if required by the current Arcium local testing workflow
-   A browser wallet configured for **devnet**
-   A devnet SOL balance for transaction fees

Read the current setup pages before installing. Arcium's installer may
manage compatible Solana/Anchor dependencies, so follow its installation
instructions instead of independently installing conflicting versions.

Useful checks (commands may differ by current toolchain version):

``` bash
git --version
node --version
npm --version
rustc --version
solana --version
anchor --version
arcium --version
docker --version
```

Create a dedicated development wallet. Never use a wallet containing
real funds for development or commit its keypair to Git.

## Quick start

The following is the intended workflow. It assumes the team has created
the repository and aligned the versions against the current official
examples.

### 1. Clone and install JavaScript dependencies

``` bash
git clone <YOUR_GITHUB_REPOSITORY_URL>
cd blindlaunch
corepack enable
pnpm install
```

If the repository uses npm instead of pnpm, use the lockfile's package
manager consistently; do not mix package managers.

### 2. Configure Solana devnet

``` bash
solana config set --url https://api.devnet.solana.com
solana-keygen new
solana address
solana airdrop 2
solana balance
```

If the airdrop is rate-limited, use the official Solana faucet. Use test
tokens only.

### 3. Run the Arcium starter example before changing it

Follow the current Arcium Hello World instructions exactly, without
custom changes first. Verify that the example builds and tests pass.
Then inspect the current sealed-bid auction example in the official
Arcium examples repository and use it as the reference for encryption,
queuing computation, and receiving results.

### 4. Run pricing tests

``` bash
pnpm --filter @blindlaunch/auction-core test
```

Adapt the package name and script to the actual workspace. The pricing
logic must pass all tests before being ported to the private circuit.

### 5. Build and test the program

Use the commands generated by the installed Anchor/Arcium template.
Common Anchor workflows include:

``` bash
anchor build
anchor test
```

Do not assume these exact commands cover Arcium's circuit build or
cluster setup; follow the selected example's `Arcium.toml`, CLI
commands, and deployment instructions.

### 6. Start the frontend

``` bash
pnpm --filter web dev
```

Open the local URL printed by Next.js. Connect a devnet wallet and
confirm the UI can read auction state before trying a real transaction.

### 7. Deploy and run the demo

Deploy the program and encrypted instruction to the intended
devnet/Arcium environment using the current official guide. Create an
auction, submit test bids, close it, wait for the computation result,
settle it, and verify all token movements on the explorer.

## Implementation roadmap

Build in this order. Each phase has a concrete completion gate. Do not
start with UI polish or the liquidity pool.

### Phase 0 --- Confirm the toolchain and examples

1.  Read Solana core concepts and Anchor local-development docs.
2.  Install Arcium and run its Hello World.
3.  Inspect the current Arcium sealed-bid example.
4.  Confirm the target cluster, circuit limits, result callback shape,
    and whether local tests require Docker.
5.  Pin a compatible version set in manifests and document it.

**Done when:** a clean checkout can build and run the untouched example
on the team's development machine.

### Phase 1 --- Implement ordinary auction math

Write the clearing-price and allocation rules in ordinary TypeScript
first. Use integer price steps and integer token base units. Add unit
tests for all edge cases listed below.

**Done when:** the reference example returns a clearing price of `$0.60`
and allocations of 400, 300, 300, and 0 tokens for a supply of 1,000
tokens.

### Phase 2 --- Build the transparent Anchor safety-net auction

Implement the complete state machine and vault accounting with visible
bids. This version is for development and must be labelled as **not
private** in the UI. It proves that custody, settlement, and refund
logic work before adding MPC.

**Done when:** create → bid → close → settle and timeout
cancellation/refund pass on a local validator or devnet.

### Phase 3 --- Implement the Arcium circuit

Port the tested pricing algorithm to Arcis using fixed-size arrays and
loops with statically bounded counts. Start with 4 bidder slots and 8
price steps. Pad unused slots with zero bids. Confirm how per-bidder
allocations are returned securely and how the program validates the
result.

**Done when:** the private example produces the same result as the
reference implementation and bid values do not appear in plaintext in
public transactions or logs.

### Phase 4 --- Integrate encrypted bids end-to-end

Add client-side encryption using the current supported
`@arcium-hq/client` workflow. Store only the required ciphertext and
protocol metadata. Do not invent cryptography or design a custom
encryption scheme.

**Done when:** a wallet can submit a bid; the public account/transaction
does not expose its price and quantity; the private result is correctly
accepted by the program.

### Phase 5 --- Complete settlement and recovery

Validate the computation result and settle all bidders. Ensure that a
duplicate callback, repeated settlement, or malformed result cannot pay
twice. Implement the timeout cancellation and refund path.

**Done when:** every bidder can receive exactly the entitlement
specified by the auction rules, and the team can recover sale tokens
after a valid cancellation.

### Phase 6 --- Build the web app

Build a clear, minimal auction experience. Focus on correctness,
understandable state, and wallet errors before visual effects.

**Done when:** a first-time user can connect, understand the auction
rules, submit a bid, see confirmation, and find their result without
reading the source code.

### Phase 7 --- Add Meteora, if time and compatibility allow

Verify the current DAMM v2 SDK and fee scheduler support, then implement
pool creation as a separate, tested integration. Do not assume
fee-scheduler parameters or pool APIs from older examples are still
current.

**Done when:** a settled auction can create the intended pool at the
clearing price, with all pool parameters shown and validated before the
transaction is signed.

**Fallback:** for a hackathon deadline, demonstrate correct auction
computation, settlement, and refunds; show the pool integration as a
clearly labelled next step rather than faking a successful pool
creation.

### Phase 8 --- Harden, rehearse, and submit

Run tests from a clean checkout, inspect transactions on the explorer,
prepare a repeatable demo script, record a short video, and document
limitations.

## Auction and pricing rules

### Units and bounds

-   Represent price as an integer **price step** on a configured grid.
-   Represent token amounts in integer base units.
-   Define the grid's mapping from step index to quote-token price
    precisely.
-   Validate every step, amount, supply, deposit, and bidder slot
    against configured bounds.
-   Never use floating-point arithmetic for on-chain accounting or the
    circuit.
-   Document how rounding and leftover units are handled.

### Clearing price

For each candidate price step, demand is the sum of all valid bid
quantities whose bid price is at least that step. Use binary search on
the finite price grid to find the highest price at which demand is
sufficient to cover the sale supply, according to the exact protocol
convention.

At the clearing price:

1.  Bids strictly above the clearing price are filled in full, subject
    to the supply cap.
2.  Bids exactly at the clearing price share the remaining supply
    proportionally to their requested quantities.
3.  Integer rounding must be deterministic and must never allocate more
    than the available supply.
4.  Any remaining dust follows an explicit, documented rule.
5.  The protocol must define what happens when demand never reaches
    supply, when no bids are valid, and when demand exactly equals
    supply.

The guide's worked example sells 1,000 tokens: bidder A offers `$1.00`
for 400, B offers `$0.80` for 300, C offers `$0.60` for 500, and D
offers `$0.50` for 400. The intended clearing price is `$0.60`, with
allocations 400, 300, 300, and 0. Total proceeds are `$600`.

**Important implementation detail:** the reference example must be
treated as an explicit acceptance test. Do not infer an undocumented
fallback price. Agree on the undersubscribed-auction rule before
implementing it.

### Fixed deposit

Every bidder locks the same fixed deposit. This makes the deposit less
informative about bid size, but it also limits the maximum bid and may
incentivize users to split activity across wallets. Specify whether the
bid amount is capped by the deposit, whether fees are included, and
exactly how the deposit is converted into maximum spend.

The deposit is escrow, not revenue. Track deposit liability separately
from sale proceeds, and ensure all refund paths remain fully funded.

## On-chain program design

The following account fields are proposed starting points; finalize
account sizes, seeds, token-program support, and serialization against
the current Anchor/Solana APIs.

### Auction account

-   `authority`: creator; must not be allowed to bid in its own auction.
-   `token_mint`: token being sold.
-   `quote_mint`: quote currency, intended to be USDC in the design.
-   `supply`: token quantity placed for sale.
-   `min_price`: minimum accepted price.
-   `price_grid`: number of allowed price steps and step size.
-   `max_bidders`: fixed bidder capacity.
-   `deposit_per_bidder`: identical deposit for every accepted bidder.
-   `deadline`: time after which new bids are rejected and closing is
    permitted.
-   `timeout`: time after which a stalled computation can be cancelled.
-   `status`: `Open`, `Computing`, `Cleared`, `Settled`, or `Cancelled`.
-   `clearing_price`, `total_sold`: populated only after a valid result.
-   `token_vault`, `quote_vault`: program-controlled token accounts and
    accounting.

### Bid account

-   `auction`: parent auction.
-   `bidder`: wallet that submitted the bid.
-   `deposit`: locked deposit.
-   `encrypted_bid`: ciphertext and only the protocol metadata needed to
    process it.
-   `slot_index`: unique index in the fixed-size circuit input.
-   `settled`: replay-protection flag.

Use a PDA and deterministic seeds for accounts where appropriate.
Enforce one bid per wallet unless the protocol deliberately supports
replacement; if replacement is supported, define how the previous
deposit and slot are handled.

### Suggested instructions

  -----------------------------------------------------------------------
  Instruction                         Required behavior
  ----------------------------------- -----------------------------------
  `create_auction`                    Validate parameters, initialize
                                      state, transfer sale tokens into
                                      vault

  `place_bid`                         Require `Open`, enforce
                                      deadline/capacity/unique bidder,
                                      collect fixed deposit, store
                                      ciphertext

  `close_auction`                     Require deadline passed, transition
                                      exactly once to `Computing`, queue
                                      MPC job

  `accept_result` / callback          Authenticate the configured Arcium
                                      result path, validate bounds, store
                                      result once

  `settle_bid`                        Pay allocated tokens and refund the
                                      unused deposit; prevent replay

  `finalize_settlement`               Pay team proceeds and mark auction
                                      settled only when accounting
                                      balances

  `cancel_after_timeout`              Require computing timeout and no
                                      accepted result; transition to
                                      `Cancelled`

  `claim_refund`                      Return deposit on cancellation,
                                      once per bidder

  `reclaim_cancelled_tokens`          Return sale tokens to authority
                                      after cancellation, under defined
                                      rules
  -----------------------------------------------------------------------

This list is a design target, not a guarantee that each instruction maps
one-to-one to the current Arcium callback API. Keep the deployed
instruction surface as small as possible.

### State machine

``` text
                 deadline passed
    Open ------------------------------> Computing
      |                                      |
      | creator cancellation only            | valid authenticated result
      | if explicitly allowed                v
      |                                   Cleared
      |                                      |
      |                                      | all settlement checks pass
      |                                      v
      |                                   Settled
      |
      | computation timeout / no valid result
      v
  Cancelled  ---> bidders claim deposits; authority reclaims sale tokens
```

Define and test all legal transitions. No instruction should move an
auction backwards, accept bids after close, accept multiple results, or
settle twice. A timeout must not race with a valid result in a way that
creates double claims; specify which on-chain state and timing check
wins.

## Arcium privacy circuit

The circuit receives a fixed-size padded list of encrypted bids, the
sale supply, and the price grid. It returns the clearing price, total
sold, and the allocations required for settlement.

Arcis constraints called out by the supplied design:

-   Use fixed-size arrays, not dynamically growing collections.
-   Use loops with fixed, known bounds; avoid unbounded `while`,
    `break`, and `continue`.
-   Both branches of a secret-dependent `if` may be evaluated, so
    account for the cost of both branches.
-   Use integer units rather than floating-point prices or quantities.
-   Begin with a small circuit (4 bidder slots and 8 price steps), then
    scale only after correctness and resource use are measured.
-   Do not reveal losing bids as part of the circuit output.
-   Treat all callback results as untrusted until the on-chain program
    authenticates and validates them.

Test the circuit against the ordinary reference implementation for many
deterministic and randomized cases. A circuit result must never be
trusted solely because the frontend displays it.

## Web application requirements

### Pages

1.  **Home / auction discovery**
    -   Explain the sealed-bid model and its limitations.
    -   List auctions with status, deadline, token, supply, minimum
        price, and capacity.
    -   Make the devnet/demo status obvious.
2.  **Auction detail**
    -   Show rules, remaining time, capacity, accepted-bid status, and
        transaction history.
    -   Do not show bid price or quantity from any public source.
    -   Explain the fixed deposit and refund behavior before the user
        signs.
3.  **Submit bid**
    -   Wallet connection and network check.
    -   Inputs for price step and token quantity, validated against the
        auction's rules.
    -   Show a plain-language summary and fixed deposit amount.
    -   Encrypt locally through the supported Arcium client API.
    -   Submit the required Solana transaction and display
        pending/success/failure states.
    -   Do not store plaintext bids in analytics, browser logs, URLs, or
        server logs.
4.  **My bid / result**
    -   Identify the connected wallet's own submission.
    -   Show pending computation, allocation, payment, refund, or
        cancellation status as applicable.
    -   Do not reveal other users' bid values.
5.  **Create auction** (optional for the first demo)
    -   Restrict to supported token/quote mint types.
    -   Validate all parameters and show a pre-sign summary.
    -   Explain that the authority cannot bid in its own auction.

### UI state model

Represent states explicitly rather than inferring them from button
visibility:

-   Wallet disconnected
-   Wrong network
-   Auction open / full / ended
-   Bid validation error
-   Encryption in progress / failed
-   Wallet approval pending
-   Transaction pending / confirmed / failed
-   Auction computing
-   Result available
-   Settlement pending / complete
-   Auction cancelled / refund available / refund claimed

Use accessible labels, keyboard-friendly forms, readable transaction
errors, and clear confirmation messages. Never display "private" or
"settled" until the corresponding program state confirms it.

## Keeper / automation

The keeper is a small TypeScript script that watches for auctions whose
deadline has passed and submits the permitted close instruction. It may
also help trigger permissionless settlement actions if the protocol
supports them.

Requirements:

-   No privileged key should be required for permissionless actions.
-   Make actions idempotent: read state before sending a transaction and
    safely handle "already closed" outcomes.
-   Retry transient RPC failures with bounded exponential backoff.
-   Log auction public keys, transaction signatures, and error
    categories, but never log plaintext bid data or secret material.
-   Keep RPC endpoints and any keeper keypair outside the repository.
-   A keeper outage must not permanently lock funds; users must be able
    to call permissionless actions themselves where designed.

## Meteora liquidity pool integration

Meteora DAMM v2 is the intended post-auction trading venue in the
architecture. The pool should open only after the auction has a valid
clearing price and settlement prerequisites are satisfied.

Before implementation:

1.  Confirm current DAMM v2 SDK APIs and supported pool configuration.
2.  Confirm whether the intended fee scheduler is available for the
    selected pool type.
3.  Confirm the fee schedule and its parameters from current official
    docs; historical examples in the supplied guide must not be treated
    as guaranteed defaults.
4.  Confirm how the clearing price maps to initial pool price and
    liquidity deposits.
5.  Check the difference between Blindlaunch's sealed-bid price
    discovery and Meteora Alpha Vault / Anti-Sniper Suite features so
    the project pitch is accurate.

Use a separate module and integration tests. If pool creation is not
complete by the hackathon deadline, report it as incomplete; do not show
a mocked transaction as a real pool.

## Security, privacy, and failure handling

### Minimum security checklist

-   [ ] Development uses devnet and test tokens only.
-   [ ] Authority cannot bid in its own auction.
-   [ ] Parameters are validated for bounds, token decimals, price-grid
    overflow, capacity, and deadline order.
-   [ ] All transfers use the intended mint and token program; token
    account ownership and PDA authorities are checked.
-   [ ] Fixed deposits are collected and accounted for exactly once.
-   [ ] Every bidder slot is unique and the circuit input is fully
    padded.
-   [ ] Bids are rejected after the deadline and once capacity is
    reached.
-   [ ] Ciphertext length, encoding, nonce/metadata, and associated
    auction identity are validated.
-   [ ] Only the legitimate Arcium result path can update computation
    state.
-   [ ] Result values are range-checked and total allocations never
    exceed supply.
-   [ ] Settlement and refunds are replay-protected and idempotent.
-   [ ] A stalled computation has a deterministic timeout and refund
    route.
-   [ ] The timeout path cannot race a valid result into double payouts.
-   [ ] No plaintext bid is emitted in logs, errors, events, analytics,
    or server storage.
-   [ ] Secrets, keypairs, RPC credentials, and `.env` files are
    excluded from Git.
-   [ ] Arithmetic uses checked integer operations and documented
    rounding.
-   [ ] Tests cover malicious, malformed, repeated, late, and
    boundary-case transactions.

### Privacy claims to make carefully

Blindlaunch hides bid values from public observers under the intended
Arcium execution and cryptographic assumptions. It does not hide every
fact about a bidder or transaction. Deposits, wallet addresses,
ciphertext submissions, timing, transaction relationships, final
allocations, and token transfers may remain public. Fixed equal deposits
reduce one obvious signal but do not eliminate timing or wallet-linkage
analysis.

### Known design limitations

-   **Bid shading:** bidders may strategically bid below their true
    value in a uniform-price auction.
-   **Wallet splitting:** users may split demand across wallets; fixed
    deposits do not automatically prevent this.
-   **Post-launch bots:** sealed bidding removes the speed race for
    auction allocation, not every bot advantage after trading opens.
-   **MPC trust assumptions:** privacy depends on Arcium's protocol,
    implementation, and network security assumptions.
-   **Public settlement:** token allocations and payments become visible
    through on-chain transfers.
-   **Circuit limits:** fixed-size circuits cap bidders and price steps;
    capacity must be chosen based on measured computation costs.
-   **Oracle/result liveness:** computation may stall, which is why
    timeout cancellation and refunds are required.

Do not claim that the system is trustless, anonymous, bot-proof, or
audited unless those claims are independently substantiated.

## Testing and acceptance criteria

### Unit tests: auction math

At minimum:

-   [ ] Four-bidder reference case returns clearing price `$0.60`.
-   [ ] No bids.
-   [ ] One valid bidder.
-   [ ] Demand below supply.
-   [ ] Demand exactly equals supply.
-   [ ] Demand above supply.
-   [ ] Several bids tie at the clearing price.
-   [ ] Zero quantity, out-of-range price, and invalid price step are
    rejected.
-   [ ] Integer rounding and dust never cause overselling.
-   [ ] Maximum configured values do not overflow.
-   [ ] Ordinary implementation matches circuit outputs.

### Program integration tests

-   [ ] Only authority can create an auction with valid parameters.
-   [ ] Authority cannot bid in its own auction.
-   [ ] Bid requires the fixed deposit and a unique valid slot.
-   [ ] Bid after deadline, full capacity, wrong mint, and duplicate bid
    are rejected.
-   [ ] Close before deadline is rejected.
-   [ ] Close can only enqueue computation once.
-   [ ] Unauthenticated or malformed computation result is rejected.
-   [ ] Duplicate result/callback cannot alter a completed auction.
-   [ ] Settlement transfers the expected tokens and refunds the correct
    unused amount.
-   [ ] Repeated settlement/refund calls cannot pay twice.
-   [ ] Timeout cancellation permits refunds and token recovery.
-   [ ] A valid result and timeout cannot both win the same state
    transition.

### Frontend and end-to-end tests

-   [ ] Wrong-network and disconnected-wallet states are understandable.
-   [ ] Invalid inputs are blocked before wallet approval.
-   [ ] Bid encryption failure does not submit a plaintext bid.
-   [ ] Transaction rejection, RPC failure, and confirmation timeout
    have recovery UI.
-   [ ] Refreshing the page does not lose the ability to find the user's
    bid/result.
-   [ ] Other wallets' bid values are never shown.
-   [ ] The full devnet flow can be run twice from a clean state.
-   [ ] Every success screen corresponds to confirmed chain state.

### Definition of done

The hackathon MVP is complete when the team can demonstrate on devnet:

1.  Create an auction and escrow the sale supply.
2.  Submit multiple encrypted bids with a fixed deposit.
3.  Close the auction after the deadline.
4.  Receive and validate the private computation result.
5.  Settle correct allocations and refunds.
6.  Trigger the timeout/refund path in a separate test.
7.  Explain which data is public and which is intended to remain
    private.
8.  Reproduce the demo from documented commands.

Meteora pool creation is an optional integration if time or current API
compatibility is a blocker; label its status honestly.

## Hackathon demo plan

Prepare two runs with the same token supply and an easy-to-understand
narrative.

### Run A --- conventional launch baseline

Use a local simulation or a clearly labelled test setup to show how
first-come-first-served allocation can let an automated buyer obtain a
large share. Do not misrepresent a simulation as a live market event.

### Run B --- Blindlaunch

1.  Create the auction and display the rules.
2.  Submit bids from several demo wallets.
3.  Show the public explorer transactions: deposits and ciphertexts are
    visible, but bid price/quantity are not in plaintext.
4.  Close and compute after the deadline.
5.  Reveal only the clearing price and final settlement outcomes.
6.  Show the same price applied to winners, unused deposit refunds, and
    the timeout safety net in a separate run.
7.  If Meteora integration is complete, show the actual pool
    transaction; otherwise explain the fallback.

### Suggested two-to-three-minute pitch

-   **Problem (20 sec):** token launches reward speed and expose public
    bids.
-   **Solution (30 sec):** Blindlaunch uses encrypted sealed bids and
    one clearing price.
-   **Proof (60 sec):** run the auction, show ciphertexts, result, and
    on-chain payouts.
-   **Safety (20 sec):** explain fixed deposits, timeout refunds, and
    what remains public.
-   **Roadmap (20 sec):** explain Meteora integration and remaining
    production work.

Be precise: the goal is to remove the speed advantage in the allocation
phase, not to promise that bots disappear from the entire market.

## Environment variables

Create `.env.local` for the frontend and separate environment files for
scripts where needed. Never commit secrets.

Example placeholders (only include variables actually read by your
implementation):

``` dotenv
# Public frontend configuration
NEXT_PUBLIC_SOLANA_CLUSTER=devnet
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_BLINDLAUNCH_PROGRAM_ID=
NEXT_PUBLIC_QUOTE_MINT=

# Private script configuration — never expose with NEXT_PUBLIC_
SOLANA_RPC_URL=https://api.devnet.solana.com
AUCTION_AUTHORITY_KEYPAIR_PATH=
ARCIUM_CLUSTER=
METEORA_POOL_CONFIG=
```

These are suggested names, not preconfigured variables. Match the names
to the actual code. Do not place private keys, seed phrases, encryption
secrets, or service credentials in `NEXT_PUBLIC_*` variables. Add
`.env*` to `.gitignore`, while keeping `.env.example` with empty
placeholders.

## Troubleshooting

### Arcium / Anchor version mismatch

-   Compare versions in the CLI output, `Cargo.toml`, package manifests,
    `Arcium.toml`, and the example repository.
-   Start from an example matching the installed toolchain.
-   Avoid updating one dependency in isolation.
-   Re-run the untouched Hello World before debugging project-specific
    code.

### Circuit build or test fails

-   Reduce to 4 bidders and 8 price steps.
-   Replace dynamic data structures with fixed arrays and statically
    bounded loops.
-   Use integer units and inspect type/bit-width limits.
-   Compare the circuit result with the ordinary reference tests.
-   Check current Arcis documentation and ask in the official Arcium
    community if needed.

### Devnet airdrop fails

Use the official Solana faucet or retry later due to rate limits. Do not
fund the dev wallet with real assets.

### Transaction fails

Check the selected cluster, wallet network, account addresses, token
mint, token decimals, program deployment, account initialization,
deadline, and program logs. Display a readable error to the user without
exposing secret or plaintext bid data.

### Computation stalls

Confirm the cluster and Arcium configuration, queued computation status,
callback/result route, and timeout. Test cancellation and refunds as a
normal workflow, not as an unimplemented emergency promise.

### Meteora SDK differs from the example

Use the current official SDK docs and examples. Keep the pool module
isolated and preserve the working auction MVP if the pool integration
has to be postponed.

## Official references

Verify all commands, SDK names, API signatures, and network support
against current documentation before implementation.

-   [Solana core concepts](https://solana.com/docs/core)
-   [Solana devnet faucet](https://faucet.solana.com/)
-   [Anchor quickstart](https://www.anchor-lang.com/docs/quickstart)
-   [Anchor local
    development](https://www.anchor-lang.com/docs/quickstart/local)
-   [Arcium developer documentation](https://docs.arcium.com/developers)
-   [Arcium
    installation](https://docs.arcium.com/developers/installation)
-   [Arcium Hello World](https://docs.arcium.com/developers/hello-world)
-   [Arcis mental model / circuit
    rules](https://docs.arcium.com/developers/arcis/mental-model)
-   [Arcium examples repository](https://github.com/arcium-hq/examples)
-   [Arcium TypeScript SDK reference](https://ts.arcium.com/api)
-   [Arcium Discord](https://discord.com/invite/arcium)
-   [Meteora documentation](https://docs.meteora.ag/)

## Final build principle

**Make the auction correct before making it private; make it private
before polishing the UI; make settlement and refunds reliable before
adding the trading pool.**

A small, repeatable devnet demo with accurate privacy claims is stronger
than a visually polished interface backed by incomplete or mocked
on-chain behavior.
