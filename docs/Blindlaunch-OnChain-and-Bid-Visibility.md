# Blindlaunch

## On-Chain Operation and Bid Visibility

### Formal Technical Note

| Attribute | Detail |
|---|---|
| Document title | On-Chain Operation and Bid Visibility |
| Document type | Formal technical note |
| Version | 2.0 |
| Date of issue | 13 October 2026 |
| System | Blindlaunch: sealed-bid, uniform-price token launch platform |
| Network | Monad Testnet (chain identifier 10143) |
| Contract | BlindAuction, `0xacC12B4bdae66Ef42939340Fa1811BD629F18cC2` |
| Block explorer | https://testnet.monadexplorer.com |
| Related documents | Blindlaunch Project Document; Design Note: On-Chain Operation, Bid Visibility, and Randomness |
| Classification | Public |

---

## Table of Contents

1. Introduction
2. Definitions
3. Summary of Findings
4. Origination of Auctions and Bids
5. On-Chain Operation
6. Custody of Assets
7. Data Held Outside the Blockchain
8. Data Access Through the Public RPC Endpoint
9. Evidence of On-Chain State
10. Independent Verification Procedure
11. Visibility of Bid Information
12. Confidentiality Mechanism
13. Disclosure at Reveal
14. Points of Access to Bid Information
15. Assessment of Confidentiality
16. Identified Limitation: Selective Non-Reveal
17. Path to Permanent Confidentiality
18. Questions and Answers
19. Conclusions
- Disclaimer

---

## 1. Introduction

### 1.1 Purpose

This note sets out formal answers to two questions concerning the Blindlaunch platform:

- **Question 1.** Whether the auctions in which participants submit bids are recorded and executed on chain.
- **Question 2.** Whether participants are able to determine the identity of other bidders, the quantity each bidder requested, and the price each bidder offered.

### 1.2 Scope

This note applies to the BlindAuction smart contract deployed on Monad Testnet and to the Blindlaunch web application in its current release. It does not address proposed future changes except where expressly stated in Section 17.

### 1.3 Intended Audience

This note is intended for evaluators, testers, prospective integrators and participants who require an authoritative description of the platform's data handling and confidentiality properties.

---

## 2. Definitions

For the purposes of this note, the following terms have the meanings given below.

| Term | Definition |
|---|---|
| Authority | The wallet that creates an auction and supplies the tokens offered for sale. |
| Participant | Any wallet, other than the Authority, that submits a bid. |
| Bidding window | The period from auction creation until the commit deadline. |
| Reveal window | The fifteen-minute period following the commit deadline. |
| Commitment | A cryptographic hash of a bid and its salt, recorded during the bidding window. |
| Salt | A random 32-byte secret generated in the Participant's browser for each bid. |
| Deposit | The fixed amount of quote tokens that every Participant must lock when submitting a bid. |
| Settlement | The computation, by the contract, of the clearing price and allocations. |
| On chain | Recorded on, and executed by, the Monad blockchain. |
| Off chain | Held outside the blockchain, in this note specifically in the browser's local storage. |
| RPC endpoint | A network address through which an application communicates with a blockchain node. |

---

## 3. Summary of Findings

**Finding 1.** All auctions and bids are recorded on, and executed by, the BlindAuction smart contract on Monad Testnet. The web application functions solely as an interface. It does not hold assets, determine outcomes or maintain a database.

**Finding 2.** The visibility of bid information depends on the phase of the auction:

- **(a)** During the bidding window, the wallet address of each Participant, the time of each bid and the uniform Deposit are public. **The price and quantity of every bid are not disclosed.**
- **(b)** Upon reveal, the price and quantity of the revealed bid become public.
- **(c)** Upon Settlement, the allocation and payment of each Participant become public.

---

## 4. Origination of Auctions and Bids

### 4.1 Auctions

The platform has no central operator responsible for publishing auctions. Any wallet may create an auction through the *Create an auction* function of the web application. On creation:

- **(a)** the creating wallet is recorded as the Authority;
- **(b)** the full supply of sale tokens is transferred from the Authority to the contract;
- **(c)** the contract assigns the auction a sequential identifier;
- **(d)** the auction becomes visible to all users, since the web application obtains the list of auctions directly from the contract.

### 4.2 Bids

Bids are submitted by Participants from their own wallets, together with the Deposit. The contract rejects any bid submitted by the Authority of the same auction, and accepts no more than one bid per wallet per auction.

### 4.3 Operating Model

