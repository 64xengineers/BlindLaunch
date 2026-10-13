import { Link } from "react-router-dom";
import { useSession } from "../auth/session";
import { reads } from "../chain/clients";
import { formatAmount } from "../chain/format";
import { phaseOf, type AuctionView } from "../chain/model";
import { GlassCard, PrimaryButton } from "../components/ui";
import { callAuction } from "../state/actions";
import { useNow, usePolling, useRunner } from "../state/hooks";

/** How many recent auctions the bid and team lists scan. */
export const SCAN_PAGES = 5;

export function MyBids() {
  const { signer } = useSession();
  const account = signer?.address ?? null;
  const now = useNow();
  const { run, busy } = useRunner();
  const { data, loading, reload } = usePolling(
    reads && account ? async () => {
      const next = await reads!.nextAuctionId();
      const ids = (await Promise.all(Array.from({ length: SCAN_PAGES }, (_, page) => reads!.pageIds(page, next)))).flat();
      const slots = await Promise.all(ids.map((id) => reads!.slotOf(id, account)));
      const mine = ids.flatMap((id, index) => (slots[index] === null || slots[index] === undefined ? [] : [{ id, slot: slots[index] }]));
      return Promise.all(mine.map(async ({ id, slot }) => {
        const [auction, bid] = await Promise.all([reads!.auction(id), reads!.bid(id, slot)]);
        const claimable = auction && auction.status >= 2 ? await reads!.claimable(id, account) : null;
        return { auction: auction as AuctionView, bid, claimable };
      }));
    } : null,
    [account],
    10_000,
  );

  return (
    <div className="mx-auto max-w-4xl px-4 pb-20">
      <h1 className="text-5xl font-bold tracking-[-0.04em]">My bids</h1>
      {!account ? <p className="mt-6 text-mist">Connect a wallet or sign in with a passkey to see your bids.</p> : null}
      {account && loading && !data ? <div className="mt-6 shimmer h-24 rounded-2xl bg-white/5" /> : null}
      {data && data.length === 0 ? <p className="mt-6 text-mist">No bids from this account in the last {SCAN_PAGES * 20} auctions. <Link className="text-amber" to="/">Find an auction</Link>.</p> : null}
      <div className="mt-6 grid gap-4">
        {data?.map(({ auction, bid, claimable }) => {
          const phase = phaseOf(auction, now);
          const owed = claimable ? claimable[0] + claimable[1] : 0n;
          return (
            <GlassCard key={auction.id.toString()}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">{auction.sale.name} <span className="font-mono text-sm text-lilac">#{auction.id.toString()}</span></h2>
                  <p className="text-sm text-mist">
                    {!bid?.opened ? "Sealed, opens itself after the deadline" : bid.forfeited ? "Did not match its commitment: deposit forfeited" : bid.counted ? `Opened: ${bid.quantity} at ≤ ${formatAmount(auction.minPrice + BigInt(bid.step) * auction.stepSize, auction.quote.decimals, 4)} ${auction.quote.symbol}` : "Opened, not counted: refunded in full"}
                  </p>
                  {claimable ? <p className="text-sm text-lilac">To claim: {formatAmount(claimable[0], auction.sale.decimals)} {auction.sale.symbol} and {formatAmount(claimable[1], auction.quote.decimals)} {auction.quote.symbol}</p> : null}
                </div>
                <div className="flex gap-2">
                  <Link className="btn-secondary inline-flex min-h-11 items-center no-underline" to={phase === "settled" || phase === "cancelled" ? `/auction/${auction.id}/result` : `/auction/${auction.id}`}>Open</Link>
                  {owed > 0n ? <div className="w-32"><PrimaryButton disabled={busy !== null} onClick={() => void run("Claim", (w) => callAuction(w, "claim", auction.id)).then(reload)}>Claim</PrimaryButton></div> : null}
                </div>
              </div>
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
}
