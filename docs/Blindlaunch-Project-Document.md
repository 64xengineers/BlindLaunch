# Blindlaunch

## Project Document: Sealed-Bid, Uniform-Price Token Launches on Monad

| Item | Detail |
|---|---|
| Document type | Project and product specification |
| Version | 1.0 |
| Date | 12 October 2026 |
| Event | Monad Metropolis Hackathon, Onchain Finance & Trading track |
| Network | Monad Testnet (chain ID 10143) |
| Repository | github.com/64xengineers/BlindLaunch |
| Status | Working testnet prototype. Not audited. |

---

## Table of Contents

1. Introduction
2. Problem Statement
3. Solution Overview
4. Auction Mechanism
5. System Architecture
6. Web Application
7. Security and Trust Model
8. Limitations
9. Future Work
10. Deployment Information
11. Conclusion
- Appendix A: Worked Example
- Appendix B: Glossary

---

## 1. Introduction

### 1.1 Purpose

This document describes Blindlaunch: the problem it addresses, the auction mechanism it implements, the architecture of the system, the features of the web application, and the known limitations of the current release. It is intended to serve as the formal reference for evaluators, contributors and prospective integrators.

### 1.2 Scope

The document covers the `BlindAuction` smart contract deployed on Monad Testnet, the supporting test tokens, and the Blindlaunch web application. It does not cover production deployment, token economics of any specific project, or legal and regulatory matters.

### 1.3 Intended Audience

- Hackathon judges and reviewers
- Token teams evaluating the platform for a launch
- Developers integrating Blindlaunch auctions into their own interfaces
- Testers validating the end-to-end flow

### 1.4 Summary

Blindlaunch is a token launch platform in which buyers submit sealed bids during a fixed window. After the window closes, bids are revealed and a smart contract computes a single clearing price that every successful bidder pays. Because submission order has no effect on the outcome and bids are hidden while the window is open, automated bots and front-runners gain no advantage over ordinary participants.

---

## 2. Problem Statement

Most token launches use a first-come, first-served model in which the price rises with each purchase. This model has four well-documented weaknesses:

1. **Speed determines access.** Automated bots observe pending transactions and place their own orders first, acquiring tokens at the lowest prices.
2. **Unequal pricing.** Later participants, typically ordinary users, pay materially higher prices for the same asset.
3. **Concentrated ownership.** A small number of fast actors accumulate a large share of supply and frequently sell immediately, harming price stability.
4. **Wasted value.** Participants compete through transaction fees ("gas wars"), transferring value to block producers rather than to the project or its community.

These weaknesses damage the reputation of the launching team, distort initial distribution and produce an opening price that does not reflect genuine demand.

---

## 3. Solution Overview

Blindlaunch replaces the race with a **sealed-bid, uniform-price auction** enforced entirely on chain. Its design rests on three principles:

| Principle | Description |
|---|---|
| Hidden bids | During the bidding window only a cryptographic commitment is published. No participant can observe or react to another's bid. |
| Uniform price | All successful bidders pay the same clearing price, regardless of how high they bid. Bidding high secures allocation, not a worse price. |
| Order independence | Every bid submitted within the window is treated identically. Arriving first confers no benefit. |

All funds are held in escrow by the smart contract. Neither the launching team nor the platform operators can withdraw funds outside the rules defined in the contract.

---

## 4. Auction Mechanism

### 4.1 Participants

| Role | Responsibilities |
|---|---|
| Authority (launching team) | Creates the auction, deposits the token supply, and collects proceeds and unsold tokens after completion. The authority is prohibited from bidding in its own auction. |
| Bidder | Seals a bid with a fixed deposit, reveals it after the window closes, and claims tokens and refunds. Each wallet may submit one bid per auction. |
| Any participant | May trigger settlement, or cancellation once the settlement deadline has passed. |
| BlindAuction contract | Holds all assets in escrow and enforces every rule. |

### 4.2 Auction Parameters

