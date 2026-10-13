# Blindlaunch v2, Phases 0 and 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the de-risking spikes, repo hygiene and CI (phase 0), then the sealed-bid cryptography package and the complete v2 auction contracts with their full test suite (phase 1).

**Architecture:** A bid `m = step<<224 | quantity<<128 | nonce` is split 2-of-3 with Shamir mod the secp256k1 order, each share XOR-encrypted under `keccak(r·P_i, i)` for keeper key `P_i`. `BlindAuctionV2` stores the sealed bid, verifies published keeper keys and opener-supplied shared points with the ecrecover scalar-multiplication check, reconstructs `m`, aggregates demand per price step, clears at one price, and computes allocations lazily at claim. The TypeScript package `@blindlaunch/sealed-bid` is the single client implementation used by the web app and keepers; checked-in vectors prove it matches the contract.

**Tech Stack:** Solidity 0.8.28, Foundry 1.7.1, forge-std v1.17.0; TypeScript 5.9, viem 2, @noble/curves 1.9.1, Vitest 3, tsx 4; pnpm 10 workspace; GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-13-blindlaunch-v2-design.md`. **Roadmap and later phases:** `docs/superpowers/plans/2026-10-13-blindlaunch-v2-roadmap.md`.

**Working rules for every task**

- Work on a branch, never on `master`: `git checkout -b v2/phase-0-1` before Task 0.1.
- Run commands from the repo root `/Users/pratik/BlindLaunch` unless a step says otherwise.
- Do not edit `contracts/src/BlindAuction.sol`, `UniformClearing.sol`, `TestERC20.sol`, `IERC20Minimal.sol`, `contracts/test/BlindAuction.t.sol` or `contracts/script/*.s.sol`. They are the record of the verified v1 deployment.
- Commit messages: imperative sentence describing the outcome, matching the existing history style.
- Pushing, opening PRs and Vercel deploys need the owner's go-ahead at execution time.

---

## File map

Create

| Path | Responsibility |
| --- | --- |
| `.github/workflows/ci.yml` | Contracts and TypeScript CI |
| `.gitmodules`, `contracts/lib/forge-std` | forge-std v1.17.0 as a submodule |
| `contracts/test/spike/KuruSpike.t.sol` | Phase 0 Kuru fork spike (skips without RPC env) |
| `apps/web/src/spikes/MeraSpike.tsx` | Phase 0 passkey spike page, removed in phase 3 |
| `docs/superpowers/spikes.md` | Spike results that gate phase 2 and 3 choices |
| `packages/sealed-bid/package.json`, `tsconfig.json` | New TS package |
| `packages/sealed-bid/src/curve.ts` | secp256k1 constants, point ops, RNG helpers |
| `packages/sealed-bid/src/bid.ts` | Bid encoding and commitment hash |
| `packages/sealed-bid/src/shamir.ts` | 2-of-3 split and fixed-coefficient reconstruction |
| `packages/sealed-bid/src/seal.ts` | Seal and open (mirror of the contract) |
| `packages/sealed-bid/src/clearing.ts` | Ladder, validity, clearing outcome, allocation (mirror) |
| `packages/sealed-bid/src/index.ts` | Public exports |
| `packages/sealed-bid/tests/*.test.ts` | Vitest suites |
| `packages/sealed-bid/scripts/vectors.ts` | Writes parity vectors for Foundry |
| `contracts/test/vectors/sealed-bid.json` | Generated, checked in |
| `contracts/src/IERC20.sol` | v2 token interface |
| `contracts/src/ERC20.sol` | Minimal ERC-20 base with events |
| `contracts/src/TestToken.sol` | Public-mint testnet token with decimals |
| `contracts/src/LaunchToken.sol` | Fixed-supply token deployed by the factory |
| `contracts/src/TokenFactory.sol` | "New token" create mode |
| `contracts/src/Secp256k1.sol` | Point validation, ecrecover scalar check, reconstruction, share keys |
| `contracts/src/KeeperRegistry.sol` | Per-keeper FIFO queues of per-auction public keys |
| `contracts/src/IMarketSeeder.sol` | Seeder interface used by the auction |
| `contracts/src/BlindAuctionV2.sol` | The v2 auction |
| `contracts/test/v2/V2Base.sol` | Shared fixture and sealing helpers |
| `contracts/test/v2/Mocks.sol` | Mock seeders, hostile tokens, harnesses |
| `contracts/test/v2/*.t.sol` | Test suites listed per task |

Modify

| Path | Change |
| --- | --- |
| `contracts/.gitignore` | Drop `lib/` |
| `.gitignore` | Drop the Solana / Anchor block |
| `contracts/foundry.toml` | `fs_permissions` for vectors, fuzz runs |
| `package.json` | Root `typecheck` and `test` scripts |
| `apps/web/package.json` | `typecheck` script, spike dependencies |
| `apps/web/src/App.tsx` | Temporary `/spike/mera` route |

Delete

`Blindlaunch-Guide.docx`, `Blindlaunch System Architecture.pdf`, `docs/*.docx`, `apps/web/src/styles.css` (Task 0.2), `packages/auction-core/` (Task 1.21).

---

# Phase 0: Spikes and hygiene

### Task 0.1: forge-std as a submodule

**Files:** Modify `contracts/.gitignore`. Create `.gitmodules`, `contracts/lib/forge-std`.

- [ ] **Step 1: Confirm the clean-clone failure**

Run: `cd contracts && forge test; cd ..`
Expected: compilation error `Source "forge-std/Test.sol" not found`.

- [ ] **Step 2: Stop ignoring `lib/`**

Replace the whole of `contracts/.gitignore` with:

```
cache/
out/
broadcast/
```

- [ ] **Step 3: Add the submodule at the rev in `foundry.lock`**

```bash
git submodule add https://github.com/foundry-rs/forge-std contracts/lib/forge-std
git -C contracts/lib/forge-std checkout f3dae6e6ee381f25eb6a246f7da9b85c91a68219
```

- [ ] **Step 4: Run the v1 suite**

Run: `cd contracts && forge test; cd ..`
Expected: `16 tests passed, 0 failed, 0 skipped`.

- [ ] **Step 5: Commit**

```bash
git add .gitmodules contracts/.gitignore contracts/lib/forge-std
git commit -m "Track forge-std as a submodule so forge test works from a clean clone."
```

### Task 0.2: Remove stale files

**Files:** Delete root `Blindlaunch-Guide.docx`, `Blindlaunch System Architecture.pdf`, `docs/*.docx`, `apps/web/src/styles.css`. Modify `.gitignore`.

- [ ] **Step 1: Prove `styles.css` is unused**

Run: `grep -rn "styles.css" apps/web/src apps/web/index.html`
Expected: no output.

- [ ] **Step 2: Delete**

```bash
git rm "Blindlaunch-Guide.docx" "Blindlaunch System Architecture.pdf" docs/*.docx apps/web/src/styles.css
```

- [ ] **Step 3: Drop the Solana block from `.gitignore`**

Remove these five lines from `.gitignore` (the block that starts with `# Solana / Anchor local artifacts`):

```
# Solana / Anchor local artifacts
target/
.anchor/
test-ledger/
.yarn/
```

- [ ] **Step 4: Build still passes**

Run: `pnpm build`
Expected: `✓ built in` with exit 0.

- [ ] **Step 5: Commit**

```bash
git add .gitignore
git commit -m "Delete the Solana-era guide, architecture PDF, Word exports and the unused stylesheet."
```

### Task 0.3: Root scripts and CI

**Files:** Modify `package.json`, `apps/web/package.json`. Create `.github/workflows/ci.yml`.

- [ ] **Step 1: Root scripts**

In `package.json` replace the `scripts` object with:

```json
  "scripts": {
    "dev": "pnpm --filter @blindlaunch/web dev",
    "build": "pnpm --filter @blindlaunch/web build",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test"
  },
```

- [ ] **Step 2: Web typecheck script**

In `apps/web/package.json` replace the `scripts` object with:

```json
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  },
```

- [ ] **Step 3: Run locally**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: typecheck exit 0 for `@blindlaunch/web` and `@blindlaunch/auction-core`; `Tests 18 passed (18)`; build exit 0.

- [ ] **Step 4: Write `.github/workflows/ci.yml`**

```yaml
name: ci

on:
  push:
    branches: [master]
  pull_request:

jobs:
  contracts:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive
      - uses: foundry-rs/foundry-toolchain@v1
        with:
          version: v1.7.1
      - name: Build
        working-directory: contracts
        run: forge build
      - name: Test
        working-directory: contracts
        run: forge test

  typescript:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
```

- [ ] **Step 5: Commit**

```bash
git add package.json apps/web/package.json .github/workflows/ci.yml
git commit -m "Run contract and TypeScript checks in CI."
```

### Task 0.4: Kuru testnet spike

Goal: answer four questions before phase 2. (1) Can a contract call `Router.deployProxy`? (2) Can a contract deposit to `MarginAccount` and post resting orders? (3) Do price and size use human units times `pricePrecision` / `sizePrecision`, as the spec's conversion assumes? (4) Which parameter combinations revert?

**Files:** Create `contracts/test/spike/KuruSpike.t.sol`.

- [ ] **Step 1: Write the spike**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console2} from "forge-std/Test.sol";

interface IKuruRouter {
    function deployProxy(
        uint8 marketType,
        address baseAsset,
        address quoteAsset,
        uint96 sizePrecision,
        uint32 pricePrecision,
        uint32 tickSize,
        uint96 minSize,
        uint96 maxSize,
        uint256 takerFeeBps,
        uint256 makerFeeBps,
        uint96 kuruAmmSpread
    ) external returns (address);
}

interface IKuruMarginAccount {
    function deposit(address user, address token, uint256 amount) external payable;
    function withdraw(uint256 amount, address token) external;
}

interface IKuruOrderBook {
    function addBuyOrder(uint32 price, uint96 size, bool postOnly) external;
    function addSellOrder(uint32 price, uint96 size, bool postOnly) external;
}

contract SpikeToken {
    string public name;
    string public symbol;
    uint8 public immutable decimals;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory name_, string memory symbol_, uint8 decimals_) {
        name = name_;
        symbol = symbol_;
        decimals = decimals_;
    }

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}

/// @dev Stands in for MarketSeeder: a contract, not an EOA, does every Kuru call.
contract SpikeTrader {
    IKuruMarginAccount public immutable margin;

    constructor(IKuruMarginAccount margin_) {
        margin = margin_;
    }

    function deploy(IKuruRouter router, address base, address quote) external returns (address) {
        return router.deployProxy(0, base, quote, 1e8, 1e4, 1, 1e6, 1e16, 0, 0, 100);
    }

    function deposit(SpikeToken token, uint256 amount) external {
        token.approve(address(margin), amount);
        margin.deposit(address(this), address(token), amount);
    }

    function sell(IKuruOrderBook book, uint32 price, uint96 size) external {
        book.addSellOrder(price, size, true);
    }

    function buy(IKuruOrderBook book, uint32 price, uint96 size) external {
        book.addBuyOrder(price, size, false);
    }

    function withdraw(SpikeToken token, uint256 amount) external {
        margin.withdraw(amount, address(token));
    }
}

contract KuruSpikeTest is Test {
    IKuruRouter internal constant ROUTER = IKuruRouter(0x7EFbE105Ca7415dE98F96622173458ac1c054630);
    IKuruMarginAccount internal constant MARGIN = IKuruMarginAccount(0xd029C2D98ff85D8F64799017fE00a59B1159CE02);

    function setUp() public {
        string memory rpc = vm.envOr("MONAD_TESTNET_RPC", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc);
    }

    /// Price 2.5 quote per base: 25_000 at pricePrecision 1e4.
    /// Size 10 base: 10 * 1e8 at sizePrecision 1e8.
    /// Expected fill: seller receives 25 quote = 25e6 base units; buyer receives 10e18 base units.
    function test_contractCanDeployDepositPostAndFill() public {
        SpikeToken base = new SpikeToken("Spike Base", "SBASE", 18);
        SpikeToken quote = new SpikeToken("Spike Quote", "SQUOTE", 6);
        SpikeTrader seller = new SpikeTrader(MARGIN);
        SpikeTrader buyer = new SpikeTrader(MARGIN);

        address market = seller.deploy(ROUTER, address(base), address(quote));
        console2.log("market", market);
        assertTrue(market != address(0), "deployProxy from a contract");

        base.mint(address(seller), 10e18);
        seller.deposit(base, 10e18);
        seller.sell(IKuruOrderBook(market), 25_000, 10e8);

        quote.mint(address(buyer), 25e6);
        buyer.deposit(quote, 25e6);
        buyer.buy(IKuruOrderBook(market), 25_000, 10e8);

        seller.withdraw(quote, 25e6);
        buyer.withdraw(base, 10e18);
        assertEq(quote.balanceOf(address(seller)), 25e6, "seller got quote in human-units * precision encoding");
        assertEq(base.balanceOf(address(buyer)), 10e18, "buyer got base");
    }
}
```

- [ ] **Step 2: Confirm it skips without RPC (CI behaviour)**

Run: `cd contracts && forge test --match-path test/spike/KuruSpike.t.sol -vv; cd ..`
Expected: `1 skipped`.

- [ ] **Step 3: Run against Monad testnet**

Run: `cd contracts && MONAD_TESTNET_RPC=https://testnet-rpc.monad.xyz forge test --match-path test/spike/KuruSpike.t.sol -vvvv; cd ..`
Expected: one of
- PASS: the primary seeder path in the spec is viable; record `market` and the fill.
- FAIL at `deployProxy`: copy the revert reason and the failing parameter. Retry once with `takerFeeBps = 30`, `makerFeeBps = 10` (zero fees may be disallowed). If it still fails only because the caller is a contract, the fallback seeder path applies.
- FAIL at `addSellOrder` or `withdraw` amount mismatch: record the observed amounts. They decide the unit conversion in `MarketSeeder`.
- Fork error (RPC refuses `eth_getStorageAt`/proofs): record it and rerun the same calls as a broadcast script on testnet in phase 2, Task 2.1, before writing the seeder.

- [ ] **Step 4: Commit the spike**

```bash
git add contracts/test/spike/KuruSpike.t.sol
git commit -m "Add a Kuru testnet fork spike that deploys, funds and fills a market from a contract."
```

### Task 0.5: Mera passkey spike

Goal: prove one passkey yields two unrelated 32-byte outputs under two PRF salts (account key and vault key), on desktop and iPhone.

**Files:** Modify `apps/web/package.json` (dependencies), `apps/web/src/App.tsx`. Create `apps/web/src/spikes/MeraSpike.tsx`.

- [ ] **Step 1: Install pinned dependencies**

```bash
pnpm --filter @blindlaunch/web add @category-labs/mera@0.2.0 @scure/bip32@1.7.0 @scure/bip39@1.6.0 @noble/hashes@1.8.0
```

- [ ] **Step 2: Write the spike page**

`apps/web/src/spikes/MeraSpike.tsx`:

```tsx
import { useState } from "react";
import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getEvmAddress,
  getPasskeyPrfOutput,
} from "@category-labs/mera";
import { sha256 } from "@noble/hashes/sha2";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

const VAULT_SALT = sha256(new TextEncoder().encode("blindlaunch.vault.v1"));

function accountFromPrf(prfOutput: Uint8Array): string {
  const seed = mnemonicToSeedSync(entropyToMnemonic(prfOutput, wordlist));
  const node = HDKey.fromMasterSeed(seed).derive("m/44'/60'/0'/0/0");
  if (!node.privateKey) throw new Error("derivation produced no key");
  const session = createSecp256k1SigningSession({ privateKey: node.privateKey });
  const address = getEvmAddress(session.publicKey);
  session.end();
  return address;
}

async function roundTrip(vaultPrf: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey("raw", vaultPrf, "AES-GCM", false, ["encrypt", "decrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode("sealed bid record"));
  const opened = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, sealed);
  return new TextDecoder().decode(opened);
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function MeraSpike() {
  const [lines, setLines] = useState<string[]>([`rpId ${location.hostname}`, `ua ${navigator.userAgent}`]);
  const log = (line: string) => setLines((current) => [...current, line]);

  async function create() {
    try {
      const result = await createPasskeyWithPrfOutput({
        rp: { id: location.hostname, name: "Blindlaunch" },
        user: { name: "spike@blindlaunch", displayName: "Blindlaunch spike" },
      });
      log(`created; account ${accountFromPrf(result.prfOutput)}`);
    } catch (error) {
      log(`create failed: ${String(error)}`);
    }
  }

  async function signIn() {
    try {
      const account = await getPasskeyPrfOutput({ rpId: location.hostname });
      const vault = await getPasskeyPrfOutput({ rpId: location.hostname, prfSalt: VAULT_SALT });
      log(`account ${accountFromPrf(account.prfOutput)}`);
      log(`account prf ${hex(account.prfOutput).slice(0, 16)}…`);
      log(`vault prf ${hex(vault.prfOutput).slice(0, 16)}…`);
      log(`outputs differ: ${hex(account.prfOutput) !== hex(vault.prfOutput)}`);
      log(`vault round trip: ${await roundTrip(vault.prfOutput)}`);
    } catch (error) {
      log(`sign-in failed: ${String(error)}`);
    }
  }

  return (
    <section className="mx-auto max-w-2xl space-y-4 p-6 text-sm">
      <h1 className="text-xl font-semibold">Mera PRF spike</h1>
      <div className="flex gap-3">
        <button className="rounded border px-3 py-2" onClick={() => void create()}>Create passkey</button>
        <button className="rounded border px-3 py-2" onClick={() => void signIn()}>Sign in (two salts)</button>
      </div>
      <pre className="whitespace-pre-wrap break-all rounded border p-3">{lines.join("\n")}</pre>
    </section>
  );
}
```

- [ ] **Step 3: Route it**

In `apps/web/src/App.tsx` add the import after the `TeamDashboard` import:

```tsx
import { MeraSpike } from "./spikes/MeraSpike";
```

and add the route after the `/auction/:id/result` route:

```tsx
          <Route path="/spike/mera" element={<MeraSpike />} />
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @blindlaunch/web typecheck`
Expected: exit 0. If `prfSalt` is rejected, change `VAULT_SALT` to the type the package declares for `prfSalt` (see `node_modules/@category-labs/mera/dist/*.d.ts`) and record the type in `spikes.md`.

- [ ] **Step 5: Run the matrix**

Desktop: `pnpm dev`, open `http://localhost:5173/spike/mera` in Chrome (Google Password Manager), Safari (iCloud Keychain) and with 1Password if available. Press Create, then Sign in.
iPhone: requires HTTPS on a stable hostname. With the owner's approval, deploy a Vercel preview of the branch and open `/spike/mera` in Safari.
Expected per environment: `outputs differ: true`, `vault round trip: sealed bid record`, and the same `account` on every Sign in. Record failures verbatim (for example `PRF_UNAVAILABLE`).

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/src/spikes/MeraSpike.tsx apps/web/src/App.tsx
git commit -m "Add a passkey spike page that derives an account key and a vault key from one passkey."
```

### Task 0.6: Network checks and spike record

**Files:** Create `docs/superpowers/spikes.md`.

- [ ] **Step 1: Check contracts the later phases rely on**

```bash
for RPC in https://testnet-rpc.monad.xyz https://rpc.monad.xyz; do
  echo "== $RPC"
  echo -n "Multicall3 "; cast code 0xcA11bde05977b3631167028862bE2a173976CA11 --rpc-url $RPC | head -c 12; echo
done
echo -n "Kuru Router testnet "; cast code 0x7EFbE105Ca7415dE98F96622173458ac1c054630 --rpc-url https://testnet-rpc.monad.xyz | head -c 12; echo
echo -n "Kuru Router mainnet "; cast code 0xd651346d7c789536ebf06dc72aE3C8502cd695CC --rpc-url https://rpc.monad.xyz | head -c 12; echo
echo -n "USDC mainnet decimals "; cast call 0x754704Bc059F8C67012fEd69BC8A327a5aafb603 "decimals()(uint8)" --rpc-url https://rpc.monad.xyz
```

Expected: each `cast code` prints bytecode starting `0x6080` or similar (not `0x`), USDC decimals `6`. Any `0x` means the address is wrong on that chain; record it.

- [ ] **Step 2: Write `docs/superpowers/spikes.md`**

```markdown
# Spike results (phase 0)

Date run: <fill in when run>

## Kuru (Task 0.4)
- deployProxy from a contract: PASS / FAIL (revert: …)
- Fee parameters accepted: takerFeeBps …, makerFeeBps …
- Deposit for a contract, resting order from a contract: PASS / FAIL
- Unit check: seller received … quote base units for 10 base at 25_000 (expected 25_000_000)
- Decision for MarketSeeder: primary path / fallback path, because …

## Mera (Task 0.5)
| Environment | Create | Sign in | Outputs differ | Vault round trip | Notes |
| --- | --- | --- | --- | --- | --- |
| Chrome desktop, Google Password Manager | | | | | |
| Safari desktop, iCloud Keychain | | | | | |
| iPhone Safari, iCloud Keychain | | | | | |
| 1Password | | | | | |
- prfSalt type accepted by @category-labs/mera 0.2.0: …

## Network (Task 0.6)
- Multicall3 testnet / mainnet: present / absent
- Kuru Router testnet / mainnet: present / absent
- USDC mainnet decimals: …
```

Replace every `…` and `<fill in>` with the observed values before committing.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/spikes.md
git commit -m "Record the Kuru, Mera and network spike results that decide the phase 2 and 3 paths."
```

**Phase 0 exit:** `forge test` and `pnpm typecheck && pnpm test && pnpm build` green locally; `spikes.md` complete with no placeholders. CI green on the branch once the owner approves a push.

---

# Phase 1: Sealed-bid package and v2 contracts

### Task 1.1: Scaffold `@blindlaunch/sealed-bid`

**Files:** Create `packages/sealed-bid/package.json`, `packages/sealed-bid/tsconfig.json`, `packages/sealed-bid/src/index.ts`, `packages/sealed-bid/tests/smoke.test.ts`.

- [ ] **Step 1: Package manifest**

`packages/sealed-bid/package.json`:

```json
{
  "name": "@blindlaunch/sealed-bid",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "vectors": "tsx scripts/vectors.ts"
  },
  "dependencies": {
    "@noble/curves": "1.9.1",
    "viem": "^2.37.5"
  },
  "devDependencies": {
    "@types/node": "^22.20.5",
    "tsx": "^4.23.15",
    "typescript": "^5.9.3",
    "vitest": "^3.2.4"
  }
}
```

`packages/sealed-bid/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "tests", "scripts"]
}
```

`packages/sealed-bid/src/index.ts`:

```ts
export {};
```

`packages/sealed-bid/tests/smoke.test.ts`:

```ts
import { secp256k1 } from "@noble/curves/secp256k1";
import { expect, it } from "vitest";

it("loads the pinned noble curves API", () => {
  expect(typeof secp256k1.ProjectivePoint.BASE.multiply).toBe("function");
});
```

- [ ] **Step 2: Install and run**

Run: `pnpm install && pnpm --filter @blindlaunch/sealed-bid test`
Expected: `Tests 1 passed (1)`.

- [ ] **Step 3: Commit**

```bash
git add packages/sealed-bid pnpm-lock.yaml
git commit -m "Scaffold the sealed-bid package with the pinned curve library."
```

### Task 1.2: Curve helpers

**Files:** Create `packages/sealed-bid/src/curve.ts`, `packages/sealed-bid/tests/curve.test.ts`. Delete `packages/sealed-bid/tests/smoke.test.ts`.

- [ ] **Step 1: Write the failing test**

`packages/sealed-bid/tests/curve.test.ts`:

```ts
import { secp256k1 } from "@noble/curves/secp256k1";
import { describe, expect, it } from "vitest";
import { deterministicRng, G, isValid, mul, mulBase, N, randomScalar } from "../src/curve";

describe("curve", () => {
  it("uses the secp256k1 group order", () => {
    expect(N).toBe(secp256k1.CURVE.n);
  });

  it("puts G on the curve and matches noble for k·G", () => {
    expect(isValid(G)).toBe(true);
    expect(mulBase(123456789n)).toEqual(secp256k1.ProjectivePoint.BASE.multiply(123456789n).toAffine());
  });

  it("satisfies a·(b·G) = (a·b mod n)·G", () => {
    const a = 0xabcdefn;
    const b = 0x123457n;
    expect(mul(mulBase(b), a)).toEqual(mulBase((a * b) % N));
  });

  it("rejects x = 0, x ≥ n and off-curve y", () => {
    expect(isValid({ x: 0n, y: G.y })).toBe(false);
    expect(isValid({ x: N, y: G.y })).toBe(false);
    expect(isValid({ x: G.x, y: G.y + 1n })).toBe(false);
  });

  it("redraws scalars that are 0 or ≥ n", () => {
    const draws = [new Uint8Array(32), new Uint8Array(32).fill(0xff), Uint8Array.from({ length: 32 }, (_, i) => (i === 31 ? 7 : 0))];
    const rng = () => draws.shift() ?? new Uint8Array(32);
    expect(randomScalar(rng)).toBe(7n);
  });

  it("deterministicRng is reproducible and seed-dependent", () => {
    const a = deterministicRng("seed")(48);
    expect(deterministicRng("seed")(48)).toEqual(a);
    expect(deterministicRng("other")(48)).not.toEqual(a);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm --filter @blindlaunch/sealed-bid test`
Expected: FAIL, `Failed to resolve import "../src/curve"`.

- [ ] **Step 3: Implement**

`packages/sealed-bid/src/curve.ts`:

```ts
import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak256, toBytes } from "viem";

export type Point = { x: bigint; y: bigint };
export type Rng = (length: number) => Uint8Array;

/** secp256k1 group order. */
export const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
/** secp256k1 field prime. */
export const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;

