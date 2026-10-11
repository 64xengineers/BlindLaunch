import { Link } from "react-router-dom";
import { readAuctionMeta, useAuction } from "../auction";
import { formatDate } from "../components/trust";
import { Badge, GlassCard, PrimaryButton, SecondaryButton } from "../components/ui";

function statusLabel(status: number, now: number, commitDeadline: number, revealDeadline: number) {
  if (status === 2) return "Settled";
  if (status === 3) return "Cancelled";
  if (now < commitDeadline) return "Bidding open";
  if (now < revealDeadline) return "Revealing";
  return "Ready to settle";
}

export function TeamDashboard() {
  const { account, auctions, now, busy, actOn, connect } = useAuction();
  const mine = account ? auctions.filter((auction) => auction.authority.toLowerCase() === account.toLowerCase()) : [];
  const raised = mine.reduce((sum, auction) => sum + (auction.status === 2 ? auction.clearingPrice * auction.totalSold : 0n), 0n);
  const bidders = mine.reduce((sum, auction) => sum + auction.bidCount, 0);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-20">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge>For teams</Badge>
          <h1 className="mt-5 text-4xl font-bold tracking-[-0.04em] sm:text-5xl">Team dashboard</h1>
          <p className="mt-3 max-w-xl text-mist">Auctions created by this wallet: what they raised, who bid, and the price. Collect proceeds when they settle.</p>
        </div>
        <SecondaryButton to="/create">Create an auction</SecondaryButton>
      </div>

      {!account ? (
        <GlassCard className="mt-8 max-w-md">
          <p className="text-mist">Connect the wallet that created your auctions.</p>
          <div className="mt-4"><PrimaryButton onClick={() => { void connect(); }}>Connect wallet</PrimaryButton></div>
        </GlassCard>
      ) : (
        <>
          <section className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              ["Raised, settled auctions", raised.toString()],
              ["Auctions created", String(mine.length)],
              ["Total bidders", String(bidders)],
            ].map(([label, value]) => (
              <GlassCard key={label} className="lift">
                <div className="text-sm text-lilac">{label}</div>
                <div className="mt-1 text-3xl font-bold tabular-nums text-amber">{value}</div>
              </GlassCard>
            ))}
          </section>

          {mine.length === 0 ? (
            <GlassCard className="mt-6">
              <p className="text-mist">This wallet has not created an auction yet. <Link className="text-amber" to="/create">Create the first one</Link>.</p>
            </GlassCard>
          ) : (
            <ul className="mt-6 grid gap-4">
              {mine.map((auction) => {
                const meta = readAuctionMeta(auction.id);
                const settled = auction.status === 2;
                const canReclaim = (settled || auction.status === 3) && !auction.reclaimed;
                const fill = auction.supply > 0n ? Number((auction.totalSold * 100n) / auction.supply) : 0;
                return (
                  <li key={auction.id.toString()}>
                    <GlassCard>
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                          <Link className="text-xl font-bold text-paper no-underline hover:text-amber" to={`/auction/${auction.id}`}>
                            {meta?.name || `Auction ${auction.id.toString()}`}
                          </Link>
                          <p className="mt-1 text-sm text-lilac">{statusLabel(auction.status, now, auction.commitDeadline, auction.revealDeadline)} · closes {formatDate(auction.commitDeadline)}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {canReclaim ? (
                            <div className="w-48">
                              <PrimaryButton disabled={busy} onClick={() => { void actOn("reclaim", auction.id); }}>
                                {settled ? "Collect proceeds" : "Take tokens back"}
                              </PrimaryButton>
                            </div>
                          ) : null}
                          {auction.reclaimed ? <span className="inline-flex min-h-11 items-center text-sm text-teal">✓ Collected</span> : null}
                          {settled ? <Link className="btn-secondary inline-flex items-center no-underline" to={`/auction/${auction.id}/result`}>Result</Link> : null}
                        </div>
                      </div>
                      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
                        <div><dt className="text-lilac">Price</dt><dd className="font-mono text-amber">{settled && auction.totalSold > 0n ? auction.clearingPrice.toString() : "—"}</dd></div>
                        <div><dt className="text-lilac">Raised</dt><dd className="font-mono text-paper">{settled ? (auction.clearingPrice * auction.totalSold).toString() : "—"}</dd></div>
                        <div><dt className="text-lilac">Bidders</dt><dd className="font-mono text-paper">{auction.bidCount} of {auction.maxSlots}</dd></div>
                        <div><dt className="text-lilac">Sold</dt><dd className="font-mono text-paper">{auction.totalSold.toString()} / {auction.supply.toString()}</dd></div>
                      </dl>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full rounded-full bg-gradient-to-r from-lavender to-amber" style={{ width: `${fill}%` }} />
                      </div>
                      <p className="mt-3 text-xs text-lilac">Trading pool: not part of this build. After launch, winners hold the SALE test token in their wallets.</p>
                    </GlassCard>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