| Parameter | Description | Value used by the web application |
|---|---|---|
| Sale token | Token being sold | SALE (test token) |
| Quote token | Token used for payment and deposits | QUOTE (test token) |
| Supply | Number of tokens offered | Set by the team (e.g. 1,000) |
| Minimum price | Lowest price on the ladder | Set by the team (e.g. 50) |
| Step size and count | Defines the price ladder | 10 per step, 6 steps |
| Deposit | Fixed amount every bidder locks | Set by the team (e.g. 1,000,000) |
| Maximum notional | Upper bound on price × quantity | Equal to the deposit |
| Maximum bidders | Bid slots per auction | 8 (contract limit: 64) |
| Commit deadline | End of bidding | Chosen by the team |
| Reveal deadline | End of the reveal window | Commit deadline + 15 minutes |
| Cancel time | Earliest time cancellation is allowed | Commit deadline + 30 minutes |

With a minimum price of 50, the price ladder is 50, 60, 70, 80, 90 and 100.

### 4.3 Lifecycle

**Phase 1: Creation.** The authority submits the auction parameters. The full supply of the sale token is transferred from the authority's wallet into the contract.

**Phase 2: Commitment (bidding window).** Each bidder selects a price step and a quantity. The application generates a random 32-byte secret ("salt") and computes the commitment:

```
commitment = keccak256(abi.encode(auctionId, bidder, priceStep, quantity, salt))
```

Only the commitment is submitted on chain, together with the fixed deposit in the quote token. Because every deposit is identical, the deposit discloses nothing about the bid.

**Phase 3: Reveal.** After the commit deadline and before the reveal deadline, each bidder submits the price step, quantity and salt. The contract recomputes the commitment and rejects any mismatch, which guarantees that bids cannot be altered after sealing. A revealed bid is *counted* only if all of the following hold:

- the price step lies within the ladder;
- the quantity is greater than zero;
- price × quantity does not exceed the deposit or the maximum notional.

Bids that are not revealed in time are excluded from clearing; their deposits remain fully refundable.

**Phase 4: Settlement.** After the reveal deadline and before the cancel time, any participant may call `settle`. The contract computes the clearing price and allocations as described in Section 4.4.

**Phase 5: Claims.**

- Each bidder calls `claim` and receives the allocated sale tokens together with a refund equal to the deposit minus the clearing price multiplied by the allocation. A bidder who receives no allocation recovers the entire deposit.
- The authority calls `reclaim` and receives the proceeds (clearing price × tokens sold) and any unsold sale tokens.

**Fallback: Cancellation.** If the auction has not been settled by the cancel time, any participant may call `cancel`. Every bidder may then reclaim the full deposit, and the authority recovers the entire supply. Funds therefore cannot become permanently locked.

### 4.4 Clearing Algorithm

1. **Demand by price.** For each step on the ladder, total demand is the sum of quantities from all counted bids at that step or higher.
2. **Clearing price.** The clearing step is the highest step at which total demand is greater than or equal to supply. If no step satisfies this condition, the clearing step is the lowest step.
3. **Allocation.**
   - Bids above the clearing step receive their full quantity.
   - Bids at the clearing step share the remaining supply in proportion to their requested quantities, rounded down. Remaining indivisible units ("dust") are assigned one at a time to the earliest bids at the clearing step.
   - Bids below the clearing step receive nothing.

Every successful bidder pays the clearing price per token.

### 4.5 Escrow

Assets enter the contract at exactly two points: the sale-token supply at creation and each bidder's deposit at commitment. Each transfer is verified by comparing the contract's balance before and after the transfer. Assets leave only through `claim` and `reclaim`, under the rules above. The contract charges no fee.

---

## 5. System Architecture

### 5.1 Components

| Component | Technology | Role |
|---|---|---|
| BlindAuction contract | Solidity, Foundry | Auction logic, escrow, clearing |
| UniformClearing library | Solidity | Clearing price and allocation computation |
| Test tokens (SALE, QUOTE) | Solidity (ERC-20 subset, 0 decimals, public mint) | Testnet assets |
| Web application | React 19, Vite 7, Tailwind CSS 4, viem 2 | User interface |
| Wallet | MetaMask | Transaction signing |
| Hosting | Vercel (static) | Delivery of the web application |

### 5.2 Data Flow

1. The web application reads all auction and bid data directly from Monad Testnet through a public RPC endpoint. There is no backend server or database.
2. Transactions are signed in MetaMask and submitted directly to the contract.
3. Bid secrets (price step, quantity, salt and transaction hashes) are stored in the browser's local storage so the bidder can reveal later.
4. Optional auction names and descriptions are stored locally in the creator's browser. The contract stores no free text.

