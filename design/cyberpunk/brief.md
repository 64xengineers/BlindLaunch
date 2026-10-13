# Blindlaunch redesign brief

Owner's direction (13 Oct 2026): a complete redesign in a **Cyberpunk 2077, gaming, cartoon** style, with motion and animation throughout. The current design's charts and graphs mean nothing to users. The audience is crypto traders with plenty of tokens and money and no patience: they want to see what to do, what it costs, what they get and whether they won, instantly. No jargon, no complicated charts, no drag and drop.

Process: researcher → designer → builder → critic → builder. A clickable prototype is shown to the owner first; the real React app is restyled only after the owner approves it.

## The product in plain words

Blindlaunch runs token launches as secret-bid auctions on Monad.

1. A creator launches a token sale: a new token or one they already have.
2. Buyers place **one secret bid**: the highest price they would pay per token, and how many tokens they want. Nobody can see any bid until bidding closes, not even the team. The bid is encrypted on the buyer's device.
3. When bidding closes, the bids unlock by themselves on chain (three independent "keepers" each hold a piece of the key; any two are enough).
4. **Everyone who wins pays the same price**: the price at which the tokens sell out (or the lowest price if they don't). Bid high and you still pay that one price.
5. If more people want tokens at that price than there are tokens, everyone at that price gets a fair share.
6. Every bidder locks the same deposit, so the deposit gives nothing away. Whatever a bidder does not spend comes back.
7. Trading then opens on Kuru (a Monad exchange) at that same price, with some tokens and money set aside by the creator.
8. If the keepers ever fail to unlock bids in time, anyone can cancel and **everyone gets every cent back**.

Why people should care: no bots sniping, no gas wars, no insiders seeing your bid, no "buy the top then dump at listing".

## Words: what the UI says instead

| Technical term | Say instead |
| --- | --- |
| Sealed bid, commitment | Secret bid, locked bid |
| Clearing price | Final price (everyone pays it) |
| Price ladder, step, step count | Price options |
| Lots | Tokens (show the lot size only if it is not 1) |
| Deposit | Bid money (locked till the end, the rest comes back) |
| Keepers publish keys, opening bids | Bids unlock |
| Settle | Reveal the result |
| Pro-rata allocation | Fair share when it is crowded |
| Refund | Money back |
| Claim | Collect |
| Reclaim proceeds and unsold | Collect your money and unsold tokens |
| Seed the Kuru market | Start trading on Kuru |
| Cancel (keys never came) | Refund everyone |
| Forfeit, burn | A bid that cheated loses its money; it is burned, nobody gets it |

## Hard rules from the real product (the design must fit these)

- **Price options are a fixed list** set by the creator: lowest price + equal steps, e.g. $0.010, $0.012, … $0.032 (2 to 64 options). A bidder picks one of them as their max price.
- **Amount**: number of tokens (multiples of a lot size, usually 1 token). Rule: `max price × tokens ≤ bid money`. Many degens think in dollars, so offering "spend up to $100 / $250 / $500 / MAX" and converting to tokens is good.
- **Bid money is the same for everyone in a launch** (e.g. 1,000 USDC) and is locked while bidding. The bidder needs that much USDC in their wallet. Unused money comes back.
- **One bid per wallet per launch.** The creator cannot bid in their own launch.
- If you win, you get exactly the tokens you asked for (or a fair share when crowded) and pay the final price for each. If the final price is lower than your max, you pay less. If your max was below the final price, you get nothing and all your money back.
- **Launch phases** (each needs its own look and one clear message):
  - starts soon (countdown)
  - **live** (countdown to close; the bid form)
  - unlocking (bids are being unlocked; anyone can press "Unlock the rest" to push it along)
  - ready (anyone can press "Reveal the result")
  - stuck (keys never came; anyone can press "Refund everyone")
  - done (final price; collect)
  - cancelled (collect your money back)
- **After the result**, a buyer sees one of: won in full, won a fair share, missed (price ended above their max), or refunded (cancelled). A single "Collect" button gets tokens and money back together. Tucked away under "Trouble collecting?", there are separate "Tokens only" and "Money only" buttons.
- **Creator after the result**: "Collect your money and unsold tokens" (with separate buttons tucked away), and the Kuru market card: "Start trading" (anyone can press it), then after the lock period "Unwind the market" and "Return the reserved tokens".
- **Proof links** must stay reachable but quiet: the launch contract, the bid transaction, every bid after unlock (a list of who asked what and got what), the Kuru market.
- **Sign in**: passkey (Face ID or fingerprint, no wallet app needed) or a wallet (MetaMask, Rabby and others). On testnet, a "Get test USDC" button.

## Screens (prototype must cover all; mock data is fine)

1. **Home**: what this is in one line, live launches first (name, ticker, status, time left, starting price, how many bids so far, a clear button), then upcoming and finished. A short "how it works" in at most 4 cartoon panels, not a wall of text. Trust lines: nobody sees bids, one price for all, trading opens at that price, full refund if anything breaks.
2. **Launch page (live)**: token name and ticker, countdown, bids so far (count only), tokens for sale, starting price. The bid form: pick max price, pick how much (presets + a field), then a summary in plain words ("You get up to 20,000 NCAT. You pay at most $400. If the final price is lower, you pay less. $600 of your $1,000 comes back for sure.") and one huge "Lock in my bid" button. After pressing: a satisfying lock or seal animation.
3. **Bid locked**: confirmation; what happens next; "you can leave, nothing else to do"; "see what I bid" for passkey users.
4. **Unlocking / ready / stuck**: a short message for each state, a big public button when one applies, and progress shown as "12 of 30 bids unlocked", not as a chart.
5. **Result**: the final price as the hero; the user's own outcome as a big "loot" card (won / fair share / missed / refunded) with Collect; tokens sold; number of bids; the Kuru card ("Trading is live on Kuru at $0.024 →"); "See all bids" collapsed.
6. **Create a launch**: a 3-step wizard. (1) Token: new (name, ticker, supply) or paste an address. (2) Sale: tokens for sale, lowest price, highest price or step, bid money per bidder, how long bidding lasts. (3) Trading on Kuru: on by default, with plain defaults (list 10% of tokens + 20% of money raised, locked 7 days). Live preview card ("Your launch: 100,000 GOB, $0.01 to $0.05, bidding 30 min, bid money $500"). Advanced settings hidden.
7. **My bids** and **My launches**: simple lists with status chips and one action each.
8. **Connect** modal: passkey vs wallet.

Remove from the current site: the demand chart, the clearing simulator, the bot-race demo widget, and any graph. A single simple meter (e.g. "82% sold") is fine where it truly helps.

## Prototype requirements

- One self-contained HTML page, published as a claude.ai artifact so the owner can open it on any device. Mobile-first: it must look great at 390 px wide and at desktop width.
- Clickable flow: home → launch → bid → locked → (skip time) → unlocking → result → collect, plus create, my bids and connect. A small "demo controls" panel lets the viewer jump between states (live, unlocking, stuck, result: won / fair share / missed / refunded).
- Motion everywhere it helps, with `prefers-reduced-motion` honoured and no flashing faster than 3 times a second.
- Original artwork and names only: cyberpunk-*inspired*, no logos, names, fonts or assets from the game.
- Mock tokens with original names (e.g. NEONCAT / NCAT), USDC as the money, Monad as the chain.
