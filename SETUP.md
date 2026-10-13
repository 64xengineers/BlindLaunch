# Local setup

This guide takes a fresh machine to a running Blindlaunch web app on `http://localhost:5173`, connected to the contracts already deployed on Monad testnet. Part 2 is optional and only needed if you want to test or redeploy the contracts yourself.

Everything here uses Monad **testnet** and test tokens. Never use a wallet that holds real funds.

## Part 1 — Run the web app

### 1. Install the tools

| Tool | Version | How to get it |
| --- | --- | --- |
| Git | any recent | [git-scm.com](https://git-scm.com) |
| Node.js | 22 or newer | [nodejs.org](https://nodejs.org) |
| pnpm | 10 | `corepack enable` (ships with Node), or `npm install -g pnpm@10` |
| MetaMask | latest | Browser extension from [metamask.io](https://metamask.io) |

Check them:

```bash
git --version
node -v      # v22.x or higher
pnpm -v      # 10.x
```

### 2. Clone the repo

The web app and contracts are on the `updated` branch.

```bash
git clone -b updated https://github.com/64xengineers/BlindLaunch.git
cd BlindLaunch
```

### 3. Install dependencies

```bash
pnpm install
```

If pnpm reports `ERR_PNPM_UNEXPECTED_STORE`, point it at your existing store and retry:

```bash
pnpm install --store-dir "$(pnpm store path)"
```

### 4. Start the app

```bash
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173). You should see the dark Blindlaunch home page with "Launches without the bot race." and a list of auctions read live from Monad testnet. No `.env` file is needed for the web app. Contract addresses are in `apps/web/src/config.ts`.

If the page looks unstyled or the layout is broken, stop the server with `Ctrl+C` and run `pnpm dev` again.

### 5. Add Monad testnet to MetaMask

The app offers to add the network when you click **Connect wallet**. To add it by hand, open MetaMask → Networks → Add network → Add a network manually:

| Field | Value |
| --- | --- |
| Network name | Monad Testnet |
| RPC URL | `https://testnet-rpc.monad.xyz` |
| Chain ID | `10143` |
| Currency symbol | `MON` |
| Block explorer | `https://testnet.monadscan.com` |

### 6. Get test MON for gas

1. Copy your MetaMask address.
2. Paste it at [faucet.monad.xyz](https://faucet.monad.xyz) and request MON.
3. Wait until MetaMask shows a MON balance on Monad Testnet.

To test bidding you need at least two accounts: one to create an auction and one to bid (the creator cannot bid). Create extra accounts in MetaMask and send each about 0.2 MON from the first one.

The bid and sale tokens are test tokens. The app mints them for you when you bid or create an auction, so you only need MON.

### 7. Use it

1. Click **Connect wallet** and pick an account. To switch accounts later, click the wallet button again.
2. **For teams → Create an auction** with a close time ("In 10 min" is handy for testing).
3. Switch to another account, open the auction, and **Seal my bid**.
4. After bidding closes, come back with the same browser and **Reveal my bid**. The secret salt is stored in this browser's local storage, so do not clear site data in between.
5. About 15 minutes after bidding closes, anyone can **Settle**. Then bidders claim on **My bids** and the creator collects on **For teams**.

A full test with expected numbers is in the README under "Step 5b — Web app".

### 8. Check the code builds

```bash
pnpm --filter @blindlaunch/web exec tsc --noEmit    # type check
pnpm build                                            # production build into apps/web/dist
pnpm --filter @blindlaunch/auction-core test          # clearing reference tests
```

## Part 2 — Contracts (optional)

You only need this to run the Solidity tests or deploy your own copy of the contracts.

### 1. Install Foundry

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
forge --version
```

### 2. Add forge-std and run the tests

`contracts/lib/` is gitignored, so a fresh clone does not have it. Clone it directly instead of `forge install`, which would add a git submodule to the repo:

```bash
cd contracts
git clone --depth 1 --branch v1.17.0 https://github.com/foundry-rs/forge-std lib/forge-std
forge test
```

Expected: `16 passed, 0 failed`.

### 3. Deploy your own copy (optional)

Use a fresh wallet that only holds testnet MON.

```bash
cd ..                      # back to the repo root
cp .env.example .env
```

Edit `.env` and fill in at least:

```bash
MONAD_RPC_URL=https://testnet-rpc.monad.xyz
MONAD_CHAIN_ID=10143
MONAD_PRIVATE_KEY=0x...    # testnet-only key, never commit this file
```

Then deploy the test tokens, the auction contract and one demo auction:

```bash
cd contracts
set -a && source ../.env && set +a
forge script script/Demo.s.sol:Demo --rpc-url "$MONAD_RPC_URL" --chain 10143 --broadcast
```

The script prints `BlindAuction`, `SaleToken` and `QuoteToken` addresses. Put them in `apps/web/src/config.ts`:

```ts
export const auctionAddress = "0x...";     // BlindAuction
export const saleTokenAddress = "0x...";   // SaleToken
export const quoteTokenAddress = "0x...";  // QuoteToken
```

Restart `pnpm dev`. The app now reads your contracts. The demo auction's deadlines default to 1, 2 and 3 hours. Set `COMMIT_DELAY_SECONDS`, `REVEAL_DELAY_SECONDS` and `CANCEL_DELAY_SECONDS` in `.env` to shorten them.

Verify the new contracts so explorers show their source (no API key needed):

```bash
forge verify-contract <BlindAuction address> src/BlindAuction.sol:BlindAuction \
  --chain 10143 --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org/
forge verify-contract <SaleToken address> src/TestERC20.sol:TestERC20 \
  --chain 10143 --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org/ \
  --constructor-args $(cast abi-encode "constructor(string,string)" "Blindlaunch Sale" "SALE")
```

Repeat the second command for the quote token with `"Blindlaunch Quote" "QUOTE"`. Each should end with `Status: exact_match`.

## Never commit

- `.env` (private keys)
- `contracts/lib/`, `contracts/cache/`, `contracts/out/`, `contracts/broadcast/`
- `node_modules/`, `apps/web/dist/`

All of these are already in `.gitignore`.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Page has no styling or a broken layout | Restart `pnpm dev`. |
| "Switch the wallet to Monad testnet" | Select Monad Testnet in MetaMask, or click Connect wallet to switch automatically. |
| Connect wallet always picks the same account | Click the wallet button again; MetaMask shows an account picker. |
| "User rejected the request." | You dismissed a MetaMask pop-up. Nothing was sent; try again. |
| Seal button disabled | Read the amber message under the form: creator account, auction full, price × tokens over the limit, or bidding about to close. |
| Reveal fails | Reveal from the same browser and wallet that sealed the bid. The salt lives in that browser's local storage. |
| No MON from the faucet | Faucets rate-limit. Send MON from another testnet account instead. |
| `forge` cannot find `forge-std` | Run the `git clone ... lib/forge-std` step inside `contracts/`. |
