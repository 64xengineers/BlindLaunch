import type { CSSProperties, ReactNode } from "react";
import { network } from "../chain/config";
import type { IconName } from "../components/art";
import { CopyButton, Icon } from "../components/ui";

const calls = [
  ["Create", "KeeperRegistry must have a fresh key in each keeper queue. Approve the supply, then createAuction(params). The auction id is in the AuctionCreated event."],
  ["Bid", "Read keeperKeysOf(id). Seal with @blindlaunch/sealed-bid: seal({ chainId, contract, auctionId, bidder, step, quantity, keeperKeys }). Approve the deposit, then commit(id, R, c, h)."],
  ["Open", "After commitDeadline two keepers call publishKey. Anyone then calls openMany(id, slots, sharedA, sharedB) with sharedPoint(publishedKey, R) for the frozen pair."],
  ["Settle", "When every bid is open, anyone calls settle(id). It reads storage only."],
  ["Market", "If seeding is on, anyone calls handOffSeed(id); MarketSeeder opens a Kuru market at the clearing price. After the lock, anyone calls MarketSeeder.unwind(id) to pay the creator."],
  ["Claim", "Bidders call claim(id), or claimRefund / claimTokens for one leg. The creator calls reclaim(id), or reclaimUnsold / reclaimProceeds."],
  ["Cancel", "If two keys are not published by cancelAfter, anyone calls cancel(id) and every deposit is refunded."],
];

/** Wraps call names like createAuction(params) in code style so the steps scan quickly. */
function codeify(text: string): ReactNode[] {
  return text.split(/(\b[\w.@/-]+\([^)]*\))/g).map((part, index) => (index % 2 === 1 ? <code key={index}>{part}</code> : part));
}

function DocPanel({ icon, colour, title, children }: { icon: IconName; colour: string; title: ReactNode; children: ReactNode }) {
  return (
    <section className="panel hm-doc" style={{ "--c": colour } as CSSProperties}>
      <h2><span className="ic-box"><Icon name={icon} size={20} /></span>{title}</h2>
      {children}
    </section>
  );
}

export function Docs() {
  const d = network.deployment;
  const addresses: [string, string][] = d
    ? [["BlindAuctionV2", d.auction], ["KeeperRegistry", d.registry], ["MarketSeeder", d.seeder], ["TokenFactory", d.factory], ["Payment token", d.quote]]
    : [];
  return (
    <div className="hm-wrap is-narrow">
      <header className="hm-page-head rise">
        <div>
          <span className="label !text-cyan">For builders</span>
          <h1 className="hm-h1 mt-2">Integration docs</h1>
          <p className="hm-sub">Everything a launchpad, wallet or bot needs to use Blindlaunch auctions directly.</p>
        </div>
      </header>

      <DocPanel icon="flag" colour="var(--color-cyan)" title={<>{network.label} <span className="num text-[17px] text-muted">chain {network.chain.id}</span></>}>
        {addresses.length === 0 ? <p className="m-0 mt-3 text-muted">Not deployed on this network yet.</p> : null}
        <ul className="hm-addr">
          {addresses.map(([label, address]) => (
            <li key={label}>
              <span className="who">{label}</span>
              <span className="flex min-w-0 items-center gap-1"><code>{address}</code><CopyButton value={address} /></span>
            </li>
          ))}
        </ul>
      </DocPanel>

      <DocPanel icon="lock" colour="var(--color-yellow)" title="Bid format">
        <pre className="hm-code">{`m = step << 224 | quantity << 128 | nonce        // nonce: 128 random bits
h = keccak256(abi.encode(chainid, auction, auctionId, bidder, m))
shares y_i = m + a·(i+1) mod n                    // Shamir 2-of-3, n = secp256k1 order
R = r·G,  c_i = y_i XOR keccak256(abi.encodePacked(r·P_i, uint8(i)))
commit(auctionId, R, [c_0, c_1, c_2], h)`}</pre>
        <p className="m-0 mt-4 flex items-start gap-3 text-muted">
          <Icon name="alert" size={20} className="mt-0.5 text-coral" />
          <span>A bid whose decryption does not match h is forfeited. Check your seal with <code>verifySealed()</code> before sending.</span>
        </p>
      </DocPanel>

      <DocPanel icon="chevron-right" colour="var(--color-green)" title="Call sequence">
        <ol className="hm-calls">
          {calls.map(([label, text]) => (
            <li key={label}>
              <b>{label}</b>
              <span>{codeify(text!)}</span>
            </li>
          ))}
        </ol>
      </DocPanel>
    </div>
  );
}