const Projective = secp256k1.ProjectivePoint;

export const G: Point = Projective.BASE.toAffine();

export const defaultRng: Rng = (length) => crypto.getRandomValues(new Uint8Array(length));

/** Counter-mode keccak stream. For vectors and tests only, never for real bids. */
export function deterministicRng(seed: string): Rng {
  let counter = 0n;
  let buffer = new Uint8Array(0);
  return (length) => {
    while (buffer.length < length) {
      const block = toBytes(keccak256(toBytes(`${seed}:${counter}`)));
      counter += 1n;
      const next = new Uint8Array(buffer.length + block.length);
      next.set(buffer);
      next.set(block, buffer.length);
      buffer = next;
    }
    const out = buffer.slice(0, length);
    buffer = buffer.slice(length);
    return out;
  };
}

export function mod(value: bigint): bigint {
  const r = value % N;
  return r < 0n ? r + N : r;
}

export function bytesToBigInt(bytes: Uint8Array): bigint {
  let out = 0n;
  for (const byte of bytes) out = (out << 8n) | BigInt(byte);
  return out;
}

export function randomScalar(rng: Rng): bigint {
  for (;;) {
    const k = bytesToBigInt(rng(32));
    if (k > 0n && k < N) return k;
  }
}

export function mulBase(k: bigint): Point {
  return Projective.BASE.multiply(k).toAffine();
}

export function mul(point: Point, k: bigint): Point {
  return Projective.fromAffine(point).multiply(k).toAffine();
}

/** Same rule as `Secp256k1.isValid`: 0 < x < n, 0 < y < p, y² = x³ + 7. */
export function isValid(point: Point): boolean {
  if (point.x <= 0n || point.x >= N || point.y <= 0n || point.y >= P) return false;
  return (point.y * point.y - (point.x ** 3n + 7n)) % P === 0n;
}
```

Delete `packages/sealed-bid/tests/smoke.test.ts`.

- [ ] **Step 4: Run to see it pass**

Run: `pnpm --filter @blindlaunch/sealed-bid test`
Expected: `Tests 6 passed (6)`.

- [ ] **Step 5: Commit**

```bash
git add packages/sealed-bid
git commit -m "Add secp256k1 helpers with the same point rule the contract enforces."
```

### Task 1.3: Bid encoding and commitment

**Files:** Create `packages/sealed-bid/src/bid.ts`, `packages/sealed-bid/tests/bid.test.ts`.

- [ ] **Step 1: Write the failing test**

`packages/sealed-bid/tests/bid.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { BID_LIMIT, commitmentHash, decodeBid, encodeBid, MAX_NONCE, MAX_QUANTITY } from "../src/bid";

