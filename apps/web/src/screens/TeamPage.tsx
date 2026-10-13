import { Link } from "react-router-dom";
import { useSession } from "../auth/session";
import { reads } from "../chain/clients";
import { formatAmount } from "../chain/format";
import { phaseOf, type AuctionView } from "../chain/model";
import { phaseMessage } from "../components/auction";
import { GlassCard, SecondaryButton } from "../components/ui";
import { useNow, usePolling } from "../state/hooks";
import { SCAN_PAGES } from "./MyBids";

export function TeamPage() {
  const { signer } = useSession();
  const account = signer?.address ?? null;
  const now = useNow();
  const { data, loading } = usePolling(
    reads && account ? async () => {
      const next = await reads!.nextAuctionId();
      const ids = (await Promise.all(Array.from({ length: SCAN_PAGES }, (_, page) => reads!.pageIds(page, next)))).flat();
      const auctions = await Promise.all(ids.map((id) => reads!.auction(id)));
      return auctions.filter((a): a is AuctionView => a !== null && a.authority.toLowerCase() === account.toLowerCase());
    } : null,
    [account],
    10_000,
  );
  return (
    <div className="mx-auto max-w-4xl px-4 pb-20">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-5xl font-bold tracking-[-0.04em]">For teams</h1>
        <SecondaryButton to="/create">Create an auction</SecondaryButton>
      </div>
      {!account ? <p className="mt-6 text-mist">Connect the wallet that creates your auctions.</p> : null}
      {account && loading && !data ? <div className="mt-6 shimmer h-24 rounded-2xl bg-white/5" /> : null}
      {data && data.length === 0 ? <p className="mt-6 text-mist">No auctions created by this account yet.</p> : null}
      <div className="mt-6 grid gap-4">
        {data?.map((auction) => {
          const phase = phaseOf(auction, now);
          return (
            <GlassCard key={auction.id.toString()}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-bold">{auction.sale.name} <span className="font-mono text-sm text-lilac">#{auction.id.toString()}</span></h2>
                  <p className="text-sm text-mist">{phaseMessage(phase, auction, now)}</p>
                  <p className="text-xs text-lilac">{auction.bidCount} bids · {formatAmount(auction.supply, auction.sale.decimals)} {auction.sale.symbol} for sale</p>
                </div>
                <Link className="btn-secondary inline-flex min-h-11 items-center no-underline" to={phase === "settled" || phase === "cancelled" ? `/auction/${auction.id}/result` : `/auction/${auction.id}`}>Manage</Link>
              </div>
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
}