### 5.3 Verification

The contract is covered by a Foundry test suite. The web application uses a TypeScript implementation of the same clearing rules for previews and simulation, validated against the reference examples in the repository.

---

## 6. Web Application

### 6.1 Global Elements

- **Navigation bar:** logo, links to Auctions, How it works, My bids and For teams, and a wallet button showing the connected address and MON balance. It remains visible while scrolling and collapses into a menu on small screens.
- **Notifications:** short status and error messages. A rejected wallet request is reported simply as "User rejected the request."
- **Automatic network setup:** on connection, the application requests MetaMask to add and switch to Monad Testnet.
- **Automatic test tokens:** required test tokens are minted to the user's wallet as part of the bidding or creation flow.
- **Footer:** links to the integration documentation, contract, faucet, Monad documentation, source code and support, together with a testnet disclaimer.

### 6.2 Pages

| Page | Path | Function |
|---|---|---|
| Home | `/` | Introduction, list of auctions (All / Open / Closed), interactive price simulator, bot comparison demo, privacy and trust overview, steps, FAQ, and risk disclosure. |
| How it works | `/how` | Detailed explanation of the process and a breakdown of costs. |
| Auction | `/auction/:id` | Live status bar, countdown, reminder notifications, phase-specific action card (seal, reveal, settle, cancel or claim refund), demand chart, auction rules, costs and on-chain verification links. |
| Bid sealed | `/auction/:id/sealed` | Confirmation of the sealed bid, commitment hash, progress tracker and reveal countdown. |
| Result | `/auction/:id/result` | Clearing price, tokens sold, allocation table, and claim actions for bidders and the authority. |
| My bids | `/bids` | All bids placed by the connected wallet, with status, one-click reveal and claim actions, and transaction links. |
| Team dashboard | `/team` | Auctions created by the connected wallet and their progress. |
| Create auction | `/create` | Auction creation form with live preview, price ladder and deadline timeline. |
| Integration docs | `/docs` | Contract addresses, commitment format and call sequence for developers. |

### 6.3 Interactive Features

- **Price simulator:** users adjust supply and up to six example bids and observe the clearing price and allocations update in real time. No transactions are sent.
- **Bot comparison demo:** an animated, illustrative comparison of an open launch and a Blindlaunch auction with the same participants, showing the bot's advantage disappearing under uniform pricing.

### 6.4 Input Safeguards

The interface prevents the following before any transaction is sent: bids by the authority, duplicate bids from one wallet, bids in the final 15 seconds of the window, bids exceeding the deposit limit, bids into a full auction, and malformed secrets.

---

## 7. Security and Trust Model

### 7.1 Information Visibility

| Hidden until reveal | Always public |
|---|---|
| Bid price | Bidder wallet address |
| Bid quantity | Time of each bid |
| Maximum spend | Deposit amount |
| | Revealed bids, clearing price and all allocations after reveal |

### 7.2 Trust Assumptions

Participants rely on:

1. The correctness of the `BlindAuction` contract, which is open source and tested but not audited.
2. Their own browser, which stores the secret required to reveal.
3. The availability of Monad Testnet during the reveal and settlement windows.
4. Their own action to reveal within the reveal window.

### 7.3 Protections

- Commitments bind bidders to their bids; altered reveals are rejected.
- Uniform deposits prevent inference of bid size from the deposit.
- Balance checks on every token transfer.
- Reentrancy guards on every state-changing function.
- A cancellation path guarantees refunds if settlement does not occur.

---

## 8. Limitations

### 8.1 Privacy

- Bids are confidential only until they are revealed. After reveal, all prices and quantities are public.
- Wallet addresses, bid timing and deposits are public throughout.
- The system uses commit-reveal, not encrypted computation. Bids are not processed in confidential form.

### 8.2 Participant Obligations

- Bidders must reveal within a 15-minute window. Unrevealed bids are excluded, although deposits remain refundable.
- The reveal secret is stored only in the bidder's browser. Clearing browser data or changing device prevents reveal. No backup or recovery mechanism exists.
- Settlement requires a participant to act within 15 minutes after the reveal window. No automated keeper is provided.

### 8.3 Mechanism Design