| Party | Responsibility |
|---|---|
| Token project (Authority) | Creates the auction and supplies the tokens |
| Community (Participants) | Submit sealed bids during the bidding window |
| Any party | May initiate Settlement after the reveal window, or cancellation after the cancellation time |
| BlindAuction contract | Holds all assets, computes the outcome and processes all claims |

*Figure 1: Relationship between Authority, Participants and contract*

```
Authority wallet ──creates──▶ Auction (sale tokens held by the contract)
                                   ▲
Participant wallets ──submit bids─┘  (each locks the uniform Deposit)
```

For testing purposes, a single individual may act in both capacities by using one wallet account as the Authority and separate accounts as Participants.

---

## 5. On-Chain Operation

### 5.1 Statement

Every state-changing action in an auction is performed by a transaction to the BlindAuction contract and recorded on the Monad blockchain.

### 5.2 Actions and Recorded Data

*Table 1: Contract functions and data recorded on chain*

| Action | Function | Data recorded |
|---|---|---|
| Creation | `createAuction` | Auction parameters (supply, price ladder, Deposit, deadlines) and the Authority's address; sale tokens transferred to the contract |
| Bid submission | `commit` | Participant's address and Commitment; Deposit transferred to the contract |
| Reveal | `reveal` | Price step and quantity, verified against the Commitment |
| Settlement | `settle` | Clearing price, clearing step, total sold and each allocation, as computed by the contract |
| Claim | `claim` | Allocated sale tokens and refund transferred to the Participant |
| Reclaim | `reclaim` | Proceeds and unsold tokens transferred to the Authority |
| Cancellation | `cancel` | Auction status set to cancelled; full refunds become claimable |

### 5.3 Consequences

- **(a) Determinism and auditability.** The clearing price and allocations are produced by contract code and can be independently recomputed by any party.
- **(b) Immutability.** Recorded data and contract rules cannot be altered after the fact.
- **(c) Permanence and transparency.** Every auction and transaction remains publicly available on the block explorer.
- **(d) Independence from the interface.** The unavailability of the web application would not affect existing auctions, which could continue to be operated directly through the contract.

---

## 6. Custody of Assets

### 6.1 Location of Escrow

All assets are held by the BlindAuction contract. No separate vault, corporate wallet or custodian is involved.

### 6.2 Points of Entry

Assets enter the contract at exactly two points:

- **(a)** at creation, when the full supply of sale tokens is transferred from the Authority;
- **(b)** at bid submission, when each Participant's Deposit is transferred in the quote token.

Each transfer is validated by comparing the contract's token balance before and after the transfer. Before either transfer, the user must grant the contract an approval limited to the exact amount required.

### 6.3 Points of Exit

Assets leave the contract only through:

- **(a)** `claim`, by which a Participant receives allocated tokens and the unused portion of the Deposit, or the full Deposit if the auction is cancelled or no allocation is made; and
- **(b)** `reclaim`, by which the Authority receives the proceeds and any unsold tokens, or the entire supply if the auction is cancelled.

No party, including the Authority and the developers, is able to withdraw assets by any other means.

---

## 7. Data Held Outside the Blockchain

The following data is held exclusively in the user's browser.

*Table 2: Data held off chain*

| Data | Justification |
|---|---|
| Salt, together with a copy of the bid's price step and quantity | Required to perform the reveal. Publication during the bidding window would disclose the bid prematurely. |
| Auction name and description | The contract does not store free text. |
| Reveal reminders | Provided for user convenience only. |

**Operational consequence.** A Participant must perform the reveal from the same browser used to submit the bid. If browser data is lost, the bid cannot be revealed. In that event the bid is excluded from Settlement, and the Deposit remains refundable in full.

---

## 8. Data Access Through the Public RPC Endpoint

### 8.1 Definition

A Remote Procedure Call (RPC) endpoint is a network address through which an application reads blockchain state and submits transactions to a blockchain node. A public RPC endpoint is accessible without registration or credentials.

### 8.2 Application in Blindlaunch

- **(a)** The web application obtains all auction, bid, result and balance data from the public endpoint `https://testnet-rpc.monad.xyz`.
- **(b)** Transactions are signed in the user's wallet (MetaMask) and submitted through the RPC endpoint configured in that wallet.
- **(c)** As the application has no backend, the RPC endpoint is its sole source of data.

*Figure 2: Data flow between the application, wallet and blockchain*

```
Web application ──read──▶ Public RPC endpoint ──▶ Monad node ──▶ Blockchain
Wallet (signed transaction) ──submit──▶ RPC endpoint ──▶ Monad network
```

### 8.3 Comparison of Endpoint Types

