# Blindlaunch keeper

A keeper holds one of the three per-auction keys every `BlindAuctionV2` auction is sealed to. Each pass it:

1. Refills its key queue in `KeeperRegistry` up to `QUEUE_TARGET`, writing every secret to `KEY_STORE` **before** the public key goes on chain. A failed refill is logged as `refill-error` and the pass carries on, so publishing, opening and settling never wait on it.
2. Publishes its secret key for each auction that has bids, before any other work in the pass, once the **latest finalized block's** timestamp reaches `commitDeadline` **and** this host's own clock does too. Monad's `latest` block is only proposed and can still be dropped, so it is never trusted for this, and the host clock means one RPC endpoint reporting a wrong time can only delay a key, never release it early. Keeper `i` waits a further `i × 5` seconds of chain time, so the keepers do not publish in lockstep, and nobody publishes within 60 seconds of `cancelAfter`. The keeper never publishes early, never a third key, and never broadcasts a transaction that fails simulation, because a reverted `publishKey` would still put the secret on chain.
3. Once two keys are published, opens bids (50 per transaction, at most 4 transactions per auction per pass, reading bids `RPC_BATCH` at a time), settles, hands the seed to `MarketSeeder`, burns forfeited deposits, and retries a failed Kuru seed. A failing step is logged as `action-error` and the next one still runs.
4. Cancels an auction that reached `cancelAfter` without two keys, so bidders can reclaim their deposits.

Opening, settling and cancelling need no secret, so any keeper (or anyone) can do them. Only publishing needs this keeper's key store.

Auctions that are cancelled, or settled with nothing left to do, are not read again until the keeper restarts. Each transaction takes its nonce from the chain, so one that was broadcast but never mined cannot leave a gap that blocks every later one.

## Run

```bash
cp apps/keeper/.env.example apps/keeper/keeper0.env   # fill in, repeat for keeper1.env and keeper2.env
cd apps/keeper
set -a; source keeper0.env; set +a
pnpm start            # loop every POLL_MS
pnpm start --once     # one pass, then exit
```

Logs are one JSON object per line: `sent` for every transaction, `refill-error`, `auction-error`, `action-error` and `pass-error` for failures (the loop keeps going). `key-missing` (with `"level": "alert"`) means an open auction uses a key whose secret is not in `KEY_STORE`, for example after restoring an old backup: this keeper can never publish for it, so page someone.

The keeper holds `KEY_STORE.lock` while it runs and refuses to start if another live process holds it; a lock left by a process that has exited is taken over.

`RPC_BATCH` (default 10) caps the calls in one JSON-RPC batch. Monad's public RPCs reject larger batches: `rpc.monad.xyz` and `rpc1` accept 100, `rpc2` and `rpc3` accept 10, and `rpc-mainnet.monadinfra.com` accepts 1.

## Trust

Two keepers colluding can read bids before the deadline. Run the three keepers under different operators and keep each `KEY_STORE` private and backed up. Give each keeper a **different RPC provider** in `RPC_URL`: the chain time a keeper publishes against comes from its RPC, so three keepers on one endpoint let that endpoint decide when every secret is released (the host-clock check limits this to delaying keys, so also keep each host's clock synced with NTP). See the trust statement in `docs/superpowers/specs/2026-10-13-blindlaunch-v2-design.md`, section 3.8.

## Test

```bash
pnpm --filter @blindlaunch/keeper test
```

Unit tests cover the decision rules (including the host-clock gate, the stagger and the `cancelAfter` margin), the key store (durable writes, the lock), and passes on a fake chain (opening more than 100 bids, the finalized-block publish gate, a failed refill, publishing before capped opening, skipping finished auctions, an isolated failing action, the missing-key alert). The end-to-end test also checks that a dropped transaction leaves no nonce gap. The end-to-end test starts `anvil`, deploys the contracts with mock Kuru (`contracts/script/LocalStack.s.sol`), runs a seeded auction through three keepers, and is skipped when Foundry is not installed. Anvil runs with one slot per epoch, so its finalized block trails the latest by two blocks, as the publish gate expects on Monad.