- Prices are restricted to a fixed six-step ladder with increments of 10.
- A uniform deposit caps the maximum bid size and requires small bidders to lock more capital than needed.
- One bid per wallet; eight bidders per auction in the web application.
- Reveal and settlement windows are fixed by the application.
- A single participant may use multiple wallets. The deposit raises the cost of this behaviour but does not prevent it.

### 8.4 Scope of the Current Release

- Testnet only, using public test tokens. Teams cannot select their own token through the interface.
- The contract has not been independently audited.
- No trading pool is created after settlement.
- No protocol fee or revenue model is implemented.
- Auction names and descriptions are visible only in the creator's browser.
- MetaMask on desktop browsers is the only supported wallet.
- New hosting domains may trigger false phishing warnings in wallet software until reviewed.

---

## 9. Future Work

| Area | Planned improvement |
|---|---|
| Privacy | Encrypted bids that remain confidential after settlement, using confidential-computation networks |
| Usability | Automated reveal and settlement through relayers or keepers; secret backup and recovery |
| Flexibility | Custom tokens, configurable price ladders and windows |
| Market launch | Automatic creation of a trading pool at the clearing price |
| Assurance | Independent security audit, followed by mainnet deployment |
| Business model | Optional protocol fee on proceeds; white-label and API access for launchpads and wallets |

---

## 10. Deployment Information

| Item | Value |
|---|---|
| Network | Monad Testnet |
| Chain ID | 10143 |
| RPC endpoint | https://testnet-rpc.monad.xyz |
| Block explorer | https://testnet.monadexplorer.com |
| BlindAuction contract | 0xacC12B4bdae66Ef42939340Fa1811BD629F18cC2 |
| SALE token | 0x803cbeb14E07249E6DbE64a76751AbF253925ab5 |
| QUOTE token | 0x19655Bdde974d7410e8AFaf5FA0158e558043105 |
| Faucet | https://faucet.monad.xyz |
| Local setup | See `SETUP.md` in the repository |

---

## 11. Conclusion

Blindlaunch demonstrates that fair, bot-resistant token distribution can be achieved with a transparent on-chain mechanism. Hidden bids remove the informational advantage of observing others, the uniform clearing price removes the incentive to race, and contract escrow removes the need to trust the launching team. The current release is a complete, working prototype on Monad Testnet. Its principal limitations, namely post-reveal transparency, manual reveal and settlement, and the absence of an audit, are addressed in the roadmap.

---

## Appendix A: Worked Example

**Parameters:** supply 1,000; ladder 50 to 100 in steps of 10; deposit 1,000,000.

| Bidder | Maximum price | Quantity |
|---|---|---|
| A | 100 | 600 |
| B | 70 | 600 |
| C | 60 | 200 |

**Demand by price:**

| Price | 100 | 90 | 80 | 70 | 60 | 50 |
|---|---|---|---|---|---|---|
| Demand | 600 | 600 | 600 | 1,200 | 1,400 | 1,400 |

The highest price at which demand (1,200) meets supply (1,000) is **70**.

**Outcome:**

| Bidder | Position | Allocation | Payment | Refund |
|---|---|---|---|---|
| A | Above clearing | 600 | 42,000 | 958,000 |
| B | At clearing | 400 (remaining supply) | 28,000 | 972,000 |
| C | Below clearing | 0 | 0 | 1,000,000 |

The authority receives 70,000 QUOTE in proceeds. Bidder A was willing to pay 100 per token but pays the clearing price of 70.

---

## Appendix B: Glossary

| Term | Definition |
|---|---|
| Authority | The wallet that created the auction and supplied the tokens |
| Clearing price | The single price paid by every successful bidder |
| Commitment | Hash of a bid and its secret, published during bidding |
| Deposit | Fixed quote-token amount each bidder locks in escrow |
| Dust | Indivisible units left after proportional allocation |
| Escrow | Custody of assets by the smart contract under fixed rules |
| Price ladder | The discrete set of prices bidders may choose from |
| Reveal | Disclosure of a bid and its secret to prove it matches the commitment |
| Salt | Random secret that makes a commitment impossible to guess |
| Settlement | Computation of the clearing price and allocations |
| Uniform-price auction | An auction in which all winners pay the same price |

---

*Disclaimer: Blindlaunch is a hackathon prototype operating on a test network with test tokens. It has not been audited. Nothing in this document constitutes financial, legal or investment advice, or an offer to sell any asset.*