*Table 3: Public and private RPC endpoints*

| Attribute | Public endpoint | Private provider endpoint |
|---|---|---|
| Cost | None | Free tier, thereafter paid |
| Access | URL only | Registration and API key |
| Capacity | Shared and rate-limited | Higher limits and reliability |
| Appropriate use | Development, testing and demonstration | Production deployment |

### 8.4 Operational Note

Intermittent errors such as "RPC Request failed" usually come from load on, or rate limiting of, the public endpoint, not from a fault in the platform. A production deployment should use a dedicated provider.

---

## 9. Evidence of On-Chain State

The following state was obtained by querying the BlindAuction contract directly on Monad Testnet on 12 October 2026, independently of the web application. Identifier 0 is unused.

*Table 4: Auctions recorded in the contract*

| Auction | Authority | Supply | Bids | Status |
|---|---|---|---|---|
| 1 | 0x7622…cDeB (contract deployer) | 1,000 | 1 | Settled |
| 2 | 0x7622…cDeB (contract deployer) | 100 | 1 | Cancelled |
| 3 | 0x088e…6676 | 1,000 | 0 | Cancelled |
| 4 | 0x7Dee…3778 | 1,000 | 1 | Cancelled |
| 5 | 0x088e…6676 | 1,000 | 0 | Open |
| 6 | 0x0f60…3F33 | 1,000 | 1 | Settled |

Auction 6 demonstrates the intended operating model: it was created by one wallet (0x0f60…3F33) and received a bid from a different wallet (0x088e…6676).

---

## 10. Independent Verification Procedure

Any party may verify the matters stated in this note by the following procedure:

1. Access the contract on the block explorer at https://testnet.monadexplorer.com/address/0xacC12B4bdae66Ef42939340Fa1811BD629F18cC2.
2. Examine the contract's transactions (`createAuction`, `commit`, `reveal`, `settle`, `claim`, `reclaim`, `cancel`) and its token holdings.
3. Within the web application, use the *Verify on chain* panel on an auction page, or the transaction links on the *My bids* page.
4. Confirm that each transaction has a status of *Success*, and that each Deposit transfer moves funds from the Participant's wallet to the contract.

**Note on network status.** Monad Testnet is a genuine blockchain. The SALE and QUOTE tokens used on it are test assets with no monetary value. The same contract could be deployed on a production network following an independent security audit.

---

## 11. Visibility of Bid Information

*Table 5: Disclosure of information by auction phase*

| Information | During bidding window | Following the Participant's reveal | Following Settlement |
|---|---|---|---|
| Participant wallet address | Public | Public | Public |
| Time of bid | Public | Public | Public |
| Deposit (uniform for all Participants) | Public | Public | Public |
| Price offered | **Not disclosed** | Public | Public |
| Quantity requested | **Not disclosed** | Public | Public |
| Allocation and payment | Not applicable | Not applicable | Public |

---

## 12. Confidentiality Mechanism

### 12.1 Commitment

During the bidding window, only a Commitment is recorded on chain, calculated as follows:

```
commitment = keccak256(abi.encode(auctionId, bidder, priceStep, quantity, salt))
```

### 12.2 Properties

- **(a)** Without knowledge of the Salt, it is computationally infeasible to recover the price or quantity from the Commitment, or to determine them by exhaustive trial.
- **(b)** Because every Participant locks an identical Deposit, the Deposit discloses no information about the size of a bid.
- **(c)** Observers can therefore establish that a particular wallet has submitted a bid, but not the contents of that bid.

### 12.3 Purpose

This mechanism prevents Participants from observing, reacting to or replicating the bids of others during the bidding window, and removes any advantage from front-running.

---

## 13. Disclosure at Reveal

### 13.1 Requirement

The contract requires each bid's price and quantity in order to compute the clearing price. During the reveal window, each Participant therefore submits the price step, quantity and Salt.

### 13.2 Verification

The contract recomputes the Commitment from the submitted values and accepts the reveal only if the result matches the recorded Commitment. This guarantees that no bid has been altered after submission.

### 13.3 Eligibility

A revealed bid is counted in Settlement only if all of the following conditions are satisfied:

- **(a)** the price step lies within the auction's price ladder;
- **(b)** the quantity is greater than zero;
- **(c)** the product of price and quantity does not exceed the Deposit.

### 13.4 Effect

On a successful reveal, the price and quantity are recorded on chain and become public.

---

## 14. Points of Access to Bid Information

*Table 6: Locations at which bid information may be viewed*

