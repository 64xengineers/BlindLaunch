import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { auctionAddress } from "../config";
import { priceAt, shortAddress, useAuction } from "../auction";
import { AuctionChart } from "../components/sections";
import { Badge, GlassCard, PrimaryButton, Reveal, SecondaryButton } from "../components/ui";

export function Result() {
  const { id } = useParams();
  const { selectAuction, selected, bids, myBid, account, busy, act, loading } = useAuction();

  useEffect(() => {
    if (id) selectAuction(BigInt(id));
  }, [id, selectAuction]);

  if (loading || !selected) {
    return (
      <div className="mx-auto grid max-w-6xl gap-6 px-4 pb-16 md:grid-cols-2" aria-label="Loading result">
        <div className="shimmer h-64 rounded-[20px] bg-white/5" />
        <div className="shimmer h-64 rounded-[20px] bg-white/5" />
      </div>
    );
  }
  if (selected.status !== 2) {
    return (
      <div className="mx-auto max-w-xl px-4 pb-16 text-center">
        <Badge tone="paper">Auction {selected.id.toString()}</Badge>
        <h1 className="mt-5 text-4xl font-bold tracking-[-0.04em]">No clearing price yet.</h1>
        <p className="mt-3 text-mist">{selected.status === 3 ? "This auction was cancelled. Deposits can be claimed back." : "The auction has not been settled."}</p>
        <div className="mt-6"><SecondaryButton to={`/auction/${selected.id}`}>Go to the auction</SecondaryButton></div>
      </div>
    );
  }

  const sold = selected.totalSold > 0n;
  const received = myBid?.allocation ?? 0n;
  const paid = selected.clearingPrice * received;
  const refund = myBid ? selected.deposit - paid : 0n;
  const explorer = `https://testnet.monadscan.com/address/${auctionAddress}`;
  const isAuthority = account?.toLowerCase() === selected.authority.toLowerCase();
  const revealed = bids.filter((bid) => bid.revealed);
  const fillRate = selected.supply > 0n ? Number((selected.totalSold * 100n) / selected.supply) : 0;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-20">
      <section className="grid items-center gap-8 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="rise min-w-0">
          <Badge>Auction {selected.id.toString()} closed</Badge>
          <h1 className="mt-5 break-words text-5xl font-bold leading-[0.95] tracking-[-0.04em] sm:text-6xl lg:text-7xl">
            One price.<br /><span className="text-amber">{sold ? selected.clearingPrice.toString() : "No sale"}</span>
          </h1>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-mist">
            {sold ? "Every winner paid the same. Unused deposit goes back to each bidder." : "No revealed bid reached the lowest price. Every deposit can be claimed back."}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <div className="sm:w-56">
              <PrimaryButton disabled={!account || busy || !myBid || myBid.claimed} onClick={() => act("claim")}>
                {myBid?.claimed ? "Already claimed" : busy ? "Claiming…" : "Claim my tokens"}
              </PrimaryButton>
            </div>
            <SecondaryButton href={explorer}>View on explorer</SecondaryButton>
          </div>
          {!account ? <p className="mt-3 text-sm text-lilac">Connect the wallet that bid to see your numbers.</p> : null}
        </div>
        <GlassCard className="rise d1">
          <AuctionChart auction={selected} bids={bids} />
        </GlassCard>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-3">
        {[
          ["You received", `${received.toString()} tokens`, "text-paper"],
          ["You paid", paid.toString(), "text-paper"],
          ["Refunded to you", refund.toString(), "text-teal"],
        ].map(([label, value, color], index) => (
          <GlassCard key={label} className={`lift rise d${index + 1}`}>
            <div className="text-sm text-lilac">{label}</div>
            <div className={`mt-2 break-words text-3xl font-bold tabular-nums ${color}`}>{value}</div>
          </GlassCard>
        ))}
      </section>

      <Reveal className="mt-12">
        <section className="glass p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="text-2xl font-bold">How the auction ended</h2>
            <div className="w-full max-w-xs">
              <div className="flex justify-between text-sm text-lilac"><span>Sold</span><span className="font-mono text-paper">{selected.totalSold.toString()} / {selected.supply.toString()}</span></div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-lavender to-amber transition-all duration-700" style={{ width: `${fillRate}%` }} />
              </div>
            </div>
          </div>
          <dl className="mt-6 grid gap-4 sm:grid-cols-3">
            <div><dt className="text-sm text-lilac">Bids sealed</dt><dd className="mt-1 font-mono text-xl text-paper">{bids.length}</dd></div>
            <div><dt className="text-sm text-lilac">Bids revealed</dt><dd className="mt-1 font-mono text-xl text-paper">{revealed.length}</dd></div>
            <div><dt className="text-sm text-lilac">Clearing step</dt><dd className="mt-1 font-mono text-xl text-paper">{selected.clearingStep} of {selected.stepCount - 1}</dd></div>
          </dl>
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead className="text-lilac">
                <tr className="border-b border-white/10">
                  <th className="py-3 pr-3 font-medium">Bidder</th>
                  <th className="py-3 pr-3 font-medium">Bid price</th>
                  <th className="py-3 pr-3 font-medium">Wanted</th>
                  <th className="py-3 pr-3 font-medium">Received</th>
                  <th className="py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {bids.map((bid) => {
                  const mine = account && bid.bidder.toLowerCase() === account.toLowerCase();
                  return (
                    <tr key={bid.slot} className={`border-b border-white/5 transition-colors hover:bg-white/[0.04] ${mine ? "bg-amber/10" : ""}`}>
                      <td className="py-3 pr-3 font-mono text-paper">{shortAddress(bid.bidder)}{mine ? <span className="ml-2 text-xs text-amber">you</span> : null}</td>
                      <td className="py-3 pr-3 font-mono text-mist">{bid.revealed ? priceAt(selected, bid.priceStep).toString() : "hidden"}</td>
                      <td className="py-3 pr-3 font-mono text-mist">{bid.revealed ? bid.quantity.toString() : "hidden"}</td>
                      <td className="py-3 pr-3 font-mono text-paper">{bid.allocation.toString()}</td>
                      <td className={`py-3 ${bid.allocation > 0n ? "text-teal" : "text-lilac"}`}>
                        {!bid.revealed ? "Not revealed" : bid.allocation > 0n ? "Filled" : "Below price"}
                        {bid.claimed ? " · claimed" : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </Reveal>

      {isAuthority ? (
        <Reveal className="mt-6">
          <GlassCard className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold">You created this auction</h2>
              <p className="mt-1 text-sm text-mist">Collect the sale proceeds and any unsold tokens.</p>
            </div>
            <div className="w-full sm:w-56">
              <PrimaryButton disabled={busy || selected.reclaimed} onClick={() => act("reclaim")}>
                {selected.reclaimed ? "Proceeds collected" : "Reclaim proceeds"}
              </PrimaryButton>
            </div>
          </GlassCard>
        </Reveal>
      ) : null}

      <p className="mt-8 text-sm text-lilac"><Link className="text-amber" to="/">Back to all auctions</Link></p>
    </div>
  );
}