describe("bid encoding", () => {
  it("round-trips", () => {
    const bid = { step: 5, quantity: 400n, nonce: 0xdeadbeefn };
    expect(decodeBid(encodeBid(bid))).toEqual(bid);
  });

  it("puts step at bit 224 and quantity at bit 128", () => {
    expect(encodeBid({ step: 1, quantity: 0n, nonce: 0n })).toBe(1n << 224n);
    expect(encodeBid({ step: 0, quantity: 1n, nonce: 0n })).toBe(1n << 128n);
    expect(encodeBid({ step: 255, quantity: MAX_QUANTITY, nonce: MAX_NONCE })).toBe(BID_LIMIT - 1n);
  });

  it("rejects fields out of range", () => {
    expect(() => encodeBid({ step: 256, quantity: 1n, nonce: 0n })).toThrow(RangeError);
    expect(() => encodeBid({ step: -1, quantity: 1n, nonce: 0n })).toThrow(RangeError);
    expect(() => encodeBid({ step: 0, quantity: MAX_QUANTITY + 1n, nonce: 0n })).toThrow(RangeError);
    expect(() => encodeBid({ step: 0, quantity: 1n, nonce: MAX_NONCE + 1n })).toThrow(RangeError);
  });

  it("decodes nothing at or above 2^232", () => {
    expect(decodeBid(BID_LIMIT)).toBeNull();
  });

  it("hashes like keccak256(abi.encode(uint256, address, uint256))", () => {
    // cast keccak $(cast abi-encode "f(uint256,address,uint256)" 1 0x0000000000000000000000000000000000000001 2)
    expect(commitmentHash(1n, "0x0000000000000000000000000000000000000001", 2n)).toBe(
      "0xa80034bdbb8de39fce520a04fa6876dfa52ef6776d880d540d3ad0887abb2032",
    );
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm --filter @blindlaunch/sealed-bid test tests/bid.test.ts`
Expected: FAIL, cannot resolve `../src/bid`.

- [ ] **Step 3: Implement**

`packages/sealed-bid/src/bid.ts`:

```ts
import { encodeAbiParameters, keccak256, type Address, type Hex } from "viem";

export const STEP_SHIFT = 224n;
export const QUANTITY_SHIFT = 128n;
export const MAX_QUANTITY = (1n << 96n) - 1n;
export const MAX_NONCE = (1n << 128n) - 1n;
export const BID_LIMIT = 1n << 232n;

/** `quantity` is in lots; `step` indexes the auction's price ladder. */
export type Bid = { step: number; quantity: bigint; nonce: bigint };

export function encodeBid(bid: Bid): bigint {
  if (!Number.isInteger(bid.step) || bid.step < 0 || bid.step > 255) throw new RangeError("step out of range");
  if (bid.quantity < 0n || bid.quantity > MAX_QUANTITY) throw new RangeError("quantity out of range");
  if (bid.nonce < 0n || bid.nonce > MAX_NONCE) throw new RangeError("nonce out of range");
  return (BigInt(bid.step) << STEP_SHIFT) | (bid.quantity << QUANTITY_SHIFT) | bid.nonce;
}

export function decodeBid(m: bigint): Bid | null {
  if (m < 0n || m >= BID_LIMIT) return null;
  return {
    step: Number(m >> STEP_SHIFT),
    quantity: (m >> QUANTITY_SHIFT) & MAX_QUANTITY,
    nonce: m & MAX_NONCE,
  };
}

/** `keccak256(abi.encode(auctionId, bidder, m))`, the `h` stored at commit. */
export function commitmentHash(auctionId: bigint, bidder: Address, m: bigint): Hex {
  return keccak256(
    encodeAbiParameters([{ type: "uint256" }, { type: "address" }, { type: "uint256" }], [auctionId, bidder, m]),
  );
}
```

- [ ] **Step 4: Run to see it pass**

Run: `pnpm --filter @blindlaunch/sealed-bid test`
Expected: `Tests 11 passed (11)`.

- [ ] **Step 5: Commit**

```bash
git add packages/sealed-bid
git commit -m "Encode bids as one field element and hash them the way the contract does."
```

### Task 1.4: Shamir 2-of-3

**Files:** Create `packages/sealed-bid/src/shamir.ts`, `packages/sealed-bid/tests/shamir.test.ts`.

- [ ] **Step 1: Write the failing test**

`packages/sealed-bid/tests/shamir.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { deterministicRng, N } from "../src/curve";
import { INV2, shamirReconstruct, shamirSplit, type KeeperIndex } from "../src/shamir";

const pairs: [KeeperIndex, KeeperIndex][] = [[0, 1], [0, 2], [1, 2]];

describe("shamir 2-of-3", () => {
  it("INV2 is the inverse of 2 mod n", () => {
    expect((2n * INV2) % N).toBe(1n);
  });

  it("reconstructs from every pair", () => {
    const m = (5n << 224n) | (400n << 128n) | 77n;
    const shares = shamirSplit(m, deterministicRng("split"));
    for (const [a, b] of pairs) {
      expect(shamirReconstruct(a, b, shares[a], shares[b])).toBe(m);
    }
  });

  it("reduces inputs mod n first, as the contract does", () => {
    const shares = shamirSplit(42n, deterministicRng("reduce"));
    expect(shamirReconstruct(0, 1, shares[0] + N, shares[1])).toBe(42n);
  });

  it("uses a fresh slope per split", () => {
    const one = shamirSplit(42n, deterministicRng("one"));
    const two = shamirSplit(42n, deterministicRng("two"));
    expect(one[0]).not.toBe(two[0]);
  });

  it("rejects pairs other than (0,1), (0,2), (1,2)", () => {
    expect(() => shamirReconstruct(1 as KeeperIndex, 0 as KeeperIndex, 1n, 1n)).toThrow(RangeError);
    expect(() => shamirReconstruct(0, 0, 1n, 1n)).toThrow(RangeError);
  });

  it("rejects secrets outside [0, n)", () => {
    expect(() => shamirSplit(N, deterministicRng("x"))).toThrow(RangeError);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm --filter @blindlaunch/sealed-bid test tests/shamir.test.ts`
Expected: FAIL, cannot resolve `../src/shamir`.

- [ ] **Step 3: Implement**

`packages/sealed-bid/src/shamir.ts`:

```ts
import { mod, N, randomScalar, type Rng } from "./curve";

export type KeeperIndex = 0 | 1 | 2;

export const INV2 = (N + 1n) / 2n;

/** f(x) = m + a·x mod n; keeper i gets f(i + 1). */
export function shamirSplit(m: bigint, rng: Rng): [bigint, bigint, bigint] {
  if (m < 0n || m >= N) throw new RangeError("secret out of range");
  const a = randomScalar(rng);
  return [mod(m + a), mod(m + 2n * a), mod(m + 3n * a)];
}

/** Lagrange at 0 with the fixed coefficients `Secp256k1.reconstruct` uses. */
export function shamirReconstruct(a: KeeperIndex, b: KeeperIndex, ya: bigint, yb: bigint): bigint {
  const first = mod(ya);
  const second = mod(yb);
  if (a === 0 && b === 1) return mod(2n * first - second);
  if (a === 0 && b === 2) return mod((3n * first - second) * INV2);
  if (a === 1 && b === 2) return mod(3n * first - 2n * second);
  throw new RangeError("pair must be (0,1), (0,2) or (1,2)");
}
```

- [ ] **Step 4: Run to see it pass**

Run: `pnpm --filter @blindlaunch/sealed-bid test`
Expected: `Tests 17 passed (17)`.

- [ ] **Step 5: Commit**

```bash
git add packages/sealed-bid
git commit -m "Split bids 2-of-3 and reconstruct with the contract's fixed coefficients."
```

### Task 1.5: Seal and open

**Files:** Create `packages/sealed-bid/src/seal.ts`, `packages/sealed-bid/tests/seal.test.ts`.

- [ ] **Step 1: Write the failing test**

`packages/sealed-bid/tests/seal.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { decodeBid } from "../src/bid";
import { deterministicRng, G, mulBase, N } from "../src/curve";
import { openBid, seal, shareKey } from "../src/seal";
import type { KeeperIndex } from "../src/shamir";

const secretKeys = [11n, 22n, 33n] as const;
const keeperKeys = [mulBase(11n), mulBase(22n), mulBase(33n)] as const;
const bidder = "0x00000000000000000000000000000000000000b1" as const;
const pairs: [KeeperIndex, KeeperIndex][] = [[0, 1], [0, 2], [1, 2]];

function sealOne(rngSeed: string) {
  return seal({ auctionId: 7n, bidder, step: 3, quantity: 250n, keeperKeys }, deterministicRng(rngSeed));
}

describe("seal and open", () => {
  it("matches the Solidity share key: keccak256(abi.encodePacked(x, y, uint8 i))", () => {
    // cast keccak $(cast concat-hex $(cast to-uint256 $GX) $(cast to-uint256 $GY) 0x01)
    expect(shareKey(G, 1)).toBe(0xe328175e66eda9cbe0529a0e5053288264e027fbb4751ab5e64a82ffb3a1208bn);
  });

  it("opens with every keeper pair", () => {
    const sealed = sealOne("pairs");
    for (const [a, b] of pairs) {
      const opened = openBid({
        auctionId: 7n, bidder, R: sealed.R, c: sealed.c, h: sealed.h,
        pair: [a, b], secretKeys: [secretKeys[a], secretKeys[b]],
      });
      expect(opened.hashOk).toBe(true);
      expect(opened.m).toBe(sealed.m);
      expect(opened.bid).toEqual(decodeBid(sealed.m));
      expect(opened.bid?.step).toBe(3);
      expect(opened.bid?.quantity).toBe(250n);
    }
  });

  it("keeps the ephemeral x below n so ecrecover accepts it", () => {
    expect(sealOne("rx").R.x < N).toBe(true);
  });

  it("fails the hash check for another bidder", () => {
    const sealed = sealOne("copy");
    const opened = openBid({
      auctionId: 7n, bidder: "0x00000000000000000000000000000000000000b2", R: sealed.R, c: sealed.c, h: sealed.h,
      pair: [0, 1], secretKeys: [secretKeys[0], secretKeys[1]],
    });
    expect(opened.hashOk).toBe(false);
    expect(opened.bid).toBeNull();
  });

  it("fails the hash check when a ciphertext is corrupted", () => {
    const sealed = sealOne("corrupt");
    const c: [bigint, bigint, bigint] = [sealed.c[0], sealed.c[1] ^ 1n, sealed.c[2]];
    const opened = openBid({
      auctionId: 7n, bidder, R: sealed.R, c, h: sealed.h, pair: [0, 1], secretKeys: [secretKeys[0], secretKeys[1]],
    });
    expect(opened.hashOk).toBe(false);
  });

  it("never repeats ciphertexts for the same bid", () => {
    expect(sealOne("a").c[0]).not.toBe(sealOne("b").c[0]);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm --filter @blindlaunch/sealed-bid test tests/seal.test.ts`
Expected: FAIL, cannot resolve `../src/seal`.

- [ ] **Step 3: Implement**

`packages/sealed-bid/src/seal.ts`:

```ts
import { encodePacked, keccak256, type Address, type Hex } from "viem";
import { commitmentHash, decodeBid, encodeBid, type Bid } from "./bid";
import { bytesToBigInt, defaultRng, mul, mulBase, N, randomScalar, type Point, type Rng } from "./curve";
import { shamirReconstruct, shamirSplit, type KeeperIndex } from "./shamir";

export type Ciphertexts = readonly [bigint, bigint, bigint];

export type SealInput = {
  auctionId: bigint;
  bidder: Address;
  step: number;
  quantity: bigint;
  keeperKeys: readonly [Point, Point, Point];
};

/** What `commit` takes (`R`, `c`, `h`) plus the bidder's private record (`m`, `r`). */
export type Sealed = { R: Point; c: [bigint, bigint, bigint]; h: Hex; m: bigint; r: bigint };

export type OpenInput = {
  auctionId: bigint;
  bidder: Address;
  R: Point;
  c: Ciphertexts;
  h: Hex;
  pair: readonly [KeeperIndex, KeeperIndex];
  secretKeys: readonly [bigint, bigint];
};

export type Opened = { m: bigint; hashOk: boolean; bid: Bid | null; shared: [Point, Point] };

/** `keccak256(abi.encodePacked(S.x, S.y, uint8(index)))`. */
export function shareKey(S: Point, index: KeeperIndex): bigint {
  return BigInt(keccak256(encodePacked(["uint256", "uint256", "uint8"], [S.x, S.y, index])));
}

/** `sk·R`, the point an opener passes to `open`. */
export function sharedPoint(secretKey: bigint, R: Point): Point {
  return mul(R, secretKey);
}

export function seal(input: SealInput, rng: Rng = defaultRng): Sealed {
  const nonce = bytesToBigInt(rng(16));
  const m = encodeBid({ step: input.step, quantity: input.quantity, nonce });
  const shares = shamirSplit(m, rng);
  let r = randomScalar(rng);
  let R = mulBase(r);
  while (R.x >= N) {
    r = randomScalar(rng);
    R = mulBase(r);
  }
  const c: [bigint, bigint, bigint] = [
    shares[0] ^ shareKey(mul(input.keeperKeys[0], r), 0),
    shares[1] ^ shareKey(mul(input.keeperKeys[1], r), 1),
    shares[2] ^ shareKey(mul(input.keeperKeys[2], r), 2),
  ];
  return { R, c, h: commitmentHash(input.auctionId, input.bidder, m), m, r };
}

/** Mirrors `BlindAuctionV2._decrypt` and the hash check in `_parse`. */
export function openBid(input: OpenInput): Opened {
  const [a, b] = input.pair;
  const sharedA = sharedPoint(input.secretKeys[0], input.R);
  const sharedB = sharedPoint(input.secretKeys[1], input.R);
  const m = shamirReconstruct(a, b, input.c[a] ^ shareKey(sharedA, a), input.c[b] ^ shareKey(sharedB, b));
  const hashOk = commitmentHash(input.auctionId, input.bidder, m).toLowerCase() === input.h.toLowerCase();
  return { m, hashOk, bid: hashOk ? decodeBid(m) : null, shared: [sharedA, sharedB] };
}
```

- [ ] **Step 4: Run to see it pass**

Run: `pnpm --filter @blindlaunch/sealed-bid test`
Expected: `Tests 23 passed (23)`.

- [ ] **Step 5: Commit**

```bash
git add packages/sealed-bid
git commit -m "Seal bids to three keeper keys and open them exactly as the contract will."
```

### Task 1.6: Clearing mirror

**Files:** Create `packages/sealed-bid/src/clearing.ts`, `packages/sealed-bid/tests/clearing.test.ts`.

- [ ] **Step 1: Write the failing test**

`packages/sealed-bid/tests/clearing.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { allocationOf, isCounted, priceAt, settleOutcome, totalSold, type CountedBid, type Ladder } from "../src/clearing";

const ladder: Ladder = { minPrice: 50n, stepSize: 10n, stepCount: 6, deposit: 1_000_000n, maxNotional: 1_000_000n };

function demand(bids: CountedBid[]): bigint[] {
  const out = Array.from({ length: ladder.stepCount }, () => 0n);
  for (const bid of bids) if (bid.counted) out[bid.step] = (out[bid.step] ?? 0n) + bid.quantity;
  return out;
}

/** v1 UniformClearing: same clearing step, dust to the earliest bids. */
function referenceAllocations(bids: CountedBid[], supply: bigint): bigint[] {
  const counted = bids.filter((bid) => bid.counted);
  if (counted.length === 0) return bids.map(() => 0n);
  let step = 0;
  for (let s = ladder.stepCount - 1; s >= 0; s -= 1) {
    const d = counted.filter((bid) => bid.step >= s).reduce((sum, bid) => sum + bid.quantity, 0n);
    if (d >= supply) { step = s; break; }
  }
  const above = counted.filter((bid) => bid.step > step).reduce((sum, bid) => sum + bid.quantity, 0n);
  const at = bids.map((bid, i) => ({ bid, i })).filter(({ bid }) => bid.counted && bid.step === step);
  const atDemand = at.reduce((sum, { bid }) => sum + bid.quantity, 0n);
  const remaining = supply - above;
  const alloc = bids.map((bid) => (bid.counted && bid.step > step ? bid.quantity : 0n));
  if (atDemand <= remaining) {
    for (const { bid, i } of at) alloc[i] = bid.quantity;
    return alloc;
  }
  let given = 0n;
  for (const { bid, i } of at) { alloc[i] = (remaining * bid.quantity) / atDemand; given += alloc[i] ?? 0n; }
  let dust = remaining - given;
  while (dust > 0n) for (const { bid, i } of at) if (dust > 0n && (alloc[i] ?? 0n) < bid.quantity) { alloc[i] = (alloc[i] ?? 0n) + 1n; dust -= 1n; }
  return alloc;
}

describe("clearing", () => {
  it("prices the ladder", () => {
    expect(priceAt(ladder, 0)).toBe(50n);
    expect(priceAt(ladder, 5)).toBe(100n);
  });

  it("counts only valid bids", () => {
    expect(isCounted({ step: 5, quantity: 10_000n, nonce: 0n }, ladder)).toBe(true);
    expect(isCounted({ step: 6, quantity: 1n, nonce: 0n }, ladder)).toBe(false);
    expect(isCounted({ step: 0, quantity: 0n, nonce: 0n }, ladder)).toBe(false);
    expect(isCounted({ step: 5, quantity: 10_001n, nonce: 0n }, ladder)).toBe(false);
    expect(isCounted(null, ladder)).toBe(false);
    expect(isCounted({ step: 0, quantity: 100n, nonce: 0n }, { ...ladder, maxNotional: 4_999n })).toBe(false);
  });

  it("clears the reference example at 60 with everything sold", () => {
    const bids: CountedBid[] = [
      { counted: true, step: 5, quantity: 400n },
      { counted: true, step: 3, quantity: 300n },
      { counted: true, step: 1, quantity: 500n },
      { counted: true, step: 0, quantity: 400n },
    ];
    const outcome = settleOutcome(demand(bids), 1000n, ladder);
    expect(outcome).toMatchObject({ clearingStep: 1, clearingPrice: 60n, aboveTotal: 700n, remaining: 300n, atDemand: 500n, proRata: true });
    expect(bids.map((bid) => allocationOf(bid, outcome))).toEqual([400n, 300n, 300n, 0n]);
    expect(totalSold(bids, outcome)).toBe(1000n);
  });

  it("sells everything counted at the floor when undersubscribed", () => {
    const bids: CountedBid[] = [{ counted: true, step: 5, quantity: 100n }, { counted: true, step: 0, quantity: 50n }];
    const outcome = settleOutcome(demand(bids), 1000n, ladder);
    expect(outcome).toMatchObject({ clearingStep: 0, clearingPrice: 50n, proRata: false });
    expect(totalSold(bids, outcome)).toBe(150n);
  });

  it("prices nothing when nothing counted", () => {
    const outcome = settleOutcome(demand([]), 1000n, ladder);
    expect(outcome).toMatchObject({ clearingStep: 0, clearingPrice: 0n, atDemand: 0n, proRata: false });
  });

  it("leaves pro-rata dust unsold", () => {
    const bids: CountedBid[] = [4n, 4n, 4n].map((quantity) => ({ counted: true, step: 2, quantity }));
    const outcome = settleOutcome(demand(bids), 10n, ladder);
    expect(bids.map((bid) => allocationOf(bid, outcome))).toEqual([3n, 3n, 3n]);
    expect(totalSold(bids, outcome)).toBe(9n);
  });

  it("matches v1 clearing except for dust on 2,000 random books", () => {
    let seed = 12345;
    const next = (limit: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % limit; };
    for (let run = 0; run < 2000; run += 1) {
      const supply = BigInt(1 + next(3000));
      const bids: CountedBid[] = Array.from({ length: 1 + next(8) }, () => ({ counted: next(5) !== 0, step: next(6), quantity: BigInt(1 + next(2000)) }));
      const outcome = settleOutcome(demand(bids), supply, ladder);
      const reference = referenceAllocations(bids, supply);
      let dust = 0n;
      bids.forEach((bid, i) => {
        const ours = allocationOf(bid, outcome);
        const theirs = reference[i] ?? 0n;
        expect(ours <= theirs && theirs - ours <= 1n).toBe(true);
        dust += theirs - ours;
      });
      expect(totalSold(bids, outcome) + dust).toBe(reference.reduce((sum, value) => sum + value, 0n));
    }
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm --filter @blindlaunch/sealed-bid test tests/clearing.test.ts`
Expected: FAIL, cannot resolve `../src/clearing`.

- [ ] **Step 3: Implement**

`packages/sealed-bid/src/clearing.ts`:

```ts
import type { Bid } from "./bid";

export type Ladder = { minPrice: bigint; stepSize: bigint; stepCount: number; deposit: bigint; maxNotional: bigint };

export type CountedBid = { counted: boolean; step: number; quantity: bigint };

export type Outcome = {
  clearingStep: number;
  clearingPrice: bigint;
  aboveTotal: bigint;
  remaining: bigint;
  atDemand: bigint;
  /** True when `atDemand > remaining`: at-step bids share `remaining` pro rata. */
  proRata: boolean;
};

export function priceAt(ladder: Pick<Ladder, "minPrice" | "stepSize">, step: number): bigint {
  return ladder.minPrice + BigInt(step) * ladder.stepSize;
}

/** Mirrors `BlindAuctionV2._parse` after the hash check. */
export function isCounted(bid: Bid | null, ladder: Ladder): boolean {
  if (!bid || bid.step >= ladder.stepCount || bid.quantity === 0n) return false;
  const notional = priceAt(ladder, bid.step) * bid.quantity;
  return notional <= ladder.deposit && notional <= ladder.maxNotional;
}

/** Mirrors `BlindAuctionV2.settle`. `qtyAtStep` is counted demand in lots per step. */
export function settleOutcome(
  qtyAtStep: readonly bigint[],
  supplyLots: bigint,
  ladder: Pick<Ladder, "minPrice" | "stepSize" | "stepCount">,
): Outcome {
  let above = 0n;
  for (let step = ladder.stepCount - 1; step >= 0; step -= 1) {
    const atStep = qtyAtStep[step] ?? 0n;
    if (above + atStep >= supplyLots) {
      const remaining = supplyLots - above;
      return {
        clearingStep: step,
        clearingPrice: priceAt(ladder, step),
        aboveTotal: above,
        remaining,
        atDemand: atStep,
        proRata: atStep > remaining,
      };
    }
    above += atStep;
  }
  const atDemand = qtyAtStep[0] ?? 0n;
  const aboveTotal = above - atDemand;
  return {
    clearingStep: 0,
    clearingPrice: above === 0n ? 0n : priceAt(ladder, 0),
    aboveTotal,
    remaining: supplyLots - aboveTotal,
    atDemand,
    proRata: false,
  };
}

/** Mirrors `BlindAuctionV2._allocation`. */
export function allocationOf(bid: CountedBid, outcome: Outcome): bigint {
  if (!bid.counted || bid.step < outcome.clearingStep) return 0n;
  if (bid.step > outcome.clearingStep || !outcome.proRata) return bid.quantity;
  return (outcome.remaining * bid.quantity) / outcome.atDemand;
}

export function totalSold(bids: readonly CountedBid[], outcome: Outcome): bigint {
  return bids.reduce((sum, bid) => sum + allocationOf(bid, outcome), 0n);
}
```

- [ ] **Step 4: Run to see it pass**

Run: `pnpm --filter @blindlaunch/sealed-bid test`
Expected: `Tests 30 passed (30)`.

- [ ] **Step 5: Commit**

```bash
git add packages/sealed-bid
git commit -m "Mirror the v2 clearing and lazy allocation, checked against v1 clearing on random books."
```

### Task 1.7: Public exports and parity vectors

**Files:** Modify `packages/sealed-bid/src/index.ts`. Create `packages/sealed-bid/scripts/vectors.ts`, `contracts/test/vectors/sealed-bid.json` (generated). Modify `contracts/foundry.toml`.

- [ ] **Step 1: Exports**

Replace `packages/sealed-bid/src/index.ts` with:

```ts
export * from "./bid";
export * from "./clearing";
export * from "./curve";
export * from "./seal";
export * from "./shamir";
```

- [ ] **Step 2: Vector script**

`packages/sealed-bid/scripts/vectors.ts`:

```ts
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getAddress, keccak256, numberToHex, toBytes } from "viem";
import { deterministicRng, mulBase, randomScalar, seal, sharedPoint, type KeeperIndex } from "../src";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../../../contracts/test/vectors/sealed-bid.json");

type Case = { label: string; pair: [KeeperIndex, KeeperIndex]; step: number; quantity: bigint; corrupt: boolean };

const cases: Case[] = [
  { label: "pair01", pair: [0, 1], step: 3, quantity: 250n, corrupt: false },
  { label: "pair02", pair: [0, 2], step: 0, quantity: 1n, corrupt: false },
  { label: "pair12", pair: [1, 2], step: 63, quantity: 999_999n, corrupt: false },
  { label: "corruptPair01", pair: [0, 1], step: 2, quantity: 10n, corrupt: true },
];

const hex = (value: bigint) => numberToHex(value);

const rows = cases.map((item) => {
  const rng = deterministicRng(`vectors:${item.label}`);
  const secretKeys = [randomScalar(rng), randomScalar(rng), randomScalar(rng)] as const;
  const keeperKeys = [mulBase(secretKeys[0]), mulBase(secretKeys[1]), mulBase(secretKeys[2])] as const;
  const bidder = getAddress(`0x${keccak256(toBytes(item.label)).slice(26)}`);
  const sealed = seal({ auctionId: 1n, bidder, step: item.step, quantity: item.quantity, keeperKeys }, rng);
  const c = item.corrupt ? [sealed.c[0], sealed.c[1] ^ 1n, sealed.c[2]] : sealed.c;
  const shared = secretKeys.map((secretKey) => sharedPoint(secretKey, sealed.R));
  return {
    label: item.label,
    bidder,
    step: hex(BigInt(item.step)),
    quantity: hex(item.quantity),
    m: hex(sealed.m),
    pairA: hex(BigInt(item.pair[0])),
    pairB: hex(BigInt(item.pair[1])),
    secretKeys: secretKeys.map(hex),
    Rx: hex(sealed.R.x),
    Ry: hex(sealed.R.y),
    c: c.map(hex),
    h: sealed.h,
    Sx: shared.map((point) => hex(point.x)),
    Sy: shared.map((point) => hex(point.y)),
    counted: !item.corrupt,
  };
});

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify({ count: rows.length, cases: rows }, null, 2)}\n`);
console.log(`wrote ${rows.length} cases to ${out}`);
```

- [ ] **Step 3: Generate**

Run: `pnpm --filter @blindlaunch/sealed-bid vectors`
Expected: `wrote 4 cases to …/contracts/test/vectors/sealed-bid.json`. Run it twice and confirm `git diff --stat contracts/test/vectors` shows no change after the second run (deterministic).

- [ ] **Step 4: Let Foundry read the vectors and set fuzz runs**

Append to `contracts/foundry.toml` under `[profile.default]` (after `ffi = false`):

```toml
fs_permissions = [{ access = "read", path = "./test/vectors" }]

[fuzz]
runs = 256
```

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm --filter @blindlaunch/sealed-bid typecheck`
Expected: exit 0.

```bash
git add packages/sealed-bid contracts/test/vectors contracts/foundry.toml
git commit -m "Export the sealed-bid API and generate deterministic parity vectors for Foundry."
```

### Task 1.8: Token contracts

**Files:** Create `contracts/src/IERC20.sol`, `contracts/src/ERC20.sol`, `contracts/src/TestToken.sol`, `contracts/src/LaunchToken.sol`, `contracts/src/TokenFactory.sol`, `contracts/test/v2/Tokens.t.sol`.

- [ ] **Step 1: Write the failing test**

`contracts/test/v2/Tokens.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "../../src/ERC20.sol";
import {LaunchToken} from "../../src/LaunchToken.sol";
import {TestToken} from "../../src/TestToken.sol";
import {TokenFactory} from "../../src/TokenFactory.sol";

contract TokensTest is Test {
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event TokenCreated(
        address indexed token, address indexed creator, string name, string symbol, uint8 decimals, uint256 supply
    );

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function test_testTokenMetadataAndMint() public {
        TestToken token = new TestToken("Blindlaunch USD", "tUSD", 6);
        assertEq(token.name(), "Blindlaunch USD");
        assertEq(token.symbol(), "tUSD");
        assertEq(token.decimals(), 6);
        vm.expectEmit(address(token));
        emit Transfer(address(0), alice, 5e6);
        token.mint(alice, 5e6);
        assertEq(token.balanceOf(alice), 5e6);
        assertEq(token.totalSupply(), 5e6);
    }

    function test_transferFromSpendsAllowanceExceptMax() public {
        TestToken token = new TestToken("T", "T", 18);
        token.mint(alice, 100);
        vm.prank(alice);
        vm.expectEmit(address(token));
        emit Approval(alice, bob, 60);
        token.approve(bob, 60);
        vm.prank(bob);
        token.transferFrom(alice, bob, 40);
        assertEq(token.allowance(alice, bob), 20);
        vm.prank(alice);
        token.approve(bob, type(uint256).max);
        vm.prank(bob);
        token.transferFrom(alice, bob, 10);
        assertEq(token.allowance(alice, bob), type(uint256).max);
        assertEq(token.balanceOf(bob), 50);
    }

    function test_transferBeyondBalanceReverts() public {
        TestToken token = new TestToken("T", "T", 18);
        vm.prank(alice);
        vm.expectRevert();
        token.transfer(bob, 1);
    }

    function test_launchTokenMintsFixedSupplyOnce() public {
        LaunchToken token = new LaunchToken("Moon", "MOON", 18, 1_000_000e18, alice);
        assertEq(token.balanceOf(alice), 1_000_000e18);
        assertEq(token.totalSupply(), 1_000_000e18);
        assertEq(token.decimals(), 18);
        (bool ok,) = address(token).call(abi.encodeWithSignature("mint(address,uint256)", bob, 1));
        assertFalse(ok, "LaunchToken has no mint");
    }

    function test_factoryCreatesAndAnnounces() public {
        TokenFactory factory = new TokenFactory();
        vm.recordLogs();
        vm.prank(alice);
        address token = factory.createToken("Moon", "MOON", 18, 1e24, alice);
        assertEq(ERC20(token).balanceOf(alice), 1e24);
        assertEq(ERC20(token).name(), "Moon");
        assertEq(ERC20(token).symbol(), "MOON");
        Vm.Log[] memory logs = vm.getRecordedLogs();
        Vm.Log memory created = logs[logs.length - 1];
        assertEq(created.topics[0], TokenCreated.selector);
        assertEq(address(uint160(uint256(created.topics[1]))), token);
        assertEq(address(uint160(uint256(created.topics[2]))), alice);
    }

    function test_factoryRejectsBadInput() public {
        TokenFactory factory = new TokenFactory();
        vm.expectRevert(TokenFactory.BadToken.selector);
        factory.createToken("", "MOON", 18, 1, alice);
        vm.expectRevert(TokenFactory.BadToken.selector);
        factory.createToken("Moon", "", 18, 1, alice);
        vm.expectRevert(TokenFactory.BadToken.selector);
        factory.createToken("Moon", "ABCDEFGHIJKLMNOPQ", 18, 1, alice);
        vm.expectRevert(TokenFactory.BadToken.selector);
        factory.createToken("Moon", "MOON", 37, 1, alice);
        vm.expectRevert(TokenFactory.BadToken.selector);
        factory.createToken("Moon", "MOON", 18, 0, alice);
        vm.expectRevert(TokenFactory.BadToken.selector);
        factory.createToken("Moon", "MOON", 18, 1, address(0));
    }
}
```

Add `import {Vm} from "forge-std/Vm.sol";` after the `Test` import.

- [ ] **Step 2: Run to see it fail**

Run: `cd contracts && forge test --match-path test/v2/Tokens.t.sol; cd ..`
Expected: compilation error, `Source "../../src/ERC20.sol" not found`.

- [ ] **Step 3: Implement**

`contracts/src/IERC20.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice The ERC-20 surface the v2 contracts use.
interface IERC20 {
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}
```

`contracts/src/ERC20.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Minimal ERC-20 with standard events. A max allowance is never spent.
abstract contract ERC20 {
    string public name;
    string public symbol;
    uint8 public immutable decimals;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory name_, string memory symbol_, uint8 decimals_) {
        name = name_;
        symbol = symbol_;
        decimals = decimals_;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }

    function _mint(address to, uint256 amount) internal {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }
}
```

`contracts/src/TestToken.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "./ERC20.sol";

/// @notice Public-mint token for Monad testnet. Anyone can mint.
///         Never deploy to mainnet and never treat it as an asset with value.
contract TestToken is ERC20 {
    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_, decimals_) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
```

`contracts/src/LaunchToken.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "./ERC20.sol";

/// @notice Fixed-supply token created by `TokenFactory`. The whole supply is minted once.
contract LaunchToken is ERC20 {
    constructor(string memory name_, string memory symbol_, uint8 decimals_, uint256 supply, address to)
        ERC20(name_, symbol_, decimals_)
    {
        _mint(to, supply);
    }
}
```

`contracts/src/TokenFactory.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {LaunchToken} from "./LaunchToken.sol";

/// @notice Deploys fixed-supply launch tokens so a team can create a token and its auction from one page.
contract TokenFactory {
    error BadToken();

    event TokenCreated(
        address indexed token, address indexed creator, string name, string symbol, uint8 decimals, uint256 supply
    );

    function createToken(string calldata name, string calldata symbol, uint8 decimals, uint256 supply, address to)
        external
        returns (address token)
    {
        uint256 nameLength = bytes(name).length;
        uint256 symbolLength = bytes(symbol).length;
        if (nameLength == 0 || nameLength > 64 || symbolLength == 0 || symbolLength > 16) revert BadToken();
        if (decimals > 36 || supply == 0 || to == address(0)) revert BadToken();
        token = address(new LaunchToken(name, symbol, decimals, supply, to));
        emit TokenCreated(token, msg.sender, name, symbol, decimals, supply);
    }
}
```

- [ ] **Step 4: Run to see it pass**

Run: `cd contracts && forge test --match-path test/v2/Tokens.t.sol; cd ..`
Expected: `6 tests passed`.

- [ ] **Step 5: Commit**

```bash
git add contracts/src/IERC20.sol contracts/src/ERC20.sol contracts/src/TestToken.sol contracts/src/LaunchToken.sol contracts/src/TokenFactory.sol contracts/test/v2/Tokens.t.sol
git commit -m "Add v2 tokens with events and decimals, and a factory for new launch tokens."
```

### Task 1.9: `Secp256k1` library

**Files:** Create `contracts/src/Secp256k1.sol`, `contracts/test/v2/Mocks.sol` (harness only for now), `contracts/test/v2/Secp256k1.t.sol`.

- [ ] **Step 1: Write the failing test**

`contracts/test/v2/Mocks.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Secp256k1} from "../../src/Secp256k1.sol";

contract Secp256k1Harness {
    function isValid(Secp256k1.Point memory p) external pure returns (bool) {
        return Secp256k1.isValid(p);
    }

    function mulEquals(Secp256k1.Point memory p, uint256 k, Secp256k1.Point memory q) external pure returns (bool) {
        return Secp256k1.mulEquals(p, k, q);
    }

    function reconstruct(uint8 a, uint8 b, uint256 ya, uint256 yb) external pure returns (uint256) {
        return Secp256k1.reconstruct(a, b, ya, yb);
    }

    function shareKey(Secp256k1.Point memory s, uint8 index) external pure returns (uint256) {
        return Secp256k1.shareKey(s, index);
    }
}
```

`contracts/test/v2/Secp256k1.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {Secp256k1} from "../../src/Secp256k1.sol";
import {Secp256k1Harness} from "./Mocks.sol";

contract Secp256k1Test is Test {
    uint256 internal constant N = Secp256k1.N;
    Secp256k1Harness internal lib;

    function setUp() public {
        lib = new Secp256k1Harness();
    }

    function _pub(uint256 k) internal returns (Secp256k1.Point memory) {
        Vm.Wallet memory wallet = vm.createWallet(k);
        return Secp256k1.Point(wallet.publicKeyX, wallet.publicKeyY);
    }

    function test_constantsMatchTheCurve() public pure {
        assertEq(Secp256k1.P, type(uint256).max - (2 ** 32) - 976, "p = 2^256 - 2^32 - 977");
        assertEq(mulmod(2, Secp256k1.INV2, N), 1, "INV2 * 2 = 1 mod n");
    }

    function test_generatorIsValid() public view {
        assertTrue(lib.isValid(Secp256k1.generator()));
    }

    function test_rejectsBadPoints() public view {
        Secp256k1.Point memory g = Secp256k1.generator();
        assertFalse(lib.isValid(Secp256k1.Point(0, g.y)));
        assertFalse(lib.isValid(Secp256k1.Point(N, g.y)));
        assertFalse(lib.isValid(Secp256k1.Point(g.x, g.y + 1)));
        assertFalse(lib.isValid(Secp256k1.Point(g.x, 0)));
        assertFalse(lib.isValid(Secp256k1.Point(g.x, Secp256k1.P)));
    }

    function testFuzz_mulEqualsOnGenerator(uint256 k) public {
        k = bound(k, 1, N - 1);
        assertTrue(lib.mulEquals(Secp256k1.generator(), k, _pub(k)));
        assertFalse(lib.mulEquals(Secp256k1.generator(), k, _pub(k == N - 1 ? 1 : k + 1)));
    }

    function testFuzz_mulEqualsOnEphemeral(uint256 r, uint256 sk) public {
        r = bound(r, 1, N - 1);
        sk = bound(sk, 1, N - 1);
        Secp256k1.Point memory ephemeral = _pub(r);
        vm.assume(ephemeral.x < N);
        assertTrue(lib.mulEquals(ephemeral, sk, _pub(mulmod(r, sk, N))));
    }

    function test_mulEqualsRejectsZeroAndOrder() public {
        Secp256k1.Point memory g = Secp256k1.generator();
        assertFalse(lib.mulEquals(g, 0, _pub(1)));
        assertFalse(lib.mulEquals(g, N, _pub(1)));
    }

    function testFuzz_reconstructsFromEveryPair(uint256 m, uint256 slope) public view {
        m = bound(m, 0, N - 1);
        slope = bound(slope, 1, N - 1);
        uint256 y0 = addmod(m, slope, N);
        uint256 y1 = addmod(m, mulmod(slope, 2, N), N);
        uint256 y2 = addmod(m, mulmod(slope, 3, N), N);
        assertEq(lib.reconstruct(0, 1, y0, y1), m);
        assertEq(lib.reconstruct(0, 2, y0, y2), m);
        assertEq(lib.reconstruct(1, 2, y1, y2), m);
    }

    function test_reconstructReducesInputsAboveN() public view {
        uint256 slope = 5;
        uint256 y0 = addmod(42, slope, N);
        uint256 y1 = addmod(42, 2 * slope, N);
        assertEq(lib.reconstruct(0, 1, y0 + N, y1), 42);
    }

    function test_reconstructRejectsOtherPairs() public {
        vm.expectRevert(Secp256k1.BadPair.selector);
        lib.reconstruct(1, 0, 1, 1);
        vm.expectRevert(Secp256k1.BadPair.selector);
        lib.reconstruct(0, 0, 1, 1);
        vm.expectRevert(Secp256k1.BadPair.selector);
        lib.reconstruct(2, 3, 1, 1);
    }

    function test_shareKeyMatchesTypeScript() public view {
        // Same constant as packages/sealed-bid/tests/seal.test.ts
        assertEq(lib.shareKey(Secp256k1.generator(), 1), 0xe328175e66eda9cbe0529a0e5053288264e027fbb4751ab5e64a82ffb3a1208b);
    }
}
```

- [ ] **Step 2: Run to see it fail**

Run: `cd contracts && forge test --match-path test/v2/Secp256k1.t.sol; cd ..`
Expected: compilation error, `Source "../../src/Secp256k1.sol" not found`.

- [ ] **Step 3: Implement**

`contracts/src/Secp256k1.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title Secp256k1
/// @notice The curve operations BlindAuctionV2 needs, without on-chain point multiplication.
///
/// `mulEquals(P, k, Q)` checks `Q == k·P` with one ecrecover call:
/// ecrecover(0, v, P.x, k·P.x mod n) recovers `(P.x)^-1 · (k·P.x) · P = k·P`
/// and returns its address, which is compared to the address of `Q`.
/// See ethresear.ch/t/you-can-kinda-abuse-ecrecover-to-do-ecmul-in-secp256k1-today/2384.
/// Callers must only pass points that satisfy `isValid`.
library Secp256k1 {
    error BadPair();

    struct Point {
        uint256 x;
        uint256 y;
    }

    uint256 internal constant P = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F;
    uint256 internal constant N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;
    uint256 internal constant GX = 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798;
    uint256 internal constant GY = 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8;
    /// @dev Inverse of 2 modulo N.
    uint256 internal constant INV2 = 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A1;

    function generator() internal pure returns (Point memory) {
        return Point(GX, GY);
    }

    /// @dev 0 < x < N (ecrecover needs r < N), 0 < y < P, and y² = x³ + 7.
    function isValid(Point memory p) internal pure returns (bool) {
        if (p.x == 0 || p.x >= N || p.y == 0 || p.y >= P) return false;
        return mulmod(p.y, p.y, P) == addmod(mulmod(mulmod(p.x, p.x, P), p.x, P), 7, P);
    }

    function toAddress(Point memory q) internal pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(q.x, q.y)))));
    }

    function mulEquals(Point memory p, uint256 k, Point memory q) internal pure returns (bool) {
        if (k == 0 || k >= N) return false;
        uint8 v = (p.y & 1) == 0 ? 27 : 28;
        address recovered = ecrecover(bytes32(0), v, bytes32(p.x), bytes32(mulmod(k, p.x, N)));
        return recovered != address(0) && recovered == toAddress(q);
    }

    /// @dev Lagrange interpolation at 0 for shares at x = a+1 and x = b+1.
    function reconstruct(uint8 a, uint8 b, uint256 ya, uint256 yb) internal pure returns (uint256) {
        ya %= N;
        yb %= N;
        if (a == 0 && b == 1) return addmod(mulmod(2, ya, N), N - yb, N);
        if (a == 0 && b == 2) return mulmod(addmod(mulmod(3, ya, N), N - yb, N), INV2, N);
        if (a == 1 && b == 2) return addmod(mulmod(3, ya, N), N - mulmod(2, yb, N), N);
        revert BadPair();
    }

    function shareKey(Point memory s, uint8 index) internal pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(s.x, s.y, index)));
    }
}
```

- [ ] **Step 4: Run to see it pass**

Run: `cd contracts && forge test --match-path test/v2/Secp256k1.t.sol; cd ..`
Expected: `10 tests passed` (fuzz tests at 256 runs each).

- [ ] **Step 5: Verify the INV2 literal independently**

Run: `cast to-hex $(python3 -c "N=0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141; print((N+1)//2)")`
Expected: `0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a1`.

- [ ] **Step 6: Commit**

```bash
git add contracts/src/Secp256k1.sol contracts/test/v2/Mocks.sol contracts/test/v2/Secp256k1.t.sol
git commit -m "Verify secp256k1 scalar products with ecrecover and reconstruct 2-of-3 shares on chain."
```

### Task 1.10: `KeeperRegistry`

**Files:** Create `contracts/src/KeeperRegistry.sol`, `contracts/test/v2/KeeperRegistry.t.sol`.

- [ ] **Step 1: Write the failing test**

`contracts/test/v2/KeeperRegistry.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {KeeperRegistry} from "../../src/KeeperRegistry.sol";
import {Secp256k1} from "../../src/Secp256k1.sol";

contract KeeperRegistryTest is Test {
    event KeysEnqueued(uint8 indexed keeper, uint256 count);
    event KeyConsumed(uint8 indexed keeper, uint256 indexed auctionId, uint256 x, uint256 y);

    KeeperRegistry internal registry;
    address[3] internal owners;
    address internal auction = makeAddr("auction");

    function setUp() public {
        owners = [makeAddr("k0"), makeAddr("k1"), makeAddr("k2")];
        registry = new KeeperRegistry(owners);
        registry.setAuction(auction);
    }

    function _keys(uint256 first, uint256 count) internal returns (Secp256k1.Point[] memory keys) {
        keys = new Secp256k1.Point[](count);
        for (uint256 i = 0; i < count; ++i) {
            Vm.Wallet memory wallet = vm.createWallet(first + i);
            keys[i] = Secp256k1.Point(wallet.publicKeyX, wallet.publicKeyY);
        }
    }

    function test_enqueueAndConsumeFifo() public {
        Secp256k1.Point[] memory keys = _keys(100, 2);
        vm.prank(owners[1]);
        vm.expectEmit(address(registry));
        emit KeysEnqueued(1, 2);
        registry.enqueue(1, keys);
        assertEq(registry.available(1), 2);

        vm.prank(auction);
        vm.expectEmit(address(registry));
        emit KeyConsumed(1, 7, keys[0].x, keys[0].y);
        Secp256k1.Point memory got = registry.consume(1, 7);
        assertEq(got.x, keys[0].x);
        assertEq(registry.available(1), 1);

        vm.prank(auction);
        got = registry.consume(1, 8);
        assertEq(got.x, keys[1].x);
        assertEq(registry.available(1), 0);
    }

    function test_onlyOwnerEnqueues() public {
        Secp256k1.Point[] memory keys = _keys(100, 1);
        vm.prank(owners[0]);
        vm.expectRevert(KeeperRegistry.NotKeeper.selector);
        registry.enqueue(1, keys);
    }

    function test_rejectsBadIndexAndBadPoint() public {
        vm.prank(owners[0]);
        vm.expectRevert(KeeperRegistry.BadKeeper.selector);
        registry.enqueue(3, _keys(100, 1));

        Secp256k1.Point[] memory bad = new Secp256k1.Point[](1);
        bad[0] = Secp256k1.Point(1, 1);
        vm.prank(owners[0]);
        vm.expectRevert(KeeperRegistry.BadPoint.selector);
        registry.enqueue(0, bad);
    }

    function test_onlyAuctionConsumes() public {
        vm.prank(owners[0]);
        registry.enqueue(0, _keys(100, 1));
        vm.expectRevert(KeeperRegistry.NotAuction.selector);
        registry.consume(0, 1);
    }

    function test_consumeFromEmptyQueueReverts() public {
        vm.prank(auction);
        vm.expectRevert(KeeperRegistry.NoKeeperKeys.selector);
        registry.consume(2, 1);
    }

    function test_setAuctionOnceByDeployer() public {
        KeeperRegistry fresh = new KeeperRegistry(owners);
        vm.prank(owners[0]);
        vm.expectRevert(KeeperRegistry.NotDeployer.selector);
        fresh.setAuction(auction);
        fresh.setAuction(auction);
        vm.expectRevert(KeeperRegistry.AuctionAlreadySet.selector);
        fresh.setAuction(auction);
    }

    function test_ownerRotation() public {
        address next = makeAddr("k0-next");
        vm.prank(owners[0]);
        registry.setOwner(0, next);
        vm.prank(owners[0]);
        vm.expectRevert(KeeperRegistry.NotKeeper.selector);
        registry.enqueue(0, _keys(100, 1));
        vm.prank(next);
        registry.enqueue(0, _keys(100, 1));
        assertEq(registry.available(0), 1);
    }
}
```

- [ ] **Step 2: Run to see it fail**

Run: `cd contracts && forge test --match-path test/v2/KeeperRegistry.t.sol; cd ..`
Expected: compilation error, `KeeperRegistry.sol` not found.

- [ ] **Step 3: Implement**

`contracts/src/KeeperRegistry.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Secp256k1} from "./Secp256k1.sol";

/// @title KeeperRegistry
/// @notice Three keepers each keep a FIFO queue of fresh public keys. Every new auction
///         consumes one key per keeper, so publishing a key for one auction reveals
///         nothing about any other auction.
contract KeeperRegistry {
    error NotKeeper();
    error BadKeeper();
    error BadPoint();
    error NotAuction();
    error NotDeployer();
    error AuctionAlreadySet();
    error NoKeeperKeys();

    event KeysEnqueued(uint8 indexed keeper, uint256 count);
    event KeyConsumed(uint8 indexed keeper, uint256 indexed auctionId, uint256 x, uint256 y);
    event OwnerChanged(uint8 indexed keeper, address owner);
    event AuctionSet(address auction);

    address public immutable deployer;
    address public auction;
    address[3] public owners;

    mapping(uint8 => Secp256k1.Point[]) internal _queue;
    mapping(uint8 => uint256) public head;

    constructor(address[3] memory owners_) {
        deployer = msg.sender;
        owners = owners_;
    }

    function setAuction(address auction_) external {
        if (msg.sender != deployer) revert NotDeployer();
        if (auction != address(0)) revert AuctionAlreadySet();
        auction = auction_;
        emit AuctionSet(auction_);
    }

    function setOwner(uint8 keeper, address owner) external {
        if (keeper > 2) revert BadKeeper();
        if (msg.sender != owners[keeper]) revert NotKeeper();
        owners[keeper] = owner;
        emit OwnerChanged(keeper, owner);
    }

    function enqueue(uint8 keeper, Secp256k1.Point[] calldata keys) external {
        if (keeper > 2) revert BadKeeper();
        if (msg.sender != owners[keeper]) revert NotKeeper();
        Secp256k1.Point[] storage queue = _queue[keeper];
        for (uint256 i = 0; i < keys.length; ++i) {
            Secp256k1.Point memory key = keys[i];
            if (!Secp256k1.isValid(key)) revert BadPoint();
            queue.push(key);
        }
        emit KeysEnqueued(keeper, keys.length);
    }

    function available(uint8 keeper) external view returns (uint256) {
        return _queue[keeper].length - head[keeper];
    }

    function consume(uint8 keeper, uint256 auctionId) external returns (Secp256k1.Point memory key) {
        if (msg.sender != auction) revert NotAuction();
        uint256 next = head[keeper];
        if (next >= _queue[keeper].length) revert NoKeeperKeys();
        key = _queue[keeper][next];
        head[keeper] = next + 1;
        emit KeyConsumed(keeper, auctionId, key.x, key.y);
    }
}
```

- [ ] **Step 4: Run to see it pass**

Run: `cd contracts && forge test --match-path test/v2/KeeperRegistry.t.sol; cd ..`
Expected: `7 tests passed`.

- [ ] **Step 5: Commit**

```bash
git add contracts/src/KeeperRegistry.sol contracts/test/v2/KeeperRegistry.t.sol
git commit -m "Queue fresh keeper keys so every auction gets its own three public keys."
```

### Task 1.11: Seeder interface and the auction skeleton with `createAuction`

**Files:** Create `contracts/src/IMarketSeeder.sol`, `contracts/src/BlindAuctionV2.sol`, `contracts/test/v2/V2Base.sol`, `contracts/test/v2/Create.t.sol`. Modify `contracts/test/v2/Mocks.sol`.

- [ ] **Step 1: Seeder interface**

`contracts/src/IMarketSeeder.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice What BlindAuctionV2 needs from a market seeder.
///         `validate` runs at auction creation and must revert on unusable parameters.
///         `accept` pulls exactly the approved amounts with transferFrom and records them.
///         `seed` creates the market and posts the orders; it may be retried by anyone.
interface IMarketSeeder {
    struct SeedConfig {
        address saleToken;
        address quoteToken;
        uint256 lotSize;
        uint256 minPrice;
        uint256 stepSize;
        uint32 stepCount;
        bytes kuruParams;
    }

    struct SeedOrder {
        uint256 auctionId;
        address authority;
        address saleToken;
        address quoteToken;
        uint256 saleAmount;
        uint256 quoteAmount;
        uint256 clearingPrice;
        uint256 lotSize;
        uint64 lockUntil;
        bytes kuruParams;
    }

    function validate(SeedConfig calldata config) external view;
    function accept(SeedOrder calldata order) external;
    function seed(uint256 auctionId) external;
}
```

- [ ] **Step 2: Mock seeders and hostile tokens**

Append to `contracts/test/v2/Mocks.sol` (and add the imports at the top of the file, under the existing `Secp256k1` import):

```solidity
import {IERC20} from "../../src/IERC20.sol";
import {IMarketSeeder} from "../../src/IMarketSeeder.sol";
import {UniformClearing} from "../../src/UniformClearing.sol";
```

```solidity
contract MockSeeder is IMarketSeeder {
    bool public rejectConfig;
    bool public revertSeed;
    uint256 public seedCalls;
    uint256 public lastSale;
    uint256 public lastQuote;
    uint256 public lastPrice;
    uint64 public lastLockUntil;

    function setRejectConfig(bool value) external {
        rejectConfig = value;
    }

    function setRevertSeed(bool value) external {
        revertSeed = value;
    }

    function validate(SeedConfig calldata) external view {
        require(!rejectConfig, "config");
    }

    function accept(SeedOrder calldata order) external virtual {
        IERC20(order.saleToken).transferFrom(msg.sender, address(this), order.saleAmount);
        IERC20(order.quoteToken).transferFrom(msg.sender, address(this), order.quoteAmount);
        lastSale = order.saleAmount;
        lastQuote = order.quoteAmount;
        lastPrice = order.clearingPrice;
        lastLockUntil = order.lockUntil;
    }

    function seed(uint256) external {
        require(!revertSeed, "seed");
        seedCalls += 1;
    }
}

contract RevertingAcceptSeeder is MockSeeder {
    function accept(SeedOrder calldata) external pure override {
        revert("accept");
    }
}

contract GreedySeeder is MockSeeder {
    function accept(SeedOrder calldata order) external override {
        IERC20(order.quoteToken).transferFrom(msg.sender, address(this), order.quoteAmount + 1);
    }
}

contract FeeOnTransferToken {
    uint8 public constant decimals = 0;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount - 1;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount - 1;
        return true;
    }
}

/// @dev On `transfer`, calls back into `target` once with `data` and records whether that call succeeded.
contract ReentrantToken {
    uint8 public constant decimals = 0;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    address public target;
    bytes public data;
    bool public reentered;
    bool public reentryOk;
    bytes public reentryError;

    function arm(address target_, bytes calldata data_) external {
        target = target_;
        data = data_;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        if (target != address(0) && !reentered) {
            reentered = true;
            (reentryOk, reentryError) = target.call(data);
        }
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract ClearingHarness {
    function clear(uint256 supply, uint256 minPrice, uint256 stepSize, uint32 stepCount, UniformClearing.Bid[] memory bids)
        external
        pure
        returns (UniformClearing.Outcome memory outcome, UniformClearing.Bid[] memory allocated)
    {
        outcome = UniformClearing.clear(supply, minPrice, stepSize, stepCount, bids);
        allocated = bids;
    }
}
```

- [ ] **Step 3: Shared fixture**

`contracts/test/v2/V2Base.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {BlindAuctionV2} from "../../src/BlindAuctionV2.sol";
import {KeeperRegistry} from "../../src/KeeperRegistry.sol";
import {Secp256k1} from "../../src/Secp256k1.sol";
import {TestToken} from "../../src/TestToken.sol";

abstract contract V2Base is Test {
    uint256 internal constant N = Secp256k1.N;
    uint256 internal constant START = 1_700_000_000;
    uint256 internal constant DEPOSIT = 1_000_000;

    struct Sealed {
        Secp256k1.Point ephemeral;
        uint256[3] c;
        bytes32 h;
        Secp256k1.Point[3] shared;
        uint256 m;
    }

    BlindAuctionV2 internal auction;
    KeeperRegistry internal registry;
    TestToken internal sale;
    TestToken internal quote;

    address internal authority = makeAddr("authority");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal cara = makeAddr("cara");
    address internal dan = makeAddr("dan");
    address[3] internal keeperOwners;

    uint256 internal keyNonce = 1;
    mapping(uint256 => uint256[3]) internal secretsOf;
    mapping(uint256 => mapping(uint32 => Sealed)) internal sealedOf;

    function setUp() public virtual {
        vm.warp(START);
        _deploy();
    }

    function _deploy() internal {
        keeperOwners = [makeAddr("keeper0"), makeAddr("keeper1"), makeAddr("keeper2")];
        registry = new KeeperRegistry(keeperOwners);
        auction = new BlindAuctionV2(registry);
        registry.setAuction(address(auction));
        sale = new TestToken("Sale", "SALE", 0);
        quote = new TestToken("Quote", "QUOTE", 0);
        sale.mint(authority, 10_000_000);
        vm.prank(authority);
        sale.approve(address(auction), type(uint256).max);
    }

    function _pub(uint256 k) internal returns (Secp256k1.Point memory) {
        Vm.Wallet memory wallet = vm.createWallet(k);
        return Secp256k1.Point(wallet.publicKeyX, wallet.publicKeyY);
    }

    function _scalar(bytes32 seed) internal pure returns (uint256) {
        return (uint256(seed) % (N - 1)) + 1;
    }

    function _enqueueKeys() internal returns (uint256[3] memory secretKeys) {
        for (uint8 i = 0; i < 3; ++i) {
            secretKeys[i] = _scalar(keccak256(abi.encode("keeper", i, keyNonce++)));
            Secp256k1.Point[] memory keys = new Secp256k1.Point[](1);
            keys[0] = _pub(secretKeys[i]);
            vm.prank(keeperOwners[i]);
            registry.enqueue(i, keys);
        }
    }

    function _params() internal view returns (BlindAuctionV2.CreateParams memory p) {
        p.saleToken = address(sale);
        p.quoteToken = address(quote);
        p.supply = 1000;
        p.lotSize = 1;
        p.minPrice = 50;
        p.stepSize = 10;
        p.stepCount = 6;
        p.deposit = DEPOSIT;
        p.maxNotional = DEPOSIT;
        p.maxBids = 10_000;
        p.commitStart = uint64(block.timestamp);
        p.commitDeadline = uint64(block.timestamp + 1 hours);
        p.cancelAfter = uint64(block.timestamp + 2 hours);
    }

    function _create(BlindAuctionV2.CreateParams memory p) internal returns (uint256 id) {
        uint256[3] memory secretKeys = _enqueueKeys();
        vm.prank(authority);
        id = auction.createAuction(p);
        secretsOf[id] = secretKeys;
    }

    function _create() internal returns (uint256) {
        return _create(_params());
    }

    function _sealRaw(uint256 id, address bidder, uint256 m) internal returns (Sealed memory s) {
        s.m = m;
        uint256 slope = _scalar(keccak256(abi.encode("slope", id, bidder, m)));
        uint256 r = _scalar(keccak256(abi.encode("ephemeral", id, bidder, m)));
        s.ephemeral = _pub(r);
        while (s.ephemeral.x >= N) {
            r = addmod(r, 1, N);
            s.ephemeral = _pub(r);
        }
        uint256[3] memory secretKeys = secretsOf[id];
        for (uint256 i = 0; i < 3; ++i) {
            uint256 share = addmod(m, mulmod(slope, i + 1, N), N);
            s.shared[i] = _pub(mulmod(r, secretKeys[i], N));
            s.c[i] = share ^ Secp256k1.shareKey(s.shared[i], uint8(i));
        }
        s.h = keccak256(abi.encode(id, bidder, m));
    }

    function _seal(uint256 id, address bidder, uint256 step, uint256 quantity) internal returns (Sealed memory) {
        uint256 nonce = uint256(keccak256(abi.encode("nonce", id, bidder))) >> 128;
        return _sealRaw(id, bidder, (step << 224) | (quantity << 128) | nonce);
    }

    function _commitSealed(uint256 id, address bidder, Sealed memory s) internal returns (uint32 slot) {
        uint256 deposit = auction.getAuction(id).deposit;
        quote.mint(bidder, deposit);
        vm.startPrank(bidder);
        quote.approve(address(auction), deposit);
        auction.commit(id, s.ephemeral, s.c, s.h);
        vm.stopPrank();
        slot = auction.bidderSlot(id, bidder) - 1;
        _store(id, slot, s);
    }

    function _store(uint256 id, uint32 slot, Sealed memory s) internal {
        Sealed storage stored = sealedOf[id][slot];
        stored.ephemeral = s.ephemeral;
        stored.c = s.c;
        stored.h = s.h;
        stored.m = s.m;
        for (uint256 i = 0; i < 3; ++i) {
            stored.shared[i] = s.shared[i];
        }
    }

    function _bid(uint256 id, address bidder, uint256 step, uint256 quantity) internal returns (uint32) {
        return _commitSealed(id, bidder, _seal(id, bidder, step, quantity));
    }

    function _publish(uint256 id, uint8 keeper) internal {
        auction.publishKey(id, keeper, secretsOf[id][keeper]);
    }

    function _close(uint256 id, uint8 first, uint8 second) internal {
        vm.warp(auction.getAuction(id).commitDeadline);
        _publish(id, first);
        _publish(id, second);
    }

    function _openAll(uint256 id) internal {
        BlindAuctionV2.Auction memory a = auction.getAuction(id);
        for (uint32 slot = 0; slot < a.bidCount; ++slot) {
            if (auction.getBid(id, slot).opened) continue;
            Sealed storage s = sealedOf[id][slot];
            auction.open(id, slot, s.shared[a.pairA], s.shared[a.pairB]);
        }
    }

    function _closeAndOpenAll(uint256 id) internal {
        _close(id, 0, 1);
        _openAll(id);
    }

    function _tallyAll(uint256 id) internal {
        while (!auction.getAuction(id).finalized) {
            auction.tally(id, 1000);
        }
    }

    function _claim(uint256 id, address bidder, uint256 saleOut, uint256 quoteOut) internal {
        uint256 saleBefore = sale.balanceOf(bidder);
        uint256 quoteBefore = quote.balanceOf(bidder);
        vm.prank(bidder);
        auction.claim(id);
        assertEq(sale.balanceOf(bidder) - saleBefore, saleOut, "sale out");
        assertEq(quote.balanceOf(bidder) - quoteBefore, quoteOut, "quote out");
    }
}
```

- [ ] **Step 4: Write the failing create tests**

`contracts/test/v2/Create.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BlindAuctionV2} from "../../src/BlindAuctionV2.sol";
import {KeeperRegistry} from "../../src/KeeperRegistry.sol";
import {Secp256k1} from "../../src/Secp256k1.sol";
import {V2Base} from "./V2Base.sol";

contract CreateTest is V2Base {
    event AuctionCreated(
        uint256 indexed auctionId,
        address indexed authority,
        address saleToken,
        address quoteToken,
        uint256 supply,
        uint64 commitStart,
        uint64 commitDeadline,
        uint64 cancelAfter
    );

    function _expectCreateRevert(BlindAuctionV2.CreateParams memory p, bytes4 selector) internal {
        _enqueueKeys();
        vm.prank(authority);
        vm.expectRevert(selector);
        auction.createAuction(p);
    }

    function test_createStoresPullsAndConsumesKeys() public {
        BlindAuctionV2.CreateParams memory p = _params();
        uint256[3] memory secretKeys = _enqueueKeys();
        vm.prank(authority);
        vm.expectEmit(address(auction));
        emit AuctionCreated(1, authority, address(sale), address(quote), 1000, p.commitStart, p.commitDeadline, p.cancelAfter);
        uint256 id = auction.createAuction(p);

        assertEq(id, 1);
        assertEq(auction.nextAuctionId(), 2);
        BlindAuctionV2.Auction memory a = auction.getAuction(id);
        assertEq(a.authority, authority);
        assertEq(a.supply, 1000);
        assertEq(a.supplyLots, 1000);
        assertEq(uint256(a.status), uint256(BlindAuctionV2.Status.Open));
        assertEq(sale.balanceOf(address(auction)), 1000);
        Secp256k1.Point[3] memory keys = auction.keeperKeysOf(id);
        for (uint256 i = 0; i < 3; ++i) {
            assertEq(keys[i].x, _pub(secretKeys[i]).x);
            assertEq(registry.available(uint8(i)), 0);
        }
    }

    function test_lotSizeScalesSupply() public {
        BlindAuctionV2.CreateParams memory p = _params();
        p.supply = 1000e18;
        p.lotSize = 1e18;
        sale.mint(authority, 1000e18);
        uint256 id = _create(p);
        assertEq(auction.getAuction(id).supplyLots, 1000);
    }

    function test_rejectsTokens() public {
        BlindAuctionV2.CreateParams memory p = _params();
        p.saleToken = address(0);
        _expectCreateRevert(p, BlindAuctionV2.ZeroAddress.selector);
        p = _params();
        p.quoteToken = address(0);
        _expectCreateRevert(p, BlindAuctionV2.ZeroAddress.selector);
        p = _params();
        p.quoteToken = address(sale);
        _expectCreateRevert(p, BlindAuctionV2.SameToken.selector);
        p = _params();
        p.quoteToken = makeAddr("eoa");
        _expectCreateRevert(p, BlindAuctionV2.NotAContract.selector);
    }

    function test_rejectsSupplyAndLots() public {
        BlindAuctionV2.CreateParams memory p = _params();
        p.supply = 0;
        _expectCreateRevert(p, BlindAuctionV2.BadSupply.selector);
        p = _params();
        p.lotSize = 0;
        _expectCreateRevert(p, BlindAuctionV2.BadLot.selector);
        p = _params();
        p.lotSize = 3;
        _expectCreateRevert(p, BlindAuctionV2.BadLot.selector);
        p = _params();
        p.supply = uint256(type(uint96).max) + 1;
        _expectCreateRevert(p, BlindAuctionV2.BadLot.selector);
    }

    function test_rejectsLadder() public {
        BlindAuctionV2.CreateParams memory p = _params();
        p.stepCount = 0;
        _expectCreateRevert(p, BlindAuctionV2.BadGrid.selector);
        p = _params();
        p.stepCount = 65;
        _expectCreateRevert(p, BlindAuctionV2.BadGrid.selector);
        p = _params();
        p.minPrice = 0;
        _expectCreateRevert(p, BlindAuctionV2.BadGrid.selector);
        p = _params();
        p.stepSize = 0;
        _expectCreateRevert(p, BlindAuctionV2.BadGrid.selector);
        p = _params();
        p.minPrice = type(uint128).max;
        p.stepSize = 1;
        _expectCreateRevert(p, BlindAuctionV2.BadGrid.selector);
    }

    function test_singleStepAllowsZeroStepSize() public {
        BlindAuctionV2.CreateParams memory p = _params();
        p.stepCount = 1;
        p.stepSize = 0;
        uint256 id = _create(p);
        assertEq(auction.quotePrice(id, 0), 50);
    }

    function test_rejectsDeposit() public {
        BlindAuctionV2.CreateParams memory p = _params();
        p.deposit = 0;
        _expectCreateRevert(p, BlindAuctionV2.BadDeposit.selector);
        p = _params();
        p.maxNotional = 0;
        _expectCreateRevert(p, BlindAuctionV2.BadDeposit.selector);
        p = _params();
        p.deposit = uint256(type(uint128).max) + 1;
        _expectCreateRevert(p, BlindAuctionV2.BadDeposit.selector);
        p = _params();
        p.deposit = 49;
        _expectCreateRevert(p, BlindAuctionV2.BadDeposit.selector);
        p = _params();
        p.maxNotional = 49;
        _expectCreateRevert(p, BlindAuctionV2.BadDeposit.selector);
    }

    function test_rejectsMaxBids() public {
        BlindAuctionV2.CreateParams memory p = _params();
        p.maxBids = 0;
        _expectCreateRevert(p, BlindAuctionV2.BadBids.selector);
        p = _params();
        p.maxBids = 65_536;
        _expectCreateRevert(p, BlindAuctionV2.BadBids.selector);
    }

    function test_rejectsSchedule() public {
        BlindAuctionV2.CreateParams memory p = _params();
        p.commitStart = uint64(block.timestamp - 1);
        _expectCreateRevert(p, BlindAuctionV2.BadSchedule.selector);
        p = _params();
        p.commitDeadline = p.commitStart + 59;
        _expectCreateRevert(p, BlindAuctionV2.BadSchedule.selector);
        p = _params();
        p.commitDeadline = p.commitStart + 30 days + 1;
        _expectCreateRevert(p, BlindAuctionV2.BadSchedule.selector);
        p = _params();
        p.cancelAfter = p.commitDeadline + 10 minutes - 1;
        _expectCreateRevert(p, BlindAuctionV2.BadSchedule.selector);
        p = _params();
        p.cancelAfter = p.commitDeadline + 30 days + 1;
        _expectCreateRevert(p, BlindAuctionV2.BadSchedule.selector);
    }

    function test_rejectsSeedFieldsWithoutSeeding() public {
        BlindAuctionV2.CreateParams memory p = _params();
        p.kuruParams = hex"01";
        _expectCreateRevert(p, BlindAuctionV2.BadSeed.selector);
        p = _params();
        p.seedLockUntil = p.cancelAfter;
        _expectCreateRevert(p, BlindAuctionV2.BadSeed.selector);
    }

    function test_seedingNeedsASeeder() public {
        BlindAuctionV2.CreateParams memory p = _params();
        p.seedSaleLots = 1;
        p.seedLockUntil = p.cancelAfter;
        _expectCreateRevert(p, BlindAuctionV2.SeederNotSet.selector);
    }

    function test_needsKeeperKeys() public {
        vm.prank(authority);
        vm.expectRevert(KeeperRegistry.NoKeeperKeys.selector);
        auction.createAuction(_params());
    }

    function test_feeOnTransferSaleTokenRejected() public {
        FeeToken token = new FeeToken();
        token.mint(authority, 1000);
        vm.prank(authority);
        token.approve(address(auction), 1000);
        BlindAuctionV2.CreateParams memory p = _params();
        p.saleToken = address(token);
        _expectCreateRevert(p, BlindAuctionV2.TransferFailed.selector);
    }
}
```

At the top of `Create.t.sol`, add `import {FeeOnTransferToken as FeeToken} from "./Mocks.sol";` after the `V2Base` import.

- [ ] **Step 5: Run to see it fail**

Run: `cd contracts && forge test --match-path test/v2/Create.t.sol; cd ..`
Expected: compilation error, `BlindAuctionV2.sol` not found.

- [ ] **Step 6: Implement the skeleton and `createAuction`**

`contracts/src/BlindAuctionV2.sol`. This is the full storage layout, errors, events and creation path. Later tasks append functions inside the contract body, at the marked section comments.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "./IERC20.sol";
import {IMarketSeeder} from "./IMarketSeeder.sol";
import {KeeperRegistry} from "./KeeperRegistry.sol";
import {Secp256k1} from "./Secp256k1.sol";

/// @title BlindAuctionV2
/// @notice Sealed-bid, uniform-price token launch on Monad where bids open themselves.
///
/// A bid is `m = step << 224 | quantity << 128 | nonce`, split 2-of-3 with Shamir modulo the
/// secp256k1 order. Share i is XOR-encrypted under keccak256(r·P_i, i), where P_i is keeper i's
/// key for this auction and R = r·G is stored with the bid. After the commit deadline two keepers
/// publish their secret keys; the second publication freezes the pair. Anyone can then open each
/// bid: the contract checks the supplied shared points with ecrecover, decrypts two shares,
/// reconstructs m and checks keccak256(abi.encode(auctionId, bidder, m)) against the commitment.
/// Bidders never act after `commit`.
///
/// Quantities are lots of `lotSize` sale-token base units; prices are quote-token base units per
/// lot. Every winner pays the clearing price. Pro-rata dust at the clearing step stays unsold and
/// returns to the authority. See docs/superpowers/specs/2026-10-13-blindlaunch-v2-design.md.
contract BlindAuctionV2 {
    uint32 public constant MAX_STEPS = 64;
    uint32 public constant MAX_BIDS = 65_535;
    uint32 public constant TALLY_IN_SETTLE = 256;
    uint256 public constant SEED_GAS_FLOOR = 1_500_000;
    uint64 public constant MIN_COMMIT = 60;
    uint64 public constant MAX_COMMIT = 30 days;
    uint64 public constant MIN_CANCEL_GAP = 10 minutes;
    uint64 public constant MAX_CANCEL_GAP = 30 days;
    uint256 public constant MAX_AMOUNT = type(uint128).max;
    uint256 public constant MAX_LOTS = type(uint96).max;
    uint256 internal constant BID_LIMIT = 1 << 232;

    enum Status {
        None,
        Open,
        Settled,
        Cancelled
    }

    struct CreateParams {
        address saleToken;
        address quoteToken;
        uint256 supply;
        uint256 lotSize;
        uint256 minPrice;
        uint256 stepSize;
        uint32 stepCount;
        uint256 deposit;
        uint256 maxNotional;
        uint32 maxBids;
        uint64 commitStart;
        uint64 commitDeadline;
        uint64 cancelAfter;
        uint96 seedSaleLots;
        uint16 seedQuoteBps;
        uint64 seedLockUntil;
        bytes kuruParams;
    }

    struct Auction {
        address authority;
        IERC20 saleToken;
        IERC20 quoteToken;
        uint256 supply;
        uint256 lotSize;
        uint256 supplyLots;
        uint256 minPrice;
        uint256 stepSize;
        uint32 stepCount;
        uint256 deposit;
        uint256 maxNotional;
        uint32 maxBids;
        uint64 commitStart;
        uint64 commitDeadline;
        uint64 cancelAfter;
        Status status;
        uint32 bidCount;
        uint32 openedCount;
        uint8 publishedCount;
        uint8 pairA;
        uint8 pairB;
        bool finalized;
        bool reclaimed;
        uint32 clearingStep;
        uint256 clearingPrice;
        uint256 aboveTotal;
        uint256 remaining;
        uint256 atDemand;
        uint32 tallyCursor;
        uint256 tallySum;
        uint256 totalSold;
        uint96 seedSaleLots;
        uint16 seedQuoteBps;
        uint64 seedLockUntil;
        uint256 seedSale;
        uint256 seedQuote;
    }

    struct Bid {
        address bidder;
        bool opened;
        bool counted;
        bool claimed;
        uint8 step;
        uint96 quantity;
        bytes32 h;
        Secp256k1.Point ephemeral;
        uint256[3] c;
    }

    error ZeroAddress();
    error SameToken();
    error NotAContract();
    error BadSupply();
    error BadLot();
    error BadGrid();
    error BadDeposit();
    error BadBids();
    error BadSchedule();
    error BadSeed();
    error SeederNotSet();
    error SeederAlreadySet();
    error NotDeployer();
    error MissingAuction();
    error NotOpen();
    error TooEarly();
    error TooLate();
    error AuthorityBid();
    error AlreadyBid();
    error AuctionFull();
    error BadPoint();
    error BadKeeper();
    error KeysComplete();
    error AlreadyPublished();
    error BadKey();
    error NotEnoughKeys();
    error UnknownSlot();
    error AlreadyOpened();
    error BadShare();
    error LengthMismatch();
    error BidsUnopened();
    error NothingToTally();
    error InsufficientGas();
    error BadStatus();
    error NotFinalized();
    error UnknownBidder();
    error AlreadyClaimed();
    error NotAuthority();
    error AlreadyReclaimed();
    error TransferFailed();
    error Reentrancy();

    event SeederSet(address seeder);
    event AuctionCreated(
        uint256 indexed auctionId,
        address indexed authority,
        address saleToken,
        address quoteToken,
        uint256 supply,
        uint64 commitStart,
        uint64 commitDeadline,
        uint64 cancelAfter
    );
    event BidCommitted(uint256 indexed auctionId, uint32 slot, address indexed bidder);
    event KeyPublished(uint256 indexed auctionId, uint8 keeper);
    event BidOpened(
        uint256 indexed auctionId, uint32 slot, address indexed bidder, uint8 step, uint96 quantity, bool counted
    );
    event AuctionSettled(uint256 indexed auctionId, uint32 clearingStep, uint256 clearingPrice);
    event AuctionFinalized(uint256 indexed auctionId, uint256 totalSold);
    event AuctionCancelled(uint256 indexed auctionId);
    event BidClaimed(uint256 indexed auctionId, address indexed bidder, address to, uint256 saleOut, uint256 quoteOut);
    event ProceedsReclaimed(uint256 indexed auctionId, address to, uint256 saleOut, uint256 quoteOut);
    event SeedRequested(uint256 indexed auctionId, uint256 saleAmount, uint256 quoteAmount);
    event SeedFailed(uint256 indexed auctionId);

    KeeperRegistry public immutable registry;
    address public immutable deployer;
    IMarketSeeder public seeder;
    uint256 public nextAuctionId = 1;
    uint256 private _locked = 1;

    mapping(uint256 => Auction) internal _auctions;
    mapping(uint256 => mapping(uint32 => Bid)) internal _bids;
    mapping(uint256 => mapping(address => uint32)) public bidderSlot;
    mapping(uint256 => Secp256k1.Point[3]) internal _keeperKeys;
    mapping(uint256 => uint256[3]) internal _publishedKeys;
    mapping(uint256 => uint256[64]) internal _qtyAtStep;
    mapping(uint256 => mapping(uint32 => uint32[])) internal _slotsAtStep;
    mapping(uint256 => bytes) internal _kuruParams;

    modifier nonReentrant() {
        if (_locked != 1) revert Reentrancy();
        _locked = 2;
        _;
        _locked = 1;
    }

    constructor(KeeperRegistry registry_) {
        registry = registry_;
        deployer = msg.sender;
    }

    function setSeeder(IMarketSeeder seeder_) external {
        if (msg.sender != deployer) revert NotDeployer();
        if (address(seeder) != address(0) || address(seeder_) == address(0)) revert SeederAlreadySet();
        seeder = seeder_;
        emit SeederSet(address(seeder_));
    }

    // ------------------------------------------------------------------ create

    function createAuction(CreateParams calldata p) external nonReentrant returns (uint256 auctionId) {
        _validateTokens(p);
        _validateLadder(p);
        _validateSchedule(p);
        _validateSeed(p);

        auctionId = nextAuctionId++;
        Auction storage a = _auctions[auctionId];
        a.authority = msg.sender;
        a.saleToken = IERC20(p.saleToken);
        a.quoteToken = IERC20(p.quoteToken);
        a.supply = p.supply;
        a.lotSize = p.lotSize;
        a.supplyLots = p.supply / p.lotSize;
        a.minPrice = p.minPrice;
        a.stepSize = p.stepSize;
        a.stepCount = p.stepCount;
        a.deposit = p.deposit;
        a.maxNotional = p.maxNotional;
        a.maxBids = p.maxBids;
        a.commitStart = p.commitStart;
        a.commitDeadline = p.commitDeadline;
        a.cancelAfter = p.cancelAfter;
        a.seedSaleLots = p.seedSaleLots;
        a.seedQuoteBps = p.seedQuoteBps;
        a.seedLockUntil = p.seedLockUntil;
        a.status = Status.Open;
        if (p.kuruParams.length != 0) _kuruParams[auctionId] = p.kuruParams;

        for (uint8 i = 0; i < 3; ++i) {
            _keeperKeys[auctionId][i] = registry.consume(i, auctionId);
        }

        _pull(a.saleToken, msg.sender, p.supply);
        emit AuctionCreated(
            auctionId, msg.sender, p.saleToken, p.quoteToken, p.supply, p.commitStart, p.commitDeadline, p.cancelAfter
        );
    }

    function _validateTokens(CreateParams calldata p) private view {
        if (p.saleToken == address(0) || p.quoteToken == address(0)) revert ZeroAddress();
        if (p.saleToken == p.quoteToken) revert SameToken();
        if (p.saleToken.code.length == 0 || p.quoteToken.code.length == 0) revert NotAContract();
    }

    function _validateLadder(CreateParams calldata p) private pure {
        if (p.supply == 0) revert BadSupply();
        if (p.lotSize == 0 || p.supply % p.lotSize != 0 || p.supply / p.lotSize > MAX_LOTS) revert BadLot();
        if (p.stepCount == 0 || p.stepCount > MAX_STEPS || p.minPrice == 0) revert BadGrid();
        if (p.minPrice > MAX_AMOUNT || p.stepSize > MAX_AMOUNT) revert BadGrid();
        if (p.stepCount > 1 && p.stepSize == 0) revert BadGrid();
        if (p.minPrice + uint256(p.stepCount - 1) * p.stepSize > MAX_AMOUNT) revert BadGrid();
        if (p.deposit == 0 || p.deposit > MAX_AMOUNT || p.maxNotional == 0 || p.maxNotional > MAX_AMOUNT) {
            revert BadDeposit();
        }
        if (p.deposit < p.minPrice || p.maxNotional < p.minPrice) revert BadDeposit();
        if (p.maxBids == 0 || p.maxBids > MAX_BIDS) revert BadBids();
    }

    function _validateSchedule(CreateParams calldata p) private view {
        if (p.commitStart < block.timestamp) revert BadSchedule();
        if (p.commitDeadline < p.commitStart + MIN_COMMIT || p.commitDeadline > p.commitStart + MAX_COMMIT) {
            revert BadSchedule();
        }
        if (p.cancelAfter < p.commitDeadline + MIN_CANCEL_GAP || p.cancelAfter > p.commitDeadline + MAX_CANCEL_GAP) {
            revert BadSchedule();
        }
    }

    function _validateSeed(CreateParams calldata p) private view {
        if (p.seedSaleLots == 0 && p.seedQuoteBps == 0) {
            if (p.kuruParams.length != 0 || p.seedLockUntil != 0) revert BadSeed();
            return;
        }
        if (address(seeder) == address(0)) revert SeederNotSet();
        if (p.seedSaleLots > p.supply / p.lotSize || p.seedQuoteBps > 10_000 || p.seedLockUntil < p.cancelAfter) {
            revert BadSeed();
        }
        seeder.validate(
            IMarketSeeder.SeedConfig({
                saleToken: p.saleToken,
                quoteToken: p.quoteToken,
                lotSize: p.lotSize,
                minPrice: p.minPrice,
                stepSize: p.stepSize,
                stepCount: p.stepCount,
                kuruParams: p.kuruParams
            })
        );
    }

    // ------------------------------------------------------------------ commit

    // ------------------------------------------------------------------ keys

    // ------------------------------------------------------------------ open

    // ------------------------------------------------------------------ settle

    // ------------------------------------------------------------------ claims

    // ------------------------------------------------------------------ views

    function getAuction(uint256 auctionId) external view returns (Auction memory) {
        return _auctions[auctionId];
    }

    function getBid(uint256 auctionId, uint32 slot) external view returns (Bid memory) {
        return _bids[auctionId][slot];
    }

    function keeperKeysOf(uint256 auctionId) external view returns (Secp256k1.Point[3] memory) {
        return _keeperKeys[auctionId];
    }

    function quotePrice(uint256 auctionId, uint32 step) external view returns (uint256) {
        Auction storage a = _requireAuction(auctionId);
        if (step >= a.stepCount) revert BadGrid();
        return _price(a, step);
    }

    // ------------------------------------------------------------------ internals

    function _requireAuction(uint256 auctionId) private view returns (Auction storage a) {
        a = _auctions[auctionId];
        if (a.status == Status.None) revert MissingAuction();
    }

    function _price(Auction storage a, uint256 step) private view returns (uint256) {
        return a.minPrice + step * a.stepSize;
    }

    function _pull(IERC20 token, address from, uint256 amount) private {
        uint256 beforeBalance = token.balanceOf(address(this));
        _call(address(token), abi.encodeCall(IERC20.transferFrom, (from, address(this), amount)));
        if (token.balanceOf(address(this)) != beforeBalance + amount) revert TransferFailed();
    }

    function _push(IERC20 token, address to, uint256 amount) private {
        if (amount == 0) return;
        uint256 beforeBalance = token.balanceOf(address(this));
        _call(address(token), abi.encodeCall(IERC20.transfer, (to, amount)));
        if (token.balanceOf(address(this)) != beforeBalance - amount) revert TransferFailed();
    }

    function _call(address token, bytes memory data) private {
        (bool ok, bytes memory returned) = token.call(data);
        if (!ok) revert TransferFailed();
        if (returned.length > 0 && !abi.decode(returned, (bool))) revert TransferFailed();
    }
}
```

- [ ] **Step 7: Run to see it pass**

Run: `cd contracts && forge test --match-path test/v2/Create.t.sol; cd ..`
Expected: `13 tests passed`. If the compiler reports "Stack too deep" anywhere, add `via_ir = true` under `[profile.default]` in `contracts/foundry.toml`, rerun, and note it in the commit message; do not restructure the code.

- [ ] **Step 8: Commit**

```bash
git add contracts/src/IMarketSeeder.sol contracts/src/BlindAuctionV2.sol contracts/test/v2/V2Base.sol contracts/test/v2/Create.t.sol contracts/test/v2/Mocks.sol
git commit -m "Create v2 auctions with lots, bounded ladders, enforced windows and per-auction keeper keys."
```

### Task 1.12: `commit`

**Files:** Modify `contracts/src/BlindAuctionV2.sol` (commit section). Create `contracts/test/v2/Commit.t.sol`.

- [ ] **Step 1: Write the failing test**

`contracts/test/v2/Commit.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BlindAuctionV2} from "../../src/BlindAuctionV2.sol";
import {Secp256k1} from "../../src/Secp256k1.sol";
import {FeeOnTransferToken} from "./Mocks.sol";
import {V2Base} from "./V2Base.sol";

contract CommitTest is V2Base {
    event BidCommitted(uint256 indexed auctionId, uint32 slot, address indexed bidder);

    function _tryCommit(uint256 id, address bidder, Sealed memory s, bytes4 selector) internal {
        quote.mint(bidder, DEPOSIT);
        vm.startPrank(bidder);
        quote.approve(address(auction), DEPOSIT);
        vm.expectRevert(selector);
        auction.commit(id, s.ephemeral, s.c, s.h);
        vm.stopPrank();
    }

    function test_commitStoresSealedBidAndPullsDeposit() public {
        uint256 id = _create();
        Sealed memory s = _seal(id, alice, 3, 100);
        quote.mint(alice, DEPOSIT);
        vm.startPrank(alice);
        quote.approve(address(auction), DEPOSIT);
        vm.expectEmit(address(auction));
        emit BidCommitted(id, 0, alice);
        auction.commit(id, s.ephemeral, s.c, s.h);
        vm.stopPrank();

        assertEq(quote.balanceOf(address(auction)), DEPOSIT);
        assertEq(auction.bidderSlot(id, alice), 1);
        BlindAuctionV2.Bid memory b = auction.getBid(id, 0);
        assertEq(b.bidder, alice);
        assertEq(b.h, s.h);
        assertEq(b.ephemeral.x, s.ephemeral.x);
        assertEq(b.c[2], s.c[2]);
        assertFalse(b.opened);
        assertEq(auction.getAuction(id).bidCount, 1);
    }

    function test_windowIsEnforced() public {
        BlindAuctionV2.CreateParams memory p = _params();
        p.commitStart = uint64(block.timestamp + 10);
        p.commitDeadline = p.commitStart + 1 hours;
        p.cancelAfter = p.commitDeadline + 1 hours;
        uint256 id = _create(p);
        _tryCommit(id, alice, _seal(id, alice, 0, 1), BlindAuctionV2.TooEarly.selector);
        vm.warp(p.commitDeadline);
        _tryCommit(id, bob, _seal(id, bob, 0, 1), BlindAuctionV2.TooLate.selector);
    }

    function test_authorityCannotBid() public {
        uint256 id = _create();
        _tryCommit(id, authority, _seal(id, authority, 0, 1), BlindAuctionV2.AuthorityBid.selector);
    }

    function test_oneBidPerWallet() public {
        uint256 id = _create();
        _bid(id, alice, 0, 1);
        _tryCommit(id, alice, _seal(id, alice, 1, 1), BlindAuctionV2.AlreadyBid.selector);
    }

    function test_maxBidsIsEnforced() public {
        BlindAuctionV2.CreateParams memory p = _params();
        p.maxBids = 1;
        uint256 id = _create(p);
        _bid(id, alice, 0, 1);
        _tryCommit(id, bob, _seal(id, bob, 0, 1), BlindAuctionV2.AuctionFull.selector);
    }

    function test_rejectsBadEphemeralPoints() public {
        uint256 id = _create();
        Sealed memory s = _seal(id, alice, 0, 1);
        s.ephemeral = Secp256k1.Point(s.ephemeral.x, s.ephemeral.y + 1);
        _tryCommit(id, alice, s, BlindAuctionV2.BadPoint.selector);
        s.ephemeral = Secp256k1.Point(0, 1);
        _tryCommit(id, alice, s, BlindAuctionV2.BadPoint.selector);
        s.ephemeral = Secp256k1.Point(N, 1);
        _tryCommit(id, alice, s, BlindAuctionV2.BadPoint.selector);
    }

    function test_missingAuction() public {
        uint256 id = _create();
        _tryCommit(99, alice, _seal(id, alice, 0, 1), BlindAuctionV2.MissingAuction.selector);
    }

    function test_feeOnTransferQuoteRejected() public {
        FeeOnTransferToken fee = new FeeOnTransferToken();
        BlindAuctionV2.CreateParams memory p = _params();
        p.quoteToken = address(fee);
        uint256 id = _create(p);
        Sealed memory s = _seal(id, alice, 0, 1);
        fee.mint(alice, DEPOSIT);
        vm.startPrank(alice);
        fee.approve(address(auction), DEPOSIT);
        vm.expectRevert(BlindAuctionV2.TransferFailed.selector);
        auction.commit(id, s.ephemeral, s.c, s.h);
        vm.stopPrank();
    }
}
```

- [ ] **Step 2: Run to see it fail**

Run: `cd contracts && forge test --match-path test/v2/Commit.t.sol; cd ..`
Expected: compilation error, `Member "commit" not found`.

- [ ] **Step 3: Implement**

In `BlindAuctionV2.sol`, under `// ---- commit`:

```solidity
    function commit(uint256 auctionId, Secp256k1.Point calldata ephemeral, uint256[3] calldata c, bytes32 h)
        external
        nonReentrant
    {
        Auction storage a = _requireAuction(auctionId);
        if (a.status != Status.Open) revert NotOpen();
        if (block.timestamp < a.commitStart) revert TooEarly();
        if (block.timestamp >= a.commitDeadline) revert TooLate();
        if (msg.sender == a.authority) revert AuthorityBid();
        if (bidderSlot[auctionId][msg.sender] != 0) revert AlreadyBid();
        if (a.bidCount >= a.maxBids) revert AuctionFull();
        if (!Secp256k1.isValid(ephemeral)) revert BadPoint();

        uint32 slot = a.bidCount;
        a.bidCount = slot + 1;
        bidderSlot[auctionId][msg.sender] = slot + 1;
        Bid storage b = _bids[auctionId][slot];
        b.bidder = msg.sender;
        b.h = h;
        b.ephemeral = ephemeral;
        b.c = c;

        _pull(a.quoteToken, msg.sender, a.deposit);
        emit BidCommitted(auctionId, slot, msg.sender);
    }
```

- [ ] **Step 4: Run to see it pass**

Run: `cd contracts && forge test --match-path "test/v2/*.t.sol"; cd ..`
Expected: all v2 suites pass, `Commit.t.sol` reports `8 tests passed`.

- [ ] **Step 5: Commit**

```bash
git add contracts/src/BlindAuctionV2.sol contracts/test/v2/Commit.t.sol
git commit -m "Accept one sealed bid per wallet with a uniform deposit and a checked ephemeral key."
```

### Task 1.13: `publishKey` and the frozen pair

**Files:** Modify `contracts/src/BlindAuctionV2.sol` (keys section, views). Create `contracts/test/v2/Publish.t.sol`.

- [ ] **Step 1: Write the failing test**

`contracts/test/v2/Publish.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BlindAuctionV2} from "../../src/BlindAuctionV2.sol";
import {V2Base} from "./V2Base.sol";

contract PublishTest is V2Base {
    event KeyPublished(uint256 indexed auctionId, uint8 keeper);

    function test_notBeforeDeadline() public {
        uint256 id = _create();
        vm.expectRevert(BlindAuctionV2.TooEarly.selector);
        _publish(id, 0);
    }

    function test_notAtOrAfterCancelAfter() public {
        uint256 id = _create();
        vm.warp(auction.getAuction(id).cancelAfter);
        vm.expectRevert(BlindAuctionV2.TooLate.selector);
        _publish(id, 0);
    }

    function test_checksTheKey() public {
        uint256 id = _create();
        vm.warp(auction.getAuction(id).commitDeadline);
        vm.expectRevert(BlindAuctionV2.BadKey.selector);
        auction.publishKey(id, 0, secretsOf[id][1]);
        vm.expectRevert(BlindAuctionV2.BadKeeper.selector);
        auction.publishKey(id, 3, secretsOf[id][0]);
    }

    function test_anyoneWithTheSecretCanPublish() public {
        uint256 id = _create();
        vm.warp(auction.getAuction(id).commitDeadline);
        vm.prank(makeAddr("stranger"));
        vm.expectEmit(address(auction));
        emit KeyPublished(id, 2);
        _publish(id, 2);
        assertEq(auction.publishedKeysOf(id)[2], secretsOf[id][2]);
    }

    function test_noDoublePublishAndNoThirdKey() public {
        uint256 id = _create();
        vm.warp(auction.getAuction(id).commitDeadline);
        _publish(id, 1);
        vm.expectRevert(BlindAuctionV2.AlreadyPublished.selector);
        _publish(id, 1);
        _publish(id, 0);
        vm.expectRevert(BlindAuctionV2.KeysComplete.selector);
        _publish(id, 2);
    }

    function test_secondPublicationFreezesTheSortedPair() public {
        uint256 id = _create();
        vm.warp(auction.getAuction(id).commitDeadline);
        _publish(id, 2);
        _publish(id, 0);
        BlindAuctionV2.Auction memory a = auction.getAuction(id);
        assertEq(a.publishedCount, 2);
        assertEq(a.pairA, 0);
        assertEq(a.pairB, 2);
    }

    function test_notAfterCancel() public {
        uint256 id = _create();
        vm.warp(auction.getAuction(id).cancelAfter);
        auction.cancel(id);
        vm.expectRevert(BlindAuctionV2.NotOpen.selector);
        _publish(id, 0);
    }
}
```

- [ ] **Step 2: Run to see it fail**

Run: `cd contracts && forge test --match-path test/v2/Publish.t.sol; cd ..`
Expected: compilation error, `Member "publishKey" not found`.

- [ ] **Step 3: Implement**

Under `// ---- keys`:

```solidity
    function publishKey(uint256 auctionId, uint8 keeper, uint256 secretKey) external nonReentrant {
        Auction storage a = _requireAuction(auctionId);
        if (a.status != Status.Open) revert NotOpen();
        if (block.timestamp < a.commitDeadline) revert TooEarly();
        if (block.timestamp >= a.cancelAfter) revert TooLate();
        if (keeper > 2) revert BadKeeper();
        if (a.publishedCount >= 2) revert KeysComplete();
        if (_publishedKeys[auctionId][keeper] != 0) revert AlreadyPublished();
        if (!Secp256k1.mulEquals(Secp256k1.generator(), secretKey, _keeperKeys[auctionId][keeper])) revert BadKey();

        _publishedKeys[auctionId][keeper] = secretKey;
        if (a.publishedCount == 0) {
            a.pairA = keeper;
        } else if (keeper < a.pairA) {
            a.pairB = a.pairA;
            a.pairA = keeper;
        } else {
            a.pairB = keeper;
        }
        a.publishedCount += 1;
        emit KeyPublished(auctionId, keeper);
    }
```

Under `// ---- views` add:

```solidity
    function publishedKeysOf(uint256 auctionId) external view returns (uint256[3] memory) {
        return _publishedKeys[auctionId];
    }
```

Under `// ---- settle` add `cancel` (needed by `test_notAfterCancel`):

```solidity
    function cancel(uint256 auctionId) external nonReentrant {
        Auction storage a = _requireAuction(auctionId);
        if (a.status != Status.Open) revert NotOpen();
        if (block.timestamp < a.cancelAfter) revert TooEarly();
        if (a.publishedCount >= 2) revert KeysComplete();
        a.status = Status.Cancelled;
        emit AuctionCancelled(auctionId);
    }
```

- [ ] **Step 4: Run to see it pass**

Run: `cd contracts && forge test --match-path "test/v2/*.t.sol"; cd ..`
Expected: all pass, `Publish.t.sol` reports `7 tests passed`.

- [ ] **Step 5: Commit**

```bash
git add contracts/src/BlindAuctionV2.sol contracts/test/v2/Publish.t.sol
git commit -m "Publish checked keeper keys, freeze the first two as the pair, and cancel only without a pair."
```

### Task 1.14: `open` and `openMany`

**Files:** Modify `contracts/src/BlindAuctionV2.sol` (open section, views). Create `contracts/test/v2/Open.t.sol`.

- [ ] **Step 1: Write the failing test**

`contracts/test/v2/Open.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BlindAuctionV2} from "../../src/BlindAuctionV2.sol";
import {Secp256k1} from "../../src/Secp256k1.sol";
import {V2Base} from "./V2Base.sol";

contract OpenTest is V2Base {
    event BidOpened(
        uint256 indexed auctionId, uint32 slot, address indexed bidder, uint8 step, uint96 quantity, bool counted
    );

    function _openOne(uint256 id, uint32 slot) internal {
        BlindAuctionV2.Auction memory a = auction.getAuction(id);
        Sealed storage s = sealedOf[id][slot];
        auction.open(id, slot, s.shared[a.pairA], s.shared[a.pairB]);
    }

    function test_opensWithEveryPair() public {
        uint8[2][3] memory pairs = [[0, 1], [0, 2], [1, 2]];
        for (uint256 k = 0; k < 3; ++k) {
            uint256 id = _create();
            _bid(id, alice, 4, 321);
            _close(id, pairs[k][1], pairs[k][0]);
            vm.expectEmit(address(auction));
            emit BidOpened(id, 0, alice, 4, 321, true);
            _openOne(id, 0);
            BlindAuctionV2.Bid memory b = auction.getBid(id, 0);
            assertTrue(b.opened && b.counted);
            assertEq(b.step, 4);
            assertEq(b.quantity, 321);
            assertEq(auction.qtyAtStepOf(id)[4], 321);
            assertEq(auction.slotsAtStepLength(id, 4), 1);
        }
    }

    function test_needsTwoKeys() public {
        uint256 id = _create();
        _bid(id, alice, 0, 1);
        vm.warp(auction.getAuction(id).commitDeadline);
        _publish(id, 0);
        Sealed storage s = sealedOf[id][0];
        vm.expectRevert(BlindAuctionV2.NotEnoughKeys.selector);
        auction.open(id, 0, s.shared[0], s.shared[1]);
    }

    function test_rejectsWrongSharedPoint() public {
        uint256 id = _create();
        _bid(id, alice, 0, 1);
        _close(id, 0, 1);
        Sealed storage s = sealedOf[id][0];
        vm.expectRevert(BlindAuctionV2.BadShare.selector);
        auction.open(id, 0, s.shared[0], s.shared[2]);
    }

    function test_onlyOnceAndOnlyKnownSlots() public {
        uint256 id = _create();
        _bid(id, alice, 0, 1);
        _close(id, 0, 1);
        _openOne(id, 0);
        Sealed storage s = sealedOf[id][0];
        vm.expectRevert(BlindAuctionV2.AlreadyOpened.selector);
        auction.open(id, 0, s.shared[0], s.shared[1]);
        vm.expectRevert(BlindAuctionV2.UnknownSlot.selector);
        auction.open(id, 1, s.shared[0], s.shared[1]);
    }

    function test_invalidBidsAreOpenedButNotCounted() public {
        BlindAuctionV2.CreateParams memory p = _params();
        p.maxNotional = 5_000;
        uint256 id = _create(p);
        _bid(id, alice, 6, 1); // step out of range
        _bid(id, bob, 0, 0); // zero quantity
        _bid(id, cara, 0, 101); // 50 * 101 > maxNotional 5,000
        _commitSealed(id, dan, _sealRaw(id, dan, 1 << 240)); // m >= 2^232
        address eve = makeAddr("eve");
        Sealed memory wrongHash = _seal(id, eve, 0, 1);
        wrongHash.h = keccak256("not the commitment");
        _commitSealed(id, eve, wrongHash);
        _closeAndOpenAll(id);
        for (uint32 slot = 0; slot < 5; ++slot) {
            BlindAuctionV2.Bid memory b = auction.getBid(id, slot);
            assertTrue(b.opened);
            assertFalse(b.counted);
        }
        assertEq(auction.getAuction(id).openedCount, 5);
    }

    function test_notionalAboveDepositIsNotCounted() public {
        BlindAuctionV2.CreateParams memory p = _params();
        p.deposit = 5_000;
        uint256 id = _create(p);
        _bid(id, alice, 0, 101);
        _closeAndOpenAll(id);
        assertFalse(auction.getBid(id, 0).counted);
    }

    function test_copiedCiphertextIsNotCounted() public {
        uint256 id = _create();
        Sealed memory original = _seal(id, alice, 2, 50);
        _commitSealed(id, alice, original);
        _commitSealed(id, bob, original);
        _closeAndOpenAll(id);
        assertTrue(auction.getBid(id, 0).counted);
        assertFalse(auction.getBid(id, 1).counted);
    }

    function test_inconsistentSharesDependOnTheFrozenPairOnly() public {
        uint256 first = _create();
        Sealed memory s1 = _seal(first, alice, 1, 10);
        s1.c[2] ^= 1;
        _commitSealed(first, alice, s1);
        _close(first, 0, 1);
        _openAll(first);
        assertTrue(auction.getBid(first, 0).counted, "valid under (0,1)");

        uint256 second = _create();
        Sealed memory s2 = _seal(second, alice, 1, 10);
        s2.c[2] ^= 1;
        _commitSealed(second, alice, s2);
        _close(second, 2, 1);
        _openAll(second);
        assertFalse(auction.getBid(second, 0).counted, "invalid under (1,2)");
    }

    function test_openManySkipsOpenedSlots() public {
        uint256 id = _create();
        _bid(id, alice, 1, 10);
        _bid(id, bob, 2, 20);
        _close(id, 0, 1);
        _openAllPrefix(id, 1);
        uint32[] memory slots = new uint32[](2);
        Secp256k1.Point[] memory sharedA = new Secp256k1.Point[](2);
        Secp256k1.Point[] memory sharedB = new Secp256k1.Point[](2);
        for (uint32 slot = 0; slot < 2; ++slot) {
            slots[slot] = slot;
            sharedA[slot] = sealedOf[id][slot].shared[0];
            sharedB[slot] = sealedOf[id][slot].shared[1];
        }
        auction.openMany(id, slots, sharedA, sharedB);
        assertEq(auction.getAuction(id).openedCount, 2);
    }

    function test_openManyChecksLengths() public {
        uint256 id = _create();
        _bid(id, alice, 1, 10);
        _close(id, 0, 1);
        vm.expectRevert(BlindAuctionV2.LengthMismatch.selector);
        auction.openMany(id, new uint32[](1), new Secp256k1.Point[](0), new Secp256k1.Point[](1));
    }

    function _openAllPrefix(uint256 id, uint32 count) internal {
        for (uint32 slot = 0; slot < count; ++slot) {
            _openOne(id, slot);
        }
    }
}
```

- [ ] **Step 2: Run to see it fail**

Run: `cd contracts && forge test --match-path test/v2/Open.t.sol; cd ..`
Expected: compilation error, `Member "open" not found`.

- [ ] **Step 3: Implement**

Under `// ---- open`:

```solidity
    function open(uint256 auctionId, uint32 slot, Secp256k1.Point calldata sharedA, Secp256k1.Point calldata sharedB)
        external
        nonReentrant
    {
        Auction storage a = _openable(auctionId);
        if (slot >= a.bidCount) revert UnknownSlot();
        if (_bids[auctionId][slot].opened) revert AlreadyOpened();
        _open(auctionId, a, slot, sharedA, sharedB);
    }

    /// @notice Opens many bids; slots already opened (for example by a racing keeper) are skipped.
    function openMany(
        uint256 auctionId,
        uint32[] calldata slots,
        Secp256k1.Point[] calldata sharedA,
        Secp256k1.Point[] calldata sharedB
    ) external nonReentrant {
        if (slots.length != sharedA.length || slots.length != sharedB.length) revert LengthMismatch();
        Auction storage a = _openable(auctionId);
        for (uint256 i = 0; i < slots.length; ++i) {
            uint32 slot = slots[i];
            if (slot >= a.bidCount) revert UnknownSlot();
            if (_bids[auctionId][slot].opened) continue;
            _open(auctionId, a, slot, sharedA[i], sharedB[i]);
        }
    }

    function _openable(uint256 auctionId) private view returns (Auction storage a) {
        a = _requireAuction(auctionId);
        if (a.status != Status.Open) revert NotOpen();
        if (a.publishedCount < 2) revert NotEnoughKeys();
    }

    function _open(
        uint256 auctionId,
        Auction storage a,
        uint32 slot,
        Secp256k1.Point calldata sharedA,
        Secp256k1.Point calldata sharedB
    ) private {
        Bid storage b = _bids[auctionId][slot];
        uint256 m = _decrypt(auctionId, a, b, sharedA, sharedB);
        b.opened = true;
        a.openedCount += 1;
        (bool counted, uint8 step, uint96 quantity) = _parse(a, auctionId, b.bidder, b.h, m);
        if (counted) {
            b.counted = true;
            b.step = step;
            b.quantity = quantity;
            _qtyAtStep[auctionId][step] += quantity;
            _slotsAtStep[auctionId][step].push(slot);
        }
        emit BidOpened(auctionId, slot, b.bidder, step, quantity, counted);
    }

    function _decrypt(
        uint256 auctionId,
        Auction storage a,
        Bid storage b,
        Secp256k1.Point calldata sharedA,
        Secp256k1.Point calldata sharedB
    ) private view returns (uint256) {
        uint8 pa = a.pairA;
        uint8 pb = a.pairB;
        Secp256k1.Point memory ephemeral = b.ephemeral;
        if (!Secp256k1.mulEquals(ephemeral, _publishedKeys[auctionId][pa], sharedA)) revert BadShare();
        if (!Secp256k1.mulEquals(ephemeral, _publishedKeys[auctionId][pb], sharedB)) revert BadShare();
        uint256 ya = b.c[pa] ^ Secp256k1.shareKey(sharedA, pa);
        uint256 yb = b.c[pb] ^ Secp256k1.shareKey(sharedB, pb);
        return Secp256k1.reconstruct(pa, pb, ya, yb);
    }

    /// @dev Never reverts: an unusable bid is simply not counted and is refunded at claim.
    function _parse(Auction storage a, uint256 auctionId, address bidder, bytes32 h, uint256 m)
        private
        view
        returns (bool counted, uint8 step, uint96 quantity)
    {
        if (keccak256(abi.encode(auctionId, bidder, m)) != h || m >= BID_LIMIT) return (false, 0, 0);
        step = uint8(m >> 224);
        quantity = uint96(m >> 128);
        if (step >= a.stepCount || quantity == 0) return (false, step, quantity);
        uint256 notional = _price(a, step) * quantity;
        counted = notional <= a.deposit && notional <= a.maxNotional;
    }
```

Under `// ---- views` add:

```solidity
    function qtyAtStepOf(uint256 auctionId) external view returns (uint256[64] memory) {
        return _qtyAtStep[auctionId];
    }

    function slotsAtStepLength(uint256 auctionId, uint32 step) external view returns (uint256) {
        return _slotsAtStep[auctionId][step].length;
    }

    function hashBid(uint256 auctionId, address bidder, uint256 m) external pure returns (bytes32) {
        return keccak256(abi.encode(auctionId, bidder, m));
    }
```

- [ ] **Step 4: Run to see it pass**

Run: `cd contracts && forge test --match-path "test/v2/*.t.sol"; cd ..`
Expected: all pass, `Open.t.sol` reports `10 tests passed`.

- [ ] **Step 5: Commit**

```bash
git add contracts/src/BlindAuctionV2.sol contracts/test/v2/Open.t.sol
git commit -m "Open sealed bids on chain from published keys, counting only bids that match their commitment."
```

### Task 1.15: `settle`, `tally` and finalization (without seeding)

**Files:** Modify `contracts/src/BlindAuctionV2.sol` (settle section, views). Create `contracts/test/v2/Settle.t.sol`.

- [ ] **Step 1: Write the failing test**

`contracts/test/v2/Settle.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BlindAuctionV2} from "../../src/BlindAuctionV2.sol";
import {V2Base} from "./V2Base.sol";

contract SettleTest is V2Base {
    function test_referenceExampleClearsAt60() public {
        uint256 id = _create();
        _bid(id, alice, 5, 400);
        _bid(id, bob, 3, 300);
        _bid(id, cara, 1, 500);
        _bid(id, dan, 0, 400);
        _closeAndOpenAll(id);
        assertTrue(auction.canSettle(id));
        auction.settle(id);

        BlindAuctionV2.Auction memory a = auction.getAuction(id);
        assertEq(uint256(a.status), uint256(BlindAuctionV2.Status.Settled));
        assertEq(a.clearingStep, 1);
        assertEq(a.clearingPrice, 60);
        assertEq(a.aboveTotal, 700);
        assertEq(a.remaining, 300);
        assertEq(a.atDemand, 500);
        assertTrue(a.finalized);
        assertEq(a.totalSold, 1000);
        assertEq(auction.allocationOf(id, alice), 400);
        assertEq(auction.allocationOf(id, bob), 300);
        assertEq(auction.allocationOf(id, cara), 300);
        assertEq(auction.allocationOf(id, dan), 0);
    }

    function test_undersubscribedSellsAllCountedAtFloor() public {
        uint256 id = _create();
        _bid(id, alice, 5, 100);
        _bid(id, bob, 0, 50);
        _closeAndOpenAll(id);
        auction.settle(id);
        BlindAuctionV2.Auction memory a = auction.getAuction(id);
        assertEq(a.clearingStep, 0);
        assertEq(a.clearingPrice, 50);
        assertEq(a.totalSold, 150);
        assertTrue(a.finalized);
    }

    function test_noBidsSellsNothingAtPriceZero() public {
        uint256 id = _create();
        _close(id, 0, 1);
        auction.settle(id);
        BlindAuctionV2.Auction memory a = auction.getAuction(id);
        assertEq(a.clearingPrice, 0);
        assertEq(a.totalSold, 0);
        assertTrue(a.finalized);
    }

    function test_onlyInvalidBidsSellsNothing() public {
        uint256 id = _create();
        _bid(id, alice, 9, 10);
        _closeAndOpenAll(id);
        auction.settle(id);
        assertEq(auction.getAuction(id).clearingPrice, 0);
        assertEq(auction.getAuction(id).totalSold, 0);
    }

    function test_exactFillAtClearingStepIsNotProRata() public {
        uint256 id = _create();
        _bid(id, alice, 4, 600);
        _bid(id, bob, 2, 400);
        _closeAndOpenAll(id);
        auction.settle(id);
        BlindAuctionV2.Auction memory a = auction.getAuction(id);
        assertEq(a.clearingStep, 2);
        assertEq(a.totalSold, 1000);
        assertEq(auction.allocationOf(id, bob), 400);
    }

    function test_proRataDustStaysUnsold() public {
        BlindAuctionV2.CreateParams memory p = _params();
        p.supply = 10;
        uint256 id = _create(p);
        _bid(id, alice, 2, 4);
        _bid(id, bob, 2, 4);
        _bid(id, cara, 2, 4);
        _closeAndOpenAll(id);
        auction.settle(id);
        BlindAuctionV2.Auction memory a = auction.getAuction(id);
        assertEq(a.totalSold, 9);
        assertEq(auction.allocationOf(id, alice), 3);
        assertEq(auction.allocationOf(id, cara), 3);
    }

    function test_needsAllBidsOpenedAndTwoKeys() public {
        uint256 id = _create();
        _bid(id, alice, 0, 1);
        vm.warp(auction.getAuction(id).commitDeadline);
        vm.expectRevert(BlindAuctionV2.NotEnoughKeys.selector);
        auction.settle(id);
        _publish(id, 0);
        _publish(id, 1);
        assertFalse(auction.canSettle(id));
        vm.expectRevert(BlindAuctionV2.BidsUnopened.selector);
        auction.settle(id);
    }

    function test_settlesOnlyOnce() public {
        uint256 id = _create();
        _close(id, 0, 1);
        auction.settle(id);
        vm.expectRevert(BlindAuctionV2.NotOpen.selector);
        auction.settle(id);
    }

    function test_settleHasNoDeadline() public {
        uint256 id = _create();
        _bid(id, alice, 0, 1);
        _closeAndOpenAll(id);
        vm.warp(block.timestamp + 365 days);
        auction.settle(id);
        assertEq(auction.getAuction(id).totalSold, 1);
    }

    function test_largeProRataNeedsTally() public {
        BlindAuctionV2.CreateParams memory p = _params();
        p.supply = 100;
        uint256 id = _create(p);
        uint256 bidders = auction.TALLY_IN_SETTLE() + 4;
        for (uint256 i = 0; i < bidders; ++i) {
            _bid(id, address(uint160(0x10000 + i)), 0, 1);
        }
        _closeAndOpenAll(id);
        auction.settle(id);
        BlindAuctionV2.Auction memory a = auction.getAuction(id);
        assertFalse(a.finalized);
        assertEq(a.tallyCursor, auction.TALLY_IN_SETTLE());

        vm.expectRevert(BlindAuctionV2.NotFinalized.selector);
        vm.prank(authority);
        auction.reclaim(id);

        auction.tally(id, 2);
        assertFalse(auction.getAuction(id).finalized);
        auction.tally(id, 100);
        a = auction.getAuction(id);
        assertTrue(a.finalized);
        assertEq(a.totalSold, 0, "floor(100 * 1 / 260) = 0 for every bid");
        vm.expectRevert(BlindAuctionV2.NothingToTally.selector);
        auction.tally(id, 1);
    }

    function test_tallyBeforeSettleReverts() public {
        uint256 id = _create();
        vm.expectRevert(BlindAuctionV2.NothingToTally.selector);
        auction.tally(id, 1);
    }
}
```

`test_largeProRataNeedsTally` also calls `reclaim`; it is added in Task 1.16, so this one test is expected to fail until then. Mark it with `vm.skip(true);` as its first line now and remove that line in Task 1.16 Step 3.

- [ ] **Step 2: Run to see it fail**

Run: `cd contracts && forge test --match-path test/v2/Settle.t.sol; cd ..`
Expected: compilation error, `Member "canSettle" not found`.

- [ ] **Step 3: Implement**

Under `// ---- settle` (above the existing `cancel`):

```solidity
    function settle(uint256 auctionId) external nonReentrant {
        Auction storage a = _requireAuction(auctionId);
        if (a.status != Status.Open) revert NotOpen();
        if (a.publishedCount < 2) revert NotEnoughKeys();
        if (a.openedCount != a.bidCount) revert BidsUnopened();

        uint256[64] storage demand = _qtyAtStep[auctionId];
        uint256 supplyLots = a.supplyLots;
        uint256 above;
        uint32 clearing;
        bool found;
        for (uint32 step = a.stepCount; step > 0;) {
            unchecked {
                --step;
            }
            uint256 atStep = demand[step];
            if (above + atStep >= supplyLots) {
                clearing = step;
                found = true;
                break;
            }
            above += atStep;
        }

        uint256 atDemand;
        if (found) {
            atDemand = demand[clearing];
        } else {
            atDemand = demand[0];
            above -= atDemand;
        }

        a.status = Status.Settled;
        a.clearingStep = clearing;
        a.clearingPrice = above + atDemand == 0 ? 0 : _price(a, clearing);
        a.aboveTotal = above;
        a.remaining = supplyLots - above;
        a.atDemand = atDemand;
        emit AuctionSettled(auctionId, clearing, a.clearingPrice);

        if (atDemand <= a.remaining) {
            a.totalSold = above + atDemand;
            _finalize(auctionId, a);
        } else {
            _tally(auctionId, a, TALLY_IN_SETTLE);
        }
    }

    /// @notice Continues the pro-rata total for large clearing steps. Anyone may call it.
    function tally(uint256 auctionId, uint32 maxCount) external nonReentrant {
        Auction storage a = _requireAuction(auctionId);
        if (a.status != Status.Settled || a.finalized) revert NothingToTally();
        _tally(auctionId, a, maxCount);
    }

    function _tally(uint256 auctionId, Auction storage a, uint256 maxCount) private {
        uint32[] storage slots = _slotsAtStep[auctionId][a.clearingStep];
        uint256 length = slots.length;
        uint256 cursor = a.tallyCursor;
        uint256 end = cursor + maxCount < length ? cursor + maxCount : length;
        uint256 sum = a.tallySum;
        uint256 remaining = a.remaining;
        uint256 atDemand = a.atDemand;
        for (; cursor < end; ++cursor) {
            sum += (remaining * _bids[auctionId][slots[cursor]].quantity) / atDemand;
        }
        a.tallyCursor = uint32(cursor);
        a.tallySum = sum;
        if (cursor == length) {
            a.totalSold = a.aboveTotal + sum;
            _finalize(auctionId, a);
        }
    }

    function _finalize(uint256 auctionId, Auction storage a) private {
        a.finalized = true;
        emit AuctionFinalized(auctionId, a.totalSold);
    }
```

Under `// ---- views` add:

```solidity
    function canSettle(uint256 auctionId) external view returns (bool) {
        Auction storage a = _auctions[auctionId];
        return a.status == Status.Open && a.publishedCount >= 2 && a.openedCount == a.bidCount;
    }

    function canCancel(uint256 auctionId) external view returns (bool) {
        Auction storage a = _auctions[auctionId];
        return a.status == Status.Open && block.timestamp >= a.cancelAfter && a.publishedCount < 2;
    }

    function allocationOf(uint256 auctionId, address bidder) external view returns (uint256) {
        Auction storage a = _requireAuction(auctionId);
        if (a.status != Status.Settled) return 0;
        return _allocation(a, _bidderBid(auctionId, bidder));
    }
```

Under `// ---- internals` add:

```solidity
    function _allocation(Auction storage a, Bid storage b) private view returns (uint256) {
        if (!b.counted || b.step < a.clearingStep) return 0;
        if (b.step > a.clearingStep || a.atDemand <= a.remaining) return b.quantity;
        return (a.remaining * b.quantity) / a.atDemand;
    }

    function _bidderBid(uint256 auctionId, address bidder) private view returns (Bid storage) {
        uint32 slotPlusOne = bidderSlot[auctionId][bidder];
        if (slotPlusOne == 0) revert UnknownBidder();
        return _bids[auctionId][slotPlusOne - 1];
    }
```

- [ ] **Step 4: Run to see it pass**

Run: `cd contracts && forge test --match-path "test/v2/*.t.sol"; cd ..`
Expected: all pass; `Settle.t.sol` reports `10 passed, 1 skipped`.

- [ ] **Step 5: Commit**

```bash
git add contracts/src/BlindAuctionV2.sol contracts/test/v2/Settle.t.sol
git commit -m "Clear on per-step demand, keep pro-rata dust unsold, and tally large clearing steps in pages."
```

### Task 1.16: `claim`, `reclaim` and cancellation payouts

**Files:** Modify `contracts/src/BlindAuctionV2.sol` (claims section, views). Create `contracts/test/v2/Claim.t.sol`. Modify `contracts/test/v2/Settle.t.sol` (remove the skip).

- [ ] **Step 1: Write the failing test**

`contracts/test/v2/Claim.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BlindAuctionV2} from "../../src/BlindAuctionV2.sol";
import {ReentrantToken} from "./Mocks.sol";
import {V2Base} from "./V2Base.sol";

contract ClaimTest is V2Base {
    function _reference() internal returns (uint256 id) {
        id = _create();
        _bid(id, alice, 5, 400);
        _bid(id, bob, 3, 300);
        _bid(id, cara, 1, 500);
        _bid(id, dan, 0, 400);
        _closeAndOpenAll(id);
        auction.settle(id);
    }

    function test_referencePayoutsLeaveNothingBehind() public {
        uint256 id = _reference();
        _claim(id, alice, 400, DEPOSIT - 60 * 400);
        _claim(id, bob, 300, DEPOSIT - 60 * 300);
        _claim(id, cara, 300, DEPOSIT - 60 * 300);
        _claim(id, dan, 0, DEPOSIT);
        vm.prank(authority);
        auction.reclaim(id);
        assertEq(sale.balanceOf(authority), 10_000_000 - 1000);
        assertEq(quote.balanceOf(authority), 60 * 1000);
        assertEq(sale.balanceOf(address(auction)), 0);
        assertEq(quote.balanceOf(address(auction)), 0);
    }

    function test_invalidBidGetsFullRefund() public {
        uint256 id = _create();
        _bid(id, alice, 9, 1);
        _bid(id, bob, 0, 10);
        _closeAndOpenAll(id);
        auction.settle(id);
        _claim(id, alice, 0, DEPOSIT);
        _claim(id, bob, 10, DEPOSIT - 500);
    }

    function test_dustReturnsToAuthority() public {
        BlindAuctionV2.CreateParams memory p = _params();
        p.supply = 10;
        uint256 id = _create(p);
        _bid(id, alice, 2, 4);
        _bid(id, bob, 2, 4);
        _bid(id, cara, 2, 4);
        _closeAndOpenAll(id);
        auction.settle(id);
        _claim(id, alice, 3, DEPOSIT - 70 * 3);
        _claim(id, bob, 3, DEPOSIT - 70 * 3);
        _claim(id, cara, 3, DEPOSIT - 70 * 3);
        uint256 before = sale.balanceOf(authority);
        vm.prank(authority);
        auction.reclaim(id);
        assertEq(sale.balanceOf(authority) - before, 1);
        assertEq(sale.balanceOf(address(auction)), 0);
        assertEq(quote.balanceOf(address(auction)), 0);
    }

    function test_lotsPayInBaseUnits() public {
        BlindAuctionV2.CreateParams memory p = _params();
        p.supply = 1000e18;
        p.lotSize = 1e18;
        sale.mint(authority, 1000e18);
        uint256 id = _create(p);
        _bid(id, alice, 5, 2);
        _closeAndOpenAll(id);
        auction.settle(id);
        _claim(id, alice, 2e18, DEPOSIT - 50 * 2);
    }

    function test_claimToAnotherAddress() public {
        uint256 id = _reference();
        address vault = makeAddr("vault");
        vm.prank(alice);
        auction.claimTo(id, vault);
        assertEq(sale.balanceOf(vault), 400);
        vm.prank(alice);
        vm.expectRevert(BlindAuctionV2.AlreadyClaimed.selector);
        auction.claim(id);
        vm.prank(bob);
        vm.expectRevert(BlindAuctionV2.ZeroAddress.selector);
        auction.claimTo(id, address(0));
    }

    function test_claimGuards() public {
        uint256 id = _create();
        _bid(id, alice, 0, 1);
        vm.prank(alice);
        vm.expectRevert(BlindAuctionV2.BadStatus.selector);
        auction.claim(id);
        vm.prank(bob);
        vm.expectRevert(BlindAuctionV2.UnknownBidder.selector);
        auction.claim(id);
    }

    function test_claimsOpenBeforeTallyFinishes() public {
        BlindAuctionV2.CreateParams memory p = _params();
        p.supply = 100;
        uint256 id = _create(p);
        uint256 bidders = auction.TALLY_IN_SETTLE() + 4;
        for (uint256 i = 0; i < bidders; ++i) {
            _bid(id, address(uint160(0x10000 + i)), 0, 1);
        }
        _closeAndOpenAll(id);
        auction.settle(id);
        assertFalse(auction.getAuction(id).finalized);
        _claim(id, address(uint160(0x10000)), 0, DEPOSIT);
    }

    function test_reclaimGuards() public {
        uint256 id = _reference();
        vm.prank(alice);
        vm.expectRevert(BlindAuctionV2.NotAuthority.selector);
        auction.reclaim(id);
        vm.prank(authority);
        auction.reclaim(id);
        vm.prank(authority);
        vm.expectRevert(BlindAuctionV2.AlreadyReclaimed.selector);
        auction.reclaim(id);

        uint256 open = _create();
        vm.prank(authority);
        vm.expectRevert(BlindAuctionV2.BadStatus.selector);
        auction.reclaim(open);
    }

    function test_cancelRefundsEveryoneAndReturnsSupply() public {
        uint256 id = _create();
        _bid(id, alice, 5, 400);
        _bid(id, bob, 0, 1);
        vm.warp(auction.getAuction(id).commitDeadline);
        _publish(id, 0);
        assertFalse(auction.canCancel(id));
        vm.expectRevert(BlindAuctionV2.TooEarly.selector);
        auction.cancel(id);
        vm.warp(auction.getAuction(id).cancelAfter);
        assertTrue(auction.canCancel(id));
        auction.cancel(id);
        _claim(id, alice, 0, DEPOSIT);
        _claim(id, bob, 0, DEPOSIT);
        vm.prank(authority);
        auction.reclaimTo(id, makeAddr("treasury"));
        assertEq(sale.balanceOf(makeAddr("treasury")), 1000);
        assertEq(quote.balanceOf(address(auction)), 0);
    }

    function test_cannotCancelOnceAPairExists() public {
        uint256 id = _create();
        _bid(id, alice, 0, 1);
        _close(id, 0, 1);
        vm.warp(auction.getAuction(id).cancelAfter);
        assertFalse(auction.canCancel(id));
        vm.expectRevert(BlindAuctionV2.KeysComplete.selector);
        auction.cancel(id);
        _openAll(id);
        auction.settle(id);
        _claim(id, alice, 1, DEPOSIT - 50);
    }

    function test_reentrantTokenCannotDoubleClaim() public {
        ReentrantToken hostile = new ReentrantToken();
        BlindAuctionV2.CreateParams memory p = _params();
        p.quoteToken = address(hostile);
        uint256 id = _create(p);
        Sealed memory s = _seal(id, alice, 0, 1);
        hostile.mint(alice, DEPOSIT);
        vm.startPrank(alice);
        hostile.approve(address(auction), DEPOSIT);
        auction.commit(id, s.ephemeral, s.c, s.h);
        vm.stopPrank();
        _store(id, 0, s);
        _closeAndOpenAll(id);
        auction.settle(id);
        hostile.arm(address(auction), abi.encodeCall(BlindAuctionV2.claim, (id)));
        vm.prank(alice);
        auction.claim(id);
        assertTrue(hostile.reentered());
        assertFalse(hostile.reentryOk());
        assertEq(bytes4(hostile.reentryError()), BlindAuctionV2.Reentrancy.selector);
        assertEq(hostile.balanceOf(alice), DEPOSIT - 50);
    }

    function test_claimableView() public {
        uint256 id = _reference();
        (uint256 saleOut, uint256 quoteOut) = auction.claimable(id, bob);
        assertEq(saleOut, 300);
        assertEq(quoteOut, DEPOSIT - 60 * 300);
    }
}
```

- [ ] **Step 2: Run to see it fail**

Run: `cd contracts && forge test --match-path test/v2/Claim.t.sol; cd ..`
Expected: compilation error, `Member "claim" not found`.

- [ ] **Step 3: Implement and un-skip**

Under `// ---- claims`:

```solidity
    function claim(uint256 auctionId) external {
        claimTo(auctionId, msg.sender);
    }

    /// @notice Pays the caller's allocation and refund to `to`, for example when the caller's
    ///         own address is blocked by one of the tokens.
    function claimTo(uint256 auctionId, address to) public nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        Auction storage a = _requireAuction(auctionId);
        Bid storage b = _bidderBid(auctionId, msg.sender);
        if (b.claimed) revert AlreadyClaimed();
        (uint256 saleOut, uint256 quoteOut) = _claimable(a, b);
        b.claimed = true;
        _push(a.saleToken, to, saleOut);
        _push(a.quoteToken, to, quoteOut);
        emit BidClaimed(auctionId, msg.sender, to, saleOut, quoteOut);
    }

    function reclaim(uint256 auctionId) external {
        reclaimTo(auctionId, msg.sender);
    }

    function reclaimTo(uint256 auctionId, address to) public nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        Auction storage a = _requireAuction(auctionId);
        if (msg.sender != a.authority) revert NotAuthority();
        if (a.reclaimed) revert AlreadyReclaimed();
        uint256 saleOut;
        uint256 quoteOut;
        if (a.status == Status.Cancelled) {
            saleOut = a.supply;
        } else if (a.status == Status.Settled) {
            if (!a.finalized) revert NotFinalized();
            saleOut = (a.supplyLots - a.totalSold) * a.lotSize - a.seedSale;
            quoteOut = a.clearingPrice * a.totalSold - a.seedQuote;
        } else {
            revert BadStatus();
        }
        a.reclaimed = true;
        _push(a.saleToken, to, saleOut);
        _push(a.quoteToken, to, quoteOut);
        emit ProceedsReclaimed(auctionId, to, saleOut, quoteOut);
    }
```

Under `// ---- views`:

```solidity
    function claimable(uint256 auctionId, address bidder) external view returns (uint256 saleOut, uint256 quoteOut) {
        return _claimable(_requireAuction(auctionId), _bidderBid(auctionId, bidder));
    }
```

Under `// ---- internals`:

```solidity
    function _claimable(Auction storage a, Bid storage b) private view returns (uint256 saleOut, uint256 quoteOut) {
        if (a.status == Status.Cancelled) return (0, a.deposit);
        if (a.status != Status.Settled) revert BadStatus();
        uint256 lots = _allocation(a, b);
        return (lots * a.lotSize, a.deposit - a.clearingPrice * lots);
    }
```

In `contracts/test/v2/Settle.t.sol` delete the `vm.skip(true);` line from `test_largeProRataNeedsTally`.

- [ ] **Step 4: Run to see it pass**

Run: `cd contracts && forge test --match-path "test/v2/*.t.sol"; cd ..`
Expected: all pass, no skips; `Claim.t.sol` reports `12 tests passed`.

- [ ] **Step 5: Commit**

```bash
git add contracts/src/BlindAuctionV2.sol contracts/test/v2/Claim.t.sol contracts/test/v2/Settle.t.sol
git commit -m "Pay claims from lazy allocations, let the authority reclaim after finalization, and refund on cancel."
```

### Task 1.17: Seeder hand-off

**Files:** Modify `contracts/src/BlindAuctionV2.sol` (`_finalize`, internals, views). Create `contracts/test/v2/Seed.t.sol`.

- [ ] **Step 1: Write the failing test**

`contracts/test/v2/Seed.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BlindAuctionV2} from "../../src/BlindAuctionV2.sol";
import {IMarketSeeder} from "../../src/IMarketSeeder.sol";
import {GreedySeeder, MockSeeder, RevertingAcceptSeeder} from "./Mocks.sol";
import {V2Base} from "./V2Base.sol";

contract SeedTest is V2Base {
    event SeedRequested(uint256 indexed auctionId, uint256 saleAmount, uint256 quoteAmount);
    event SeedFailed(uint256 indexed auctionId);

    function _withSeeder(MockSeeder seeder) internal {
        auction.setSeeder(IMarketSeeder(address(seeder)));
    }

    function _seededParams() internal view returns (BlindAuctionV2.CreateParams memory p) {
        p = _params();
        p.seedSaleLots = 100;
        p.seedQuoteBps = 2_000;
        p.seedLockUntil = p.cancelAfter + 30 days;
        p.kuruParams = hex"c0ffee";
    }

    /// Undersubscribed: sold 150 at 50, unsold 850, seed 100 sale and 20% of 7,500 = 1,500 quote.
    function _prepareUndersubscribed() internal returns (uint256 id) {
        id = _create(_seededParams());
        _bid(id, alice, 5, 100);
        _bid(id, bob, 0, 50);
        _closeAndOpenAll(id);
    }

    function _settleUndersubscribed() internal returns (uint256 id) {
        id = _prepareUndersubscribed();
        auction.settle(id);
    }

    function test_setSeederOnlyDeployerOnlyOnce() public {
        MockSeeder seeder = new MockSeeder();
        vm.prank(alice);
        vm.expectRevert(BlindAuctionV2.NotDeployer.selector);
        auction.setSeeder(IMarketSeeder(address(seeder)));
        _withSeeder(seeder);
        vm.expectRevert(BlindAuctionV2.SeederAlreadySet.selector);
        auction.setSeeder(IMarketSeeder(address(seeder)));
    }

    function test_validateRunsAtCreate() public {
        MockSeeder seeder = new MockSeeder();
        _withSeeder(seeder);
        seeder.setRejectConfig(true);
        _enqueueKeys();
        vm.prank(authority);
        vm.expectRevert(bytes("config"));
        auction.createAuction(_seededParams());
    }

    function test_rejectsBadSeedConfig() public {
        _withSeeder(new MockSeeder());
        BlindAuctionV2.CreateParams memory p = _seededParams();
        p.seedSaleLots = 1001;
        _enqueueKeys();
        vm.prank(authority);
        vm.expectRevert(BlindAuctionV2.BadSeed.selector);
        auction.createAuction(p);
        p = _seededParams();
        p.seedQuoteBps = 10_001;
        vm.prank(authority);
        vm.expectRevert(BlindAuctionV2.BadSeed.selector);
        auction.createAuction(p);
        p = _seededParams();
        p.seedLockUntil = p.cancelAfter - 1;
        vm.prank(authority);
        vm.expectRevert(BlindAuctionV2.BadSeed.selector);
        auction.createAuction(p);
    }

    function test_handOffMovesExactAmountsAndReclaimExcludesThem() public {
        MockSeeder seeder = new MockSeeder();
        _withSeeder(seeder);
        uint256 id = _prepareUndersubscribed();
        vm.expectEmit(address(auction));
        emit SeedRequested(id, 100, 1_500);
        auction.settle(id);

        assertEq(sale.balanceOf(address(seeder)), 100);
        assertEq(quote.balanceOf(address(seeder)), 1_500);
        assertEq(seeder.lastPrice(), 50);
        assertEq(seeder.seedCalls(), 1);
        assertEq(sale.allowance(address(auction), address(seeder)), 0);
        assertEq(quote.allowance(address(auction), address(seeder)), 0);
        BlindAuctionV2.Auction memory a = auction.getAuction(id);
        assertEq(a.seedSale, 100);
        assertEq(a.seedQuote, 1_500);
        assertEq(auction.kuruParamsOf(id), hex"c0ffee");

        _claim(id, alice, 100, DEPOSIT - 5_000);
        _claim(id, bob, 50, DEPOSIT - 2_500);
        uint256 saleBefore = sale.balanceOf(authority);
        vm.prank(authority);
        auction.reclaim(id);
        assertEq(sale.balanceOf(authority) - saleBefore, 750);
        assertEq(quote.balanceOf(authority), 6_000);
        assertEq(sale.balanceOf(address(auction)), 0);
        assertEq(quote.balanceOf(address(auction)), 0);
    }

    function test_acceptRevertLeavesFundsWithAuthority() public {
        _withSeeder(new RevertingAcceptSeeder());
        uint256 id = _prepareUndersubscribed();
        vm.expectEmit(address(auction));
        emit SeedFailed(id);
        auction.settle(id);
        assertEq(auction.getAuction(id).seedSale, 0);
        vm.prank(authority);
        auction.reclaim(id);
        assertEq(quote.balanceOf(authority), 7_500);
    }

    function test_seedRevertLeavesFundsPendingAtSeeder() public {
        MockSeeder seeder = new MockSeeder();
        seeder.setRevertSeed(true);
        _withSeeder(seeder);
        uint256 id = _settleUndersubscribed();
        assertEq(seeder.seedCalls(), 0);
        assertEq(quote.balanceOf(address(seeder)), 1_500);
        assertEq(auction.getAuction(id).seedQuote, 1_500);
    }

    function test_seederCannotPullMoreThanApproved() public {
        _withSeeder(new GreedySeeder());
        uint256 id = _prepareUndersubscribed();
        vm.expectEmit(address(auction));
        emit SeedFailed(id);
        auction.settle(id);
    }

    function test_lowGasSettleCannotSkipTheHandOff() public {
        _withSeeder(new MockSeeder());
        uint256 id = _create(_seededParams());
        _bid(id, alice, 5, 100);
        _closeAndOpenAll(id);
        vm.expectRevert(BlindAuctionV2.InsufficientGas.selector);
        auction.settle{gas: 1_000_000}(id);
    }

    function test_nothingSoldMeansNoHandOff() public {
        MockSeeder seeder = new MockSeeder();
        _withSeeder(seeder);
        uint256 id = _create(_seededParams());
        _close(id, 0, 1);
        auction.settle(id);
        assertEq(seeder.lastQuote(), 0);
        assertEq(auction.getAuction(id).seedSale, 0);
    }
}
```

- [ ] **Step 2: Run to see it fail**

Run: `cd contracts && forge test --match-path test/v2/Seed.t.sol; cd ..`
Expected: compilation error, `Member "kuruParamsOf" not found`.

- [ ] **Step 3: Implement**

Replace `_finalize` with:

```solidity
    function _finalize(uint256 auctionId, Auction storage a) private {
        a.finalized = true;
        emit AuctionFinalized(auctionId, a.totalSold);
        _handOffSeed(auctionId, a);
    }

    /// @dev Never lets a seeder failure block settlement: approve exact amounts, let the
    ///      seeder pull them in `accept` (rolled back if it reverts), then try `seed`.
    function _handOffSeed(uint256 auctionId, Auction storage a) private {
        if (a.totalSold == 0) return;
        uint256 unsoldLots = a.supplyLots - a.totalSold;
        uint256 saleAmount = (a.seedSaleLots < unsoldLots ? a.seedSaleLots : unsoldLots) * a.lotSize;
        uint256 quoteAmount = (a.clearingPrice * a.totalSold * a.seedQuoteBps) / 10_000;
        if (saleAmount == 0 && quoteAmount == 0) return;
        if (gasleft() < SEED_GAS_FLOOR) revert InsufficientGas();

        IMarketSeeder target = seeder;
        uint256 saleBefore = a.saleToken.balanceOf(address(this));
        uint256 quoteBefore = a.quoteToken.balanceOf(address(this));
        bool accepted;
        if (
            _tryApprove(a.saleToken, address(target), saleAmount)
                && _tryApprove(a.quoteToken, address(target), quoteAmount)
        ) {
            try target.accept(_seedOrder(auctionId, a, saleAmount, quoteAmount)) {
                accepted = true;
            } catch {}
        }
        _tryApprove(a.saleToken, address(target), 0);
        _tryApprove(a.quoteToken, address(target), 0);
        if (!accepted) {
            emit SeedFailed(auctionId);
            return;
        }

        uint256 saleAfter = a.saleToken.balanceOf(address(this));
        uint256 quoteAfter = a.quoteToken.balanceOf(address(this));
        a.seedSale = saleBefore > saleAfter ? saleBefore - saleAfter : 0;
        a.seedQuote = quoteBefore > quoteAfter ? quoteBefore - quoteAfter : 0;
        emit SeedRequested(auctionId, a.seedSale, a.seedQuote);
        try target.seed(auctionId) {} catch {}
    }

    function _seedOrder(uint256 auctionId, Auction storage a, uint256 saleAmount, uint256 quoteAmount)
        private
        view
        returns (IMarketSeeder.SeedOrder memory)
    {
        return IMarketSeeder.SeedOrder({
            auctionId: auctionId,
            authority: a.authority,
            saleToken: address(a.saleToken),
            quoteToken: address(a.quoteToken),
            saleAmount: saleAmount,
            quoteAmount: quoteAmount,
            clearingPrice: a.clearingPrice,
            lotSize: a.lotSize,
            lockUntil: a.seedLockUntil,
            kuruParams: _kuruParams[auctionId]
        });
    }
```

Under `// ---- internals`:

```solidity
    function _tryApprove(IERC20 token, address spender, uint256 amount) private returns (bool) {
        (bool ok, bytes memory returned) =
            address(token).call(abi.encodeCall(IERC20.approve, (spender, amount)));
        if (!ok) return false;
        return returned.length == 0 || (returned.length >= 32 && abi.decode(returned, (uint256)) != 0);
    }
```

Under `// ---- views`:

```solidity
    function kuruParamsOf(uint256 auctionId) external view returns (bytes memory) {
        return _kuruParams[auctionId];
    }
```

- [ ] **Step 4: Run to see it pass**

Run: `cd contracts && forge test --match-path "test/v2/*.t.sol"; cd ..`
Expected: all pass; `Seed.t.sol` reports `9 tests passed`.

- [ ] **Step 5: Commit**

```bash
git add contracts/src/BlindAuctionV2.sol contracts/test/v2/Seed.t.sol
git commit -m "Hand unsold tokens and a share of proceeds to the seeder without letting it block settlement."
```

### Task 1.18: TypeScript to Solidity parity

**Files:** Create `contracts/test/v2/Vectors.t.sol`.

- [ ] **Step 1: Write the test**

`contracts/test/v2/Vectors.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BlindAuctionV2} from "../../src/BlindAuctionV2.sol";
import {Secp256k1} from "../../src/Secp256k1.sol";
import {V2Base} from "./V2Base.sol";

/// @notice Bids sealed by packages/sealed-bid open on chain to the same step and quantity.
contract VectorsTest is V2Base {
    function test_typeScriptSealedBidsOpenOnChain() public {
        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/test/vectors/sealed-bid.json"));
        uint256 count = vm.parseJsonUint(json, ".count");
        assertGt(count, 0);
        for (uint256 k = 0; k < count; ++k) {
            _runCase(json, string.concat(".cases[", vm.toString(k), "]"));
        }
    }

    function _runCase(string memory json, string memory at) internal {
        _deploy();
        uint256[] memory secretKeys = vm.parseJsonUintArray(json, string.concat(at, ".secretKeys"));
        _enqueueVectorKeys(secretKeys);
        uint256 id = _createWideAuction();
        _commitFromJson(json, at, id);
        _publishAndOpen(json, at, id, secretKeys);
        _assertOpened(json, at, id);
    }

    function _enqueueVectorKeys(uint256[] memory secretKeys) internal {
        for (uint8 i = 0; i < 3; ++i) {
            Secp256k1.Point[] memory keys = new Secp256k1.Point[](1);
            keys[0] = _pub(secretKeys[i]);
            vm.prank(keeperOwners[i]);
            registry.enqueue(i, keys);
        }
    }

    /// Every step valid and no notional limit, so validity depends only on the hash check.
    function _createWideAuction() internal returns (uint256 id) {
        BlindAuctionV2.CreateParams memory p = _params();
        p.stepCount = 64;
        p.stepSize = 1;
        p.minPrice = 1;
        p.deposit = type(uint128).max;
        p.maxNotional = type(uint128).max;
        vm.prank(authority);
        id = auction.createAuction(p);
        assertEq(id, 1);
    }

    function _commitFromJson(string memory json, string memory at, uint256 id) internal {
        address bidder = vm.parseJsonAddress(json, string.concat(at, ".bidder"));
        Secp256k1.Point memory ephemeral = Secp256k1.Point(
            vm.parseJsonUint(json, string.concat(at, ".Rx")), vm.parseJsonUint(json, string.concat(at, ".Ry"))
        );
        uint256[] memory cList = vm.parseJsonUintArray(json, string.concat(at, ".c"));
        uint256[3] memory c = [cList[0], cList[1], cList[2]];
        bytes32 h = vm.parseJsonBytes32(json, string.concat(at, ".h"));
        uint256 deposit = auction.getAuction(id).deposit;
        quote.mint(bidder, deposit);
        vm.startPrank(bidder);
        quote.approve(address(auction), deposit);
        auction.commit(id, ephemeral, c, h);
        vm.stopPrank();
    }

    function _publishAndOpen(string memory json, string memory at, uint256 id, uint256[] memory secretKeys) internal {
        uint8 pairA = uint8(vm.parseJsonUint(json, string.concat(at, ".pairA")));
        uint8 pairB = uint8(vm.parseJsonUint(json, string.concat(at, ".pairB")));
        vm.warp(auction.getAuction(id).commitDeadline);
        auction.publishKey(id, pairA, secretKeys[pairA]);
        auction.publishKey(id, pairB, secretKeys[pairB]);
        uint256[] memory sx = vm.parseJsonUintArray(json, string.concat(at, ".Sx"));
        uint256[] memory sy = vm.parseJsonUintArray(json, string.concat(at, ".Sy"));
        auction.open(id, 0, Secp256k1.Point(sx[pairA], sy[pairA]), Secp256k1.Point(sx[pairB], sy[pairB]));
    }

    function _assertOpened(string memory json, string memory at, uint256 id) internal view {
        BlindAuctionV2.Bid memory b = auction.getBid(id, 0);
        bool counted = vm.parseJsonBool(json, string.concat(at, ".counted"));
        assertEq(b.counted, counted, vm.parseJsonString(json, string.concat(at, ".label")));
        if (counted) {
            assertEq(b.step, vm.parseJsonUint(json, string.concat(at, ".step")));
            assertEq(b.quantity, vm.parseJsonUint(json, string.concat(at, ".quantity")));
        }
    }
}
```

- [ ] **Step 2: Run**

Run: `cd contracts && forge test --match-path test/v2/Vectors.t.sol -vv; cd ..`
Expected: `1 test passed`. A failure here means the TS and Solidity implementations disagree. Fix the TS side (`seal.ts`, `shamir.ts` or `bid.ts`), regenerate with `pnpm --filter @blindlaunch/sealed-bid vectors`, and rerun. Never edit the JSON by hand.

- [ ] **Step 3: Commit**

```bash
git add contracts/test/v2/Vectors.t.sol
git commit -m "Prove bids sealed in TypeScript open on chain to the same bid."
```

### Task 1.19: Differential fuzz, solvency and gas

**Files:** Create `contracts/test/v2/Fuzz.t.sol`, `contracts/test/v2/Gas.t.sol`.

- [ ] **Step 1: Write the fuzz test**

`contracts/test/v2/Fuzz.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BlindAuctionV2} from "../../src/BlindAuctionV2.sol";
import {UniformClearing} from "../../src/UniformClearing.sol";
import {ClearingHarness} from "./Mocks.sol";
import {V2Base} from "./V2Base.sol";

contract FuzzTest is V2Base {
    ClearingHarness internal reference;

    function setUp() public override {
        super.setUp();
        reference = new ClearingHarness();
    }

    function testFuzz_matchesV1ClearingAndConservesFunds(uint256 seed, uint8 count, uint16 supply, uint8 pairChoice)
        public
    {
        count = uint8(bound(count, 1, 8));
        BlindAuctionV2.CreateParams memory p = _params();
        p.supply = bound(supply, 1, 5000);
        uint256 id = _create(p);

        address[] memory bidders = new address[](count);
        for (uint256 i = 0; i < count; ++i) {
            bidders[i] = address(uint160(0x1000 + i));
            uint256 step = uint256(keccak256(abi.encode(seed, i, "step"))) % 7; // 6 is off the ladder
            uint256 quantity = uint256(keccak256(abi.encode(seed, i, "qty"))) % 2001; // 0 is invalid
            _bid(id, bidders[i], step, quantity);
        }

        uint8 choice = pairChoice % 3;
        if (choice == 0) _close(id, 0, 1);
        else if (choice == 1) _close(id, 2, 0);
        else _close(id, 1, 2);
        _openAll(id);
        auction.settle(id);
        _tallyAll(id);

        (UniformClearing.Outcome memory ref, UniformClearing.Bid[] memory refBids) = _referenceClear(id, count, p);
        BlindAuctionV2.Auction memory a = auction.getAuction(id);
        assertEq(a.clearingStep, ref.clearingStep, "clearing step");
        assertEq(a.clearingPrice, ref.clearingPrice, "clearing price");

        uint256 dust;
        uint256 cursor;
        for (uint32 slot = 0; slot < count; ++slot) {
            uint256 ours = auction.allocationOf(id, bidders[slot]);
            uint256 theirs;
            if (auction.getBid(id, slot).counted) {
                theirs = refBids[cursor].allocation;
                ++cursor;
            }
            assertLe(ours, theirs, "never more than v1");
            assertLe(theirs - ours, 1, "at most one unit of dust per bid");
            dust += theirs - ours;
        }
        assertEq(a.totalSold + dust, ref.totalSold, "sold plus dust equals v1 sold");
        assertLe(a.totalSold, a.supplyLots);

        for (uint256 i = 0; i < count; ++i) {
            vm.prank(bidders[i]);
            auction.claim(id);
        }
        vm.prank(authority);
        auction.reclaim(id);
        assertEq(sale.balanceOf(address(auction)), 0, "no sale tokens left");
        assertEq(quote.balanceOf(address(auction)), 0, "no quote tokens left");
    }

    function _referenceClear(uint256 id, uint256 count, BlindAuctionV2.CreateParams memory p)
        internal
        view
        returns (UniformClearing.Outcome memory, UniformClearing.Bid[] memory)
    {
        uint256 counted;
        for (uint32 slot = 0; slot < count; ++slot) {
            if (auction.getBid(id, slot).counted) ++counted;
        }
        UniformClearing.Bid[] memory book = new UniformClearing.Bid[](counted);
        uint256 cursor;
        for (uint32 slot = 0; slot < count; ++slot) {
            BlindAuctionV2.Bid memory b = auction.getBid(id, slot);
            if (!b.counted) continue;
            book[cursor] = UniformClearing.Bid({slot: slot, priceStep: b.step, quantity: b.quantity, allocation: 0});
            ++cursor;
        }
        return reference.clear(p.supply, p.minPrice, p.stepSize, p.stepCount, book);
    }
}
```

- [ ] **Step 2: Write the gas test**

`contracts/test/v2/Gas.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {console2} from "forge-std/console2.sol";
import {BlindAuctionV2} from "../../src/BlindAuctionV2.sol";
import {Secp256k1} from "../../src/Secp256k1.sol";
import {V2Base} from "./V2Base.sol";

contract GasTest is V2Base {
    uint256 internal constant BIDS = 200;

    function test_gasForTwoHundredBidsAtTheClearingStep() public {
        BlindAuctionV2.CreateParams memory p = _params();
        p.supply = 100;
        uint256 id = _create(p);
        for (uint256 i = 0; i < BIDS; ++i) {
            _bid(id, address(uint160(0x20000 + i)), 0, 1);
        }
        _close(id, 0, 1);

        uint256 openGas;
        for (uint32 start = 0; start < BIDS; start += 50) {
            uint32[] memory slots = new uint32[](50);
            Secp256k1.Point[] memory sharedA = new Secp256k1.Point[](50);
            Secp256k1.Point[] memory sharedB = new Secp256k1.Point[](50);
            for (uint32 j = 0; j < 50; ++j) {
                slots[j] = start + j;
                sharedA[j] = sealedOf[id][start + j].shared[0];
                sharedB[j] = sealedOf[id][start + j].shared[1];
            }
            uint256 before = gasleft();
            auction.openMany(id, slots, sharedA, sharedB);
            openGas += before - gasleft();
        }
        uint256 settleBefore = gasleft();
        auction.settle(id);
        uint256 settleGas = settleBefore - gasleft();

        console2.log("openMany gas per bid", openGas / BIDS);
        console2.log("settle + tally of 200 at-step bids", settleGas);
        assertTrue(auction.getAuction(id).finalized);
        assertLt(openGas / BIDS, OPEN_BOUND);
        assertLt(settleGas, SETTLE_BOUND);
    }

    uint256 internal constant OPEN_BOUND = 200_000;
    uint256 internal constant SETTLE_BOUND = 2_000_000;
}
```

- [ ] **Step 3: Run and calibrate the bounds**

Run: `cd contracts && forge test --match-path "test/v2/{Fuzz,Gas}.t.sol" -vv; cd ..`
Expected: both pass. Read the two logged numbers, set `OPEN_BOUND` and `SETTLE_BOUND` to the logged value × 1.25 rounded up to the next 1,000, rerun, and confirm both still pass.

- [ ] **Step 4: Full suite**

Run: `cd contracts && forge test; cd ..`
Expected: every suite passes (v1 16 tests plus all v2 suites), `0 failed`, the Kuru spike `skipped`.

- [ ] **Step 5: Commit**

```bash
git add contracts/test/v2/Fuzz.t.sol contracts/test/v2/Gas.t.sol
git commit -m "Fuzz v2 clearing against v1 with solvency checks and pin open and settle gas."
```

### Task 1.20: Remove `auction-core` and finish phase 1

**Files:** Delete `packages/auction-core/`. Modify `pnpm-lock.yaml` (via install).

- [ ] **Step 1: Confirm nothing imports it**

Run: `grep -rn "auction-core" --include=*.ts --include=*.tsx --include=*.json apps packages | grep -v "^packages/auction-core"`
Expected: no output.

- [ ] **Step 2: Delete and reinstall**

```bash
git rm -r packages/auction-core
pnpm install
```

- [ ] **Step 3: Everything green**

Run: `pnpm typecheck && pnpm test && pnpm build && (cd contracts && forge test)`
Expected: typecheck exit 0 for `@blindlaunch/web` and `@blindlaunch/sealed-bid`; sealed-bid `Tests 30 passed (30)`; build exit 0; forge `0 failed`.

- [ ] **Step 4: Commit**

```bash
git add -A packages pnpm-lock.yaml
git commit -m "Remove auction-core now that sealed-bid mirrors the contract and is tested against it."
```

**Phase 1 exit:** `forge test` (all v1 and v2 suites, fuzz at 256 runs) and `pnpm typecheck && pnpm test && pnpm build` green; vectors regenerate with no diff; gas bounds recorded in `Gas.t.sol`.
