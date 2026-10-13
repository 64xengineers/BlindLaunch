# Blindlaunch

## Design Note: On-Chain Operation, Bid Visibility, and Randomness

| Item | Detail |
|---|---|
| Document type | Technical design note |
| Version | 1.0 |
| Date | 13 October 2026 |
| Related document | Blindlaunch Project Document (`docs/Blindlaunch-Project-Document.md`) |
| Network | Monad Testnet (chain ID 10143) |
| Contract | BlindAuction, `0xacC12B4bdae66Ef42939340Fa1811BD629F18cC2` |
| Status | Describes the current release and evaluates proposed changes. No changes have been implemented. |

---

## Table of Contents

1. Purpose
2. Origin of Auctions and Bids
3. On-Chain Operation
4. Role of the Public RPC Endpoint
5. Bid Visibility and Privacy
6. Randomness in the Current Design
7. Proposed Extensions: Randomness and Off-Chain Processing
8. Evaluation and Recommendation
9. Summary
- Appendix A: Observed On-Chain State
- Appendix B: Glossary

---

## 1. Purpose

This note records the design questions raised during testing and review of Blindlaunch and provides formal answers. It addresses four questions:

1. Who creates the auctions on which users bid?
2. Are auctions and bids stored and executed on chain?
3. Which bid information is visible to other users, and when?
4. Can randomness be introduced, and should any part of the system be moved off chain?

---

## 2. Origin of Auctions and Bids

### 2.1 Auctions

Blindlaunch has no central operator that publishes auctions. **Any wallet may create an auction** using the *Create an auction* page. The creating wallet becomes the auction's **authority**. On creation:

- the authority's sale tokens (the supply) are transferred into the BlindAuction contract;
- the contract assigns the auction a sequential identifier;
- the auction becomes visible to all users, because the web application reads the list of auctions directly from the contract.

### 2.2 Bids

Bids are created by **participants**, meaning any wallet other than the authority. A participant opens an auction, selects a price and a quantity, and seals the bid. The bid originates from the participant's wallet and is accompanied by the fixed deposit. The contract rejects bids from the authority.

### 2.3 Intended Operating Model

| Party | Action |
|---|---|
| Token project (authority) | Creates the auction and supplies the tokens |
| Community (participants) | Seal bids during the bidding window |
| Any party | Triggers settlement after the reveal window |
| Contract | Computes the clearing price, escrows all assets and processes claims |

During testing, a single tester may act as both parties by using one wallet account to create the auction and other accounts to bid.

---

## 3. On-Chain Operation

### 3.1 Statement

All auctions and bids are recorded on, and executed by, the BlindAuction smart contract on Monad Testnet. The web application is an interface to the contract. It does not hold funds, compute results or maintain a database.

### 3.2 On-Chain Actions

| Step | Contract function | Recorded on chain |
|---|---|---|
| Create auction | `createAuction` | Auction parameters and authority address; sale tokens transferred into escrow |
| Seal bid | `commit` | Bidder address and bid commitment (hash); deposit transferred into escrow |
| Reveal bid | `reveal` | Price step and quantity, verified against the commitment |
| Settle | `settle` | Clearing price, clearing step, total sold and each allocation, computed by the contract |
| Claim | `claim` | Sale tokens and refund transferred to the bidder |
| Reclaim | `reclaim` | Proceeds and unsold tokens transferred to the authority |
| Cancel | `cancel` | Auction marked cancelled; full refunds become claimable |

### 3.3 Consequences

- **Determinism and auditability:** the clearing price and allocations are produced by contract code and can be independently recomputed by anyone.
- **Custody:** no person, including the authority and the developers, can withdraw escrowed assets outside the contract's rules.
- **Permanence:** every auction and transaction remains publicly verifiable on the block explorer.
- **Interface independence:** if the web application became unavailable, the auctions would continue to exist and could be operated directly through the contract.

### 3.4 Data Held Off Chain

The following data is stored only in the user's browser (local storage), deliberately or by necessity:

| Data | Reason |
|---|---|
| Secret salt and a copy of the bid (price step, quantity) | Required for reveal; publishing it would disclose the bid prematurely |
| Auction name and description | The contract stores no free text |
| Reveal reminders | User convenience only |

### 3.5 Network Note

The deployment uses Monad Testnet. The ledger is genuine, but the SALE and QUOTE tokens are test assets with no monetary value.

---

