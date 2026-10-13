# Blindlaunch keeper

A keeper holds one of the three per-auction keys every `BlindAuctionV2` auction is sealed to. Each pass it:

1. Refills its key queue in `KeeperRegistry` up to `QUEUE_TARGET`, writing every secret to `KEY_STORE` **before** the public key goes on chain.
2. Publishes its secret key for each auction that has bids, once the **latest block's** timestamp reaches `commitDeadline` and before `cancelAfter`. It never publishes early, never a third key, and never broadcasts a transaction that fails simulation, because a reverted `publishKey` would still put the secret on chain.
3. Once two keys are published, opens every bid (50 per transaction), settles, hands the seed to `MarketSeeder`, burns forfeited deposits, and retries a failed Kuru seed.
4. Cancels an auction that reached `cancelAfter` without two keys, so bidders can reclaim their deposits.

Opening, settling and cancelling need no secret, so any keeper (or anyone) can do them. Only publishing needs this keeper's key store.

## Run

```bash
cp apps/keeper/.env.example apps/keeper/keeper0.env   # fill in, repeat for keeper1.env and keeper2.env
cd apps/keeper
set -a; source keeper0.env; set +a
pnpm start            # loop every POLL_MS
pnpm start --once     # one pass, then exit
```

Logs are one JSON object per line: `sent` for every transaction, `auction-error` and `pass-error` for failures (the loop keeps going).

## Trust

Two keepers colluding can read bids before the deadline. Run the three keepers under different operators and keep each `KEY_STORE` private and backed up. See the trust statement in `docs/superpowers/specs/2026-10-13-blindlaunch-v2-design.md`, section 3.8.

## Test

```bash
pnpm --filter @blindlaunch/keeper test
```

Unit tests cover the decision rules and the key store. The end-to-end test starts `anvil`, deploys the contracts with mock Kuru (`contracts/script/LocalStack.s.sol`), runs a seeded auction through three keepers, and is skipped when Foundry is not installed.
