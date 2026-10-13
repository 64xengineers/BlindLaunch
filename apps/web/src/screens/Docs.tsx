import { network } from "../chain/config";
import { CopyButton, GlassCard } from "../components/ui";

const calls = [
  ["Create", "KeeperRegistry must have a fresh key in each keeper queue. Approve the supply, then createAuction(params). The auction id is in the AuctionCreated event."],
  ["Bid", "Read keeperKeysOf(id). Seal with @blindlaunch/sealed-bid: seal({ chainId, contract, auctionId, bidder, step, quantity, keeperKeys }). Approve the deposit, then commit(id, R, c, h)."],
  ["Open", "After commitDeadline two keepers call publishKey. Anyone then calls openMany(id, slots, sharedA, sharedB) with sharedPoint(publishedKey, R) for the frozen pair."],
  ["Settle", "When every bid is open, anyone calls settle(id). It reads storage only."],
  ["Market", "If seeding is on, anyone calls handOffSeed(id); MarketSeeder opens a Kuru market at the clearing price. After the lock, anyone calls MarketSeeder.unwind(id) to pay the creator."],
  ["Claim", "Bidders call claim(id), or claimRefund / claimTokens for one leg. The creator calls reclaim(id), or reclaimUnsold / reclaimProceeds."],
  ["Cancel", "If two keys are not published by cancelAfter, anyone calls cancel(id) and every deposit is refunded."],
];

export function Docs() {
  const d = network.deployment;
  const addresses: [string, string][] = d
    ? [["BlindAuctionV2", d.auction], ["KeeperRegistry", d.registry], ["MarketSeeder", d.seeder], ["TokenFactory", d.factory], ["Payment token", d.quote]]
    : [];
  return (
    <div className="mx-auto max-w-4xl px-4 pb-20">
      <h1 className="text-5xl font-bold tracking-[-0.04em]">Integration docs</h1>
      <p className="mt-4 text-mist">Everything a launchpad, wallet or bot needs to use Blindlaunch auctions directly.</p>
      <GlassCard className="mt-8">
        <h2 className="text-lg font-bold">{network.label} (chain {network.chain.id})</h2>
        {addresses.length === 0 ? <p className="mt-2 text-sm text-mist">Not deployed on this network yet.</p> : null}
        <ul className="mt-3 grid gap-2">
          {addresses.map(([label, address]) => (
            <li key={label} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/[0.04] px-3 py-2 text-sm">
              <span className="text-lilac">{label}</span>
              <span className="flex items-center gap-1 font-mono text-paper">{address}<CopyButton value={address} /></span>
            </li>
          ))}
        </ul>
      </GlassCard>
      <GlassCard className="mt-6">
        <h2 className="text-lg font-bold">Bid format</h2>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-ink/60 p-3 font-mono text-xs text-paper">{`m = step << 224 | quantity << 128 | nonce        // nonce: 128 random bits
h = keccak256(abi.encode(chainid, auction, auctionId, bidder, m))
shares y_i = m + a·(i+1) mod n                    // Shamir 2-of-3, n = secp256k1 order
R = r·G,  c_i = y_i XOR keccak256(abi.encodePacked(r·P_i, uint8(i)))
commit(auctionId, R, [c_0, c_1, c_2], h)`}</pre>
        <p className="mt-3 text-sm text-mist">A bid whose decryption does not match h is forfeited. Check your seal with verifySealed() before sending.</p>
      </GlassCard>
      <GlassCard className="mt-6">
        <h2 className="text-lg font-bold">Call sequence</h2>
        <dl className="mt-3 grid gap-3 text-sm">
          {calls.map(([label, text]) => (
            <div key={label} className="grid gap-1 border-b border-white/5 pb-3 last:border-0 sm:grid-cols-[6rem_1fr]">
              <dt className="font-semibold text-amber">{label}</dt>
              <dd className="text-mist">{text}</dd>
            </div>
          ))}
        </dl>
      </GlassCard>
    </div>
  );
}
