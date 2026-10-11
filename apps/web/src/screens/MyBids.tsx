import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { friendlyError, loadMyBids, priceAt, readStoredBid, useAuction, type MyBid } from "../auction";
import { Badge, GlassCard, PrimaryButton } from "../components/ui";

const explorer = "https://testnet.monadscan.com";

function stage({ auction, bid }: MyBid, now: number) {
  if (auction.status === 3) return bid.claimed ? ["Refunded", "text-teal"] : ["Cancelled, refund ready", "text-amber"];
  if (auction.status === 2) {
    if (bid.claimed) return ["Claimed", "text-teal"];
    if (!bid.revealed) return ["Not revealed, deposit back", "text-amber"];
    return bid.allocation > 0n ? ["Won, ready to claim", "text-amber"] : ["Below price, refund ready", "text-amber"];
  }
  if (now < auction.commitDeadline) return ["Sealed, bidding open", "text-lavender"];
  if (now < auction.revealDeadline) return bid.revealed ? ["Revealed, waiting", "text-teal"] : ["Reveal now", "text-amber"];
  return ["Waiting for settlement", "text-lilac"];
}

export function MyBids() {
  const { account, auctions, now, busy, actOn, connect, loading } = useAuction();
  const [rows, setRows] = useState<MyBid[] | null>(null);
  const [failed, setFailed] = useState("");

  useEffect(() => {
    if (!account || auctions.length === 0) {
      setRows(account ? [] : null);
      return;
    }
    let live = true;
    loadMyBids(auctions, account)
      .then((next) => { if (live) setRows(next); })
      .catch((reason: unknown) => { if (live) setFailed(friendlyError(reason, "Could not read your bids.")); });
    return () => { live = false; };
  }, [account, auctions]);

  const won = rows?.reduce((sum, row) => sum + (row.auction.status === 2 ? row.bid.allocation : 0n), 0n) ?? 0n;
  const pending = rows?.filter((row) => (row.auction.status === 2 || row.auction.status === 3) && !row.bid.claimed).length ?? 0;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-20">
      <Badge>My bids</Badge>
      <h1 className="mt-5 text-4xl font-bold tracking-[-0.04em] sm:text-5xl">Your bids, results and refunds.</h1>
      <p className="mt-3 max-w-xl text-mist">Every bid this wallet placed, with what happens next. Claim tokens or refunds right here.</p>

      {!account ? (
        <GlassCard className="mt-8 max-w-md">
          <p className="text-mist">Connect the wallet you bid with to see your bids.</p>
          <div className="mt-4"><PrimaryButton onClick={() => { void connect(); }}>Connect wallet</PrimaryButton></div>
        </GlassCard>
      ) : (
        <>
          <section className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              ["Bids placed", String(rows?.length ?? "…")],
              ["Tokens won", won.toString()],
              ["Claims waiting", String(pending)],
            ].map(([label, value]) => (
              <GlassCard key={label} className="lift">
                <div className="text-sm text-lilac">{label}</div>
                <div className="mt-1 text-3xl font-bold tabular-nums text-paper">{value}</div>
              </GlassCard>
            ))}
          </section>

          {failed ? <p className="mt-6 break-words text-amber" role="alert">{failed}</p> : null}
          {rows === null || loading ? (
            <div className="mt-6 grid gap-3">{[0, 1].map((row) => <div key={row} className="shimmer h-24 rounded-[20px] bg-white/5" />)}</div>
          ) : rows.length === 0 ? (
            <GlassCard className="mt-6">
              <p className="text-mist">This wallet has no bids yet. <Link className="text-amber" to="/">Find an open auction</Link>.</p>
            </GlassCard>
          ) : (
            <ul className="mt-6 grid gap-4">
              {rows.map((row) => {
                const { auction, bid } = row;
                const [label, color] = stage(row, now);
                const stored = readStoredBid(auction.id, account);
                const step = bid.revealed ? bid.priceStep : stored?.step;
                const qty = bid.revealed ? bid.quantity.toString() : stored?.quantity;
                const paid = auction.status === 2 ? auction.clearingPrice * bid.allocation : 0n;
                const refund = auction.status === 3 ? auction.deposit : auction.status === 2 ? auction.deposit - paid : null;
                const canClaim = (auction.status === 2 || auction.status === 3) && !bid.claimed;
                const needsReveal = auction.status === 1 && now >= auction.commitDeadline && now < auction.revealDeadline && !bid.revealed;
                return (
                  <li key={auction.id.toString()}>
                    <GlassCard>
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                          <Link className="text-xl font-bold text-paper no-underline hover:text-amber" to={`/auction/${auction.id}`}>Auction {auction.id.toString()}</Link>
                          <p className={`mt-1 text-sm font-semibold ${color}`}>{label}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {canClaim ? (
                            <div className="w-44">
                              <PrimaryButton disabled={busy} onClick={() => { void actOn("claim", auction.id); }}>
                                {auction.status === 3 || bid.allocation === 0n ? "Claim refund" : "Claim tokens"}
                              </PrimaryButton>
                            </div>
                          ) : null}
                          {needsReveal ? (
                            <Link className="btn-primary inline-flex items-center no-underline" to={`/auction/${auction.id}`}><span className="relative z-10">Reveal</span></Link>
                          ) : null}
                          {auction.status === 2 ? (
                            <Link className="btn-secondary inline-flex items-center no-underline" to={`/auction/${auction.id}/result`}>Result</Link>
                          ) : null}
                        </div>
                      </div>
                      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
                        <div><dt className="text-lilac">Your price</dt><dd className="font-mono text-paper">{step === undefined ? "hidden" : priceAt(auction, step).toString()}</dd></div>
                        <div><dt className="text-lilac">Tokens asked</dt><dd className="font-mono text-paper">{qty ?? "hidden"}</dd></div>
                        <div><dt className="text-lilac">Received</dt><dd className="font-mono text-paper">{auction.status === 2 ? bid.allocation.toString() : "—"}</dd></div>
                        <div><dt className="text-lilac">Refund</dt><dd className="font-mono text-teal">{refund === null ? "after settlement" : refund.toString()}</dd></div>
                      </dl>
                      {stored?.commitTx || stored?.revealTx ? (
                        <p className="mt-3 flex flex-wrap gap-4 text-xs">
                          {stored.commitTx ? <a className="text-lilac hover:text-amber" href={`${explorer}/tx/${stored.commitTx}`} target="_blank" rel="noreferrer">Seal transaction ↗</a> : null}
                          {stored.revealTx ? <a className="text-lilac hover:text-amber" href={`${explorer}/tx/${stored.revealTx}`} target="_blank" rel="noreferrer">Reveal transaction ↗</a> : null}
                        </p>
                      ) : null}
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