| Location | Information available |
|---|---|
| Auction page | Number of bids; following reveals, an indicative demand chart |
| Result page | Clearing price, tokens sold, and an allocation table showing each Participant's allocation and payment |
| My bids page | The connected wallet's own bids, their status and transaction links |
| Block explorer or direct contract query | All of the foregoing, accessible to any party without use of the web application |

Since bid information is recorded on chain, no modification to the web application could make it confidential once revealed.

---

## 15. Assessment of Confidentiality

- **(a) Fairness.** Bid contents are disclosed only after the bidding window has closed, when no Participant can amend a bid or exploit the information. The fairness of the auction is therefore preserved.
- **(b) Duration of confidentiality.** Confidentiality is temporary. Following reveal, any party may associate a wallet with its price, quantity and bidding history.
- **(c) Identity.** The platform provides pseudonymity, not anonymity. A wallet address does not of itself identify a natural person, but it may be linked to one through external information.

---

## 16. Identified Limitation: Selective Non-Reveal

### 16.1 Description

Reveals occur sequentially within the reveal window. A Participant who reveals late is therefore able to observe the bids of Participants who revealed earlier.

### 16.2 Constraints

- **(a)** The late Participant cannot alter its own bid, as the Commitment prevents this.
- **(b)** The late Participant may, however, elect not to reveal if the emerging outcome appears unfavourable.

### 16.3 Consequence

An unrevealed bid is excluded from Settlement and receives no allocation. Its Deposit is refundable only after Settlement or cancellation.

### 16.4 Status

This limitation is inherent in all commit-reveal auction designs and is acknowledged in the current release.

---

## 17. Path to Permanent Confidentiality

### 17.1 Approach

Permanent confidentiality requires encrypted bidding, under which bids are processed in encrypted form and only the clearing price and allocations are disclosed. This may be achieved through confidential-computation networks, for example Arcium.

### 17.2 Status

Encrypted bidding does not form part of the current release and is recorded as future work.

*Table 7: Comparison of the current and prospective designs*

| Property | Current release (commit-reveal) | Prospective design (encrypted bidding) |
|---|---|---|
| Bids confidential during bidding window | Yes | Yes |
| Bids confidential after the auction | No | Yes |
| Selective non-reveal possible | Yes | No |
| Participant required to return and reveal | Yes | No |

---

## 18. Questions and Answers

**18.1 Is any part of the auction operated by a centralised server?**
No. The platform has no backend. The web application reads from and writes to the contract directly.

**18.2 Is the Authority able to view bids before the bidding window closes?**
No. The Authority has access only to the same Commitments that are available to all parties.

**18.3 Is the Authority or any developer able to withdraw Deposits?**
No. Deposits are held by the contract and may leave it only through `claim` and `reclaim`, in accordance with the contract's rules.

**18.4 Can a Participant view another Participant's price during the bidding window?**
No. Only the wallet address, time of bid and Deposit are available.

**18.5 Can a Participant view another Participant's price after the auction?**
Yes, provided that the other Participant has revealed. The information is public on chain and is displayed on the Result page.

**18.6 Would existing auctions be lost if the web application ceased to operate?**
No. Auctions remain on the blockchain and may still be revealed, settled, claimed or cancelled through the contract.

**18.7 What is the consequence of losing browser data before revealing?**
The bid cannot be revealed and is excluded from Settlement. The Deposit is refunded in full after Settlement or cancellation.

**18.8 Do the assets used have monetary value?**
No. The platform operates on Monad Testnet using test tokens.

---

## 19. Conclusions

**19.1 On-chain operation.** All auctions, bids, Settlements and claims are recorded on, and executed by, the BlindAuction contract on Monad Testnet, and all assets are held in escrow by that contract. Auctions may be created by any wallet acting as Authority, and bids are submitted by other wallets. The web application is an interface that obtains data through a public RPC endpoint. Only the Salt, display text and reminders are held outside the blockchain.

**19.2 Bid visibility.** During the bidding window, only wallet addresses, bid times and the uniform Deposit are public, and the price and quantity of each bid remain undisclosed. Following reveal, each Participant's price and quantity are public, and following Settlement, so are each Participant's allocation and payment. The design preserves the fairness of the auction but does not provide permanent confidentiality. Encrypted bidding is identified as the means of achieving permanent confidentiality in a future release.

---

## Disclaimer

Blindlaunch is a prototype developed for the Monad Metropolis Hackathon. It operates on a test network using test tokens and has not been subject to an independent security audit. Nothing in this note constitutes financial, legal or investment advice, or an offer to sell any asset.