## 4. Role of the Public RPC Endpoint

### 4.1 Definition

A Remote Procedure Call (RPC) endpoint is a network address through which an application communicates with a blockchain node in order to read state and submit transactions. A **public** RPC endpoint is open to anyone without registration or credentials.

### 4.2 Use in Blindlaunch

- The web application reads all auction, bid and balance data through the public endpoint `https://testnet-rpc.monad.xyz`.
- Signed transactions are submitted by MetaMask through the RPC endpoint configured for the network in the wallet.
- Because the application has no backend, the RPC endpoint is its only data source.

### 4.3 Public and Private Endpoints Compared

| Attribute | Public endpoint | Private provider endpoint |
|---|---|---|
| Cost | Free | Free tier, then paid |
| Access | URL only | Registration and API key |
| Capacity | Shared and rate-limited; may be slow or briefly unavailable | Higher limits and reliability |
| Suitable for | Development, testing, hackathons | Production applications |

### 4.4 Operational Implication

Intermittent errors such as "RPC Request failed" usually come from load or rate limits on the public endpoint, not from faults in Blindlaunch. A production deployment should use a dedicated provider.

---

## 5. Bid Visibility and Privacy

### 5.1 Visibility by Phase

| Information | During bidding | After the bidder reveals | After settlement |
|---|---|---|---|
| Bidder wallet address | Public | Public | Public |
| Time of bid | Public | Public | Public |
| Deposit amount (identical for all) | Public | Public | Public |
| Bid price | **Hidden** | Public | Public |
| Bid quantity | **Hidden** | Public | Public |
| Allocation and payment | Not applicable | Not applicable | Public |

### 5.2 Mechanism

During bidding, only a commitment is stored:

```
commitment = keccak256(abi.encode(auctionId, bidder, priceStep, quantity, salt))
```

Without the salt, the commitment cannot practically be inverted to recover the price or quantity. Because all deposits are identical, the deposit discloses nothing about bid size.

### 5.3 Assessment

- **Fairness is preserved.** Bid contents become public only after the bidding window has closed, when no participant can amend a bid or exploit the information.
- **Confidentiality is temporary.** After reveal, any party can associate a wallet with its price and quantity, using the application or by reading the contract directly.
- **Pseudonymity, not anonymity.** Wallet addresses are not inherently linked to real identities, but linkage is possible through external information.
- **Selective non-reveal.** Participants who reveal late can observe earlier reveals. They cannot alter their bids, but they may choose not to reveal. A non-revealed bid is excluded from clearing; its deposit remains refundable.

### 5.4 Conclusion

Blindlaunch guarantees bid confidentiality **for the duration of the auction**, which is the period in which confidentiality prevents front-running and strategic reaction. It does not provide permanent confidentiality.

---

## 6. Randomness in the Current Design

The current release already relies on randomness in one essential place and handles a related concern deterministically:

| Element | Description | Source |
|---|---|---|
| Secret salt | A random 32-byte value generated in the bidder's browser for every bid. It makes each commitment unpredictable and prevents others from guessing bids by trial. | Browser cryptographic random number generator |
| Allocation of remaining units | Bids at the clearing price share the remaining supply in proportion to their size. Indivisible remaining units are assigned one at a time to the earliest bids. | Deterministic rule; no randomness |

No on-chain randomness is used. All contract outcomes are deterministic and reproducible.

---

## 7. Proposed Extensions: Randomness and Off-Chain Processing

### 7.1 Clarification of Terms

Introducing randomness and moving processing off chain are independent changes:

- **Randomness** introduces an unpredictable value into a decision (for example, tie-breaking). It does not move any component off chain.
- **Off-chain processing** relocates bid storage or computation to systems outside the blockchain. It reduces the trustless properties that on-chain execution provides.

### 7.2 Options Considered

**Option A: Randomised tie-break lottery.** Bids at the clearing price receive remaining units through a random draw rather than proportional sharing, using verifiable on-chain randomness (for example, Pyth Entropy on Monad).

- *Benefit:* an alternative allocation rule for oversubscribed price levels.
- *Cost:* contract modification, redeployment to a new address, application update and full retesting.
- *Consideration:* a lottery is generally less equitable than proportional allocation for uniform-price auctions.

**Option B: Off-chain sealed bids with on-chain settlement.** Bids are signed and held off chain and are never published. Only the final outcome is posted on chain.

- *Benefit:* permanent bid confidentiality and no gas cost for bidding.
- *Cost:* requires backend infrastructure and a redesigned contract.
- *Consideration:* introduces trust in the off-chain operator, unless it is replaced by encrypted computation.

**Option C: Randomised closing time (anti-sniping).** The effective close time is chosen at random within a defined interval, preventing participants from timing submissions to the final moment.

- *Benefit:* removes last-second strategies.
- *Cost:* contract modification, a randomness source, and redeployment.
- *Consideration:* sealed bids already remove most of the incentive to snipe, so the marginal benefit is limited.

**Option D: Documentation and roadmap.** Retain the current release unchanged. Document the existing use of randomness, and record verifiable randomness and confidential (encrypted or off-chain) bidding as planned work.

- *Benefit:* no implementation risk before the submission deadline.
- *Cost:* the features remain future work.

### 7.3 Long-Term Direction for Confidentiality

The preferred path to permanent bid confidentiality is **encrypted computation**, in which bids are processed in encrypted form and only the clearing price and allocations are disclosed (for example, using confidential-computation networks such as Arcium). This approach achieves the confidentiality benefit of Option B without introducing a trusted operator.

---

## 8. Evaluation and Recommendation

| Option | Implementation effort | Deadline risk | Effect on trust model | Recommendation |
|---|---|---|---|---|
| A. Random tie-break | High | High | Neutral, with verifiable randomness | Defer |
| B. Off-chain bids | Very high | Very high | Weakens, unless encrypted | Defer; pursue via encrypted computation |
| C. Random close | Medium–high | Medium–high | Neutral | Defer |
| D. Documentation and roadmap | Low | None | Unchanged | **Adopt for the current submission** |

**Recommendation:** adopt Option D for the hackathon submission. The current release is deployed, tested and verified end to end. Contract changes at this stage would require redeployment and retesting with insufficient time for validation. Options A and C should be evaluated after the hackathon. Permanent confidentiality should be pursued through encrypted computation rather than a trusted off-chain operator.

---

## 9. Summary

- Auctions are created by any wallet acting as an authority, and bids are submitted by other wallets. There is no central operator.
- Every auction, bid, settlement and claim is executed on chain by the BlindAuction contract. Only bid secrets, display text and reminders are held in the user's browser.
- The web application reads the blockchain through a public RPC endpoint and has no backend.
- Bid prices and quantities are hidden throughout the bidding window and become public upon reveal. Wallet addresses, timing and deposits are always public.
- Randomness is currently used to generate bid secrets. On-chain randomness and off-chain or encrypted bidding are feasible extensions but are deferred to protect the stability of the submitted release.

---

## Appendix A: Observed On-Chain State

The following state was read directly from the BlindAuction contract on Monad Testnet on 12 October 2026. Identifier 0 is unused.

| Auction | Authority | Supply | Bids | Status |
|---|---|---|---|---|
| 1 | 0x7622…cDeB (deployer) | 1,000 | 1 | Settled |
| 2 | 0x7622…cDeB (deployer) | 100 | 1 | Cancelled |
| 3 | 0x088e…6676 | 1,000 | 0 | Cancelled |
| 4 | 0x7Dee…3778 | 1,000 | 1 | Cancelled |
| 5 | 0x088e…6676 | 1,000 | 0 | Open |
| 6 | 0x0f60…3F33 | 1,000 | 1 | Settled |

Auction 6 illustrates the intended model: it was created by one wallet and bid on by a different wallet (0x088e…6676).

---

## Appendix B: Glossary

| Term | Definition |
|---|---|
| Authority | The wallet that created an auction and supplied its tokens |
| Commitment | A hash of a bid and its salt, published during bidding |
| Encrypted computation | Processing data while it remains encrypted, disclosing only the result |
| Escrow | Custody of assets by the contract under fixed rules |
| Off chain | Data or computation held outside the blockchain |
| On chain | Data or computation recorded and executed on the blockchain |
| Pseudonymity | Identification by wallet address rather than real-world identity |
| RPC endpoint | Network address used by applications to communicate with a blockchain node |
| Salt | A random secret that makes a commitment unpredictable |
| Verifiable randomness | A random value whose fairness can be proven on chain |

---

*Disclaimer: Blindlaunch is a hackathon prototype operating on a test network with test tokens. It has not been audited. Nothing in this document constitutes financial, legal or investment advice.*
