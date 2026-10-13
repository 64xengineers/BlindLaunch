import { allocationOf } from "@blindlaunch/sealed-bid";
import { Link, useParams } from "react-router-dom";
import type { Address } from "viem";
import { useSession } from "../auth/session";
import { reads } from "../chain/clients";
import { explorerUrl, network } from "../chain/config";
import { formatAmount, formatDate, shortAddress } from "../chain/format";
import { formatPrice, phaseOf, SEED, type AuctionView, type BidView } from "../chain/model";
import { outcomeOf, VerifyLinks } from "../components/auction";
import { Badge, GlassCard, PrimaryButton } from "../components/ui";
import { callAuction, claimLeg, openMarket, seedCall } from "../state/actions";
import { useNow, usePolling, useRunner } from "../state/hooks";
import { NotFound } from "./NotFound";

export function ResultPage() {
  const { id } = useParams();
  if (!id || !/^\d+$/.test(id)) return <NotFound />;
  if (!reads) return <NotFound message={`Blindlaunch is not deployed on ${network.label} yet.`} />;
  return <ResultScreen id={BigInt(id)} />;
}

function ResultScreen({ id }: { id: bigint }) {
  const { signer } = useSession();
  const account = signer?.address ?? null;
  const now = useNow();
  const { data, loading, reload } = usePolling(async () => {
    const auction = await reads!.auction(id);
    if (!auction) return null;
    const [bids, position, slot] = await Promise.all([
      reads!.bids(id, auction.bidCount),
      reads!.position(id),
      account ? reads!.slotOf(id, account) : Promise.resolve(null),
    ]);
    const claimable = account && slot !== null && auction.status >= 2 ? await reads!.claimable(id, account) : null;
    return { auction, bids, position, slot, claimable };
  }, [id, account]);

  if (loading && !data) return <div className="mx-auto max-w-6xl px-4"><div className="shimmer h-72 rounded-[20px] bg-white/5" /></div>;
  if (!data) return <NotFound message={`Auction ${id} does not exist.`} />;
  const { auction, bids, position, slot, claimable } = data;
  const phase = phaseOf(auction, now);
  if (phase !== "settled" && phase !== "cancelled") {
    return <NotFound message="This auction has not finished yet. Follow it on the auction page." />;
  }
  const settled = phase === "settled";
  const isAuthority = account !== null && account.toLowerCase() === auction.authority.toLowerCase();
  const market = position.seeded ? explorerUrl("address", position.market) : null;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-20">
      <Badge tone={settled ? "teal" : "paper"}>Auction {auction.id.toString()} · {settled ? "settled" : "cancelled"}</Badge>
      <h1 className="mt-5 text-5xl font-bold leading-[0.95] tracking-[-0.04em]">{auction.sale.name}</h1>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <GlassCard><div className="text-sm text-lilac">Everyone paid</div><div className="mt-2 text-3xl font-bold text-amber">{settled && auction.totalSold > 0n ? formatPrice(auction.clearingPrice, auction, auction.sale, auction.quote) : "Nothing"}</div></GlassCard>
        <GlassCard><div className="text-sm text-lilac">Sold</div><div className="mt-2 text-3xl font-bold">{auction.totalSold.toString()} <span className="text-base text-mist">of {auction.supplyLots.toString()} lots</span></div></GlassCard>
        <GlassCard><div className="text-sm text-lilac">Bids</div><div className="mt-2 text-3xl font-bold">{auction.bidCount}</div></GlassCard>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {slot !== null && claimable ? <ClaimCard auction={auction} claimable={claimable} onDone={reload} /> : null}
        {isAuthority ? <AuthorityCard auction={auction} onDone={reload} /> : null}
        {settled && auction.seedState !== SEED.None ? <MarketCard auction={auction} position={position} now={now} market={market} onDone={reload} /> : null}
        {settled && auction.forfeitedTotal > 0n && !auction.forfeitsBurned ? <ForfeitCard auction={auction} onDone={reload} /> : null}
      </div>

      {settled ? <AllocationTable auction={auction} bids={bids} account={account} /> : null}
      <div className="mt-6"><VerifyLinks auction={auction} extra={market ? [["Kuru market", market]] : []} /></div>
      <Link className="mt-6 inline-block text-amber" to={`/auction/${auction.id}`}>← Auction page</Link>
    </div>
  );
}

function ClaimCard({ auction, claimable, onDone }: { auction: AuctionView; claimable: readonly [bigint, bigint]; onDone: () => void }) {
  const { run, busy } = useRunner();
  const [tokens, refund] = claimable;
  const nothing = tokens === 0n && refund === 0n;
  return (
    <GlassCard>
      <h2 className="text-lg font-bold">Your claim</h2>
      <dl className="mt-3 grid gap-2 text-sm">
        <div className="flex justify-between"><dt className="text-lilac">Tokens</dt><dd className="font-mono text-paper">{formatAmount(tokens, auction.sale.decimals)} {auction.sale.symbol}</dd></div>
        <div className="flex justify-between"><dt className="text-lilac">Refund</dt><dd className="font-mono text-paper">{formatAmount(refund, auction.quote.decimals)} {auction.quote.symbol}</dd></div>
      </dl>
      <div className="mt-4 grid gap-2">
        <PrimaryButton disabled={busy !== null || nothing} onClick={() => void run("Claim", (w) => callAuction(w, "claim", auction.id)).then(onDone)}>
          {nothing ? "Nothing left to claim" : busy === "Claim" ? "Claiming…" : "Claim"}
        </PrimaryButton>
        {!nothing ? (
          <details className="text-sm">
            <summary className="min-h-11 cursor-pointer py-2 text-lilac hover:text-paper">Claim one part only</summary>
            <p className="text-xs text-lilac">If one token is paused or blocks your address, claim the other on its own.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {refund > 0n ? <button type="button" className="btn-secondary min-h-11" disabled={busy !== null} onClick={() => void run("Claim refund", (w) => claimLeg(w, "claimRefund", auction.id)).then(onDone)}>Refund only</button> : null}
              {tokens > 0n ? <button type="button" className="btn-secondary min-h-11" disabled={busy !== null} onClick={() => void run("Claim tokens", (w) => claimLeg(w, "claimTokens", auction.id)).then(onDone)}>Tokens only</button> : null}
            </div>
          </details>
        ) : null}
      </div>
    </GlassCard>
  );
}

function AuthorityCard({ auction, onDone }: { auction: AuctionView; onDone: () => void }) {
  const { run, busy } = useRunner();
  const done = auction.unsoldReclaimed && auction.proceedsReclaimed;
  return (
    <GlassCard>
      <h2 className="text-lg font-bold">You created this auction</h2>
      <p className="mt-2 text-sm text-mist">Collect the proceeds and any unsold tokens. Tokens reserved for the Kuru market come back through the market card after its lock.</p>
      <div className="mt-4 grid gap-2">
        <PrimaryButton disabled={busy !== null || done} onClick={() => void run("Reclaim", (w) => callAuction(w, "reclaim", auction.id)).then(onDone)}>
          {done ? "Already collected" : busy === "Reclaim" ? "Collecting…" : "Collect proceeds and unsold tokens"}
        </PrimaryButton>
        {!done ? (
          <div className="flex flex-wrap gap-2 text-sm">
            {!auction.proceedsReclaimed ? <button type="button" className="btn-secondary min-h-11" disabled={busy !== null} onClick={() => void run("Collect proceeds", (w) => claimLeg(w, "reclaimProceeds", auction.id)).then(onDone)}>Proceeds only</button> : null}
            {!auction.unsoldReclaimed ? <button type="button" className="btn-secondary min-h-11" disabled={busy !== null} onClick={() => void run("Collect unsold", (w) => claimLeg(w, "reclaimUnsold", auction.id)).then(onDone)}>Unsold tokens only</button> : null}
          </div>
        ) : null}
      </div>
    </GlassCard>
  );
}

type Position = Awaited<ReturnType<NonNullable<typeof reads>["position"]>>;

function MarketCard({ auction, position, now, market, onDone }: { auction: AuctionView; position: Position; now: bigint; market: string | null; onDone: () => void }) {
  const { run, busy } = useRunner();
  const locked = now < auction.seedLockUntil;
  const reserved = auction.seedState === SEED.Reserved;
  const waiting = auction.seedState === SEED.HandedOff && position.accepted && !position.seeded && !position.unwound;
  return (
    <GlassCard>
      <h2 className="text-lg font-bold">Market at the clearing price</h2>
      <p className="mt-2 text-sm text-mist">
        {formatAmount(auction.seedSale, auction.sale.decimals)} {auction.sale.symbol} and {formatAmount(auction.seedQuote, auction.quote.decimals)} {auction.quote.symbol} were set aside to open a Kuru order book at the clearing price, locked until {formatDate(auction.seedLockUntil)}.
      </p>
      <div className="mt-4 grid gap-2">
        {position.seeded && market ? <a className="btn-secondary inline-flex min-h-11 items-center justify-center no-underline" href={market} target="_blank" rel="noreferrer">Kuru market ↗</a> : null}
        {position.seeded && !market ? <p className="font-mono text-xs text-lilac">Market {shortAddress(position.market)}</p> : null}
        {reserved || waiting ? <PrimaryButton disabled={busy !== null} onClick={() => void run("Open the market", (w) => openMarket(w, auction.id)).then(onDone)}>{busy === "Open the market" ? "Opening…" : "Open the market"}</PrimaryButton> : null}
        {reserved && !locked ? <button type="button" className="btn-secondary min-h-11" disabled={busy !== null} onClick={() => void run("Release the seed", (w) => callAuction(w, "releaseSeed", auction.id)).then(onDone)}>Return the reserved seed to the creator</button> : null}
        {position.accepted && !position.unwound && !locked ? <button type="button" className="btn-secondary min-h-11" disabled={busy !== null} onClick={() => void run("Unwind the market", (w) => seedCall(w, "unwind", auction.id)).then(onDone)}>Unwind and pay the creator</button> : null}
        {position.unwound ? <p className="text-sm text-teal">Unwound. Everything went back to the creator.</p> : null}
      </div>
    </GlassCard>
  );
}

function ForfeitCard({ auction, onDone }: { auction: AuctionView; onDone: () => void }) {
  const { run, busy } = useRunner();
  return (
    <GlassCard>
      <h2 className="text-lg font-bold">Forfeited deposits</h2>
      <p className="mt-2 text-sm text-mist">
        {formatAmount(auction.forfeitedTotal, auction.quote.decimals)} {auction.quote.symbol} came from bids that did not match their own commitment. They go to a burn address, never to the creator.
      </p>
      <div className="mt-4"><PrimaryButton disabled={busy !== null} onClick={() => void run("Burn", (w) => callAuction(w, "burnForfeits", auction.id)).then(onDone)}>Burn them</PrimaryButton></div>
    </GlassCard>
  );
}

function AllocationTable({ auction, bids, account }: { auction: AuctionView; bids: readonly BidView[]; account: Address | null }) {
  const outcome = outcomeOf(auction);
  return (
    <section className="glass mt-6 overflow-x-auto p-5 sm:p-6">
      <h2 className="text-lg font-bold">Every bid</h2>
      <table className="mt-4 w-full min-w-[32rem] text-left text-sm">
        <thead className="text-lilac">
          <tr><th className="py-2 font-normal">Bid</th><th className="font-normal">Bidder</th><th className="font-normal">Asked</th><th className="font-normal">Got</th><th className="font-normal">Paid</th></tr>
        </thead>
        <tbody>
          {bids.map((bid) => {
            const lots = allocationOf({ counted: bid.counted, step: bid.step, quantity: bid.quantity, prefix: bid.prefix }, outcome);
            const mine = account !== null && bid.bidder.toLowerCase() === account.toLowerCase();
            return (
              <tr key={bid.slot} className={`border-t border-white/5 ${mine ? "text-amber" : "text-paper"}`}>
                <td className="py-2 font-mono">#{bid.slot}</td>
                <td className="font-mono">{mine ? "you" : shortAddress(bid.bidder)}</td>
                <td>{bid.forfeited ? "did not match · forfeited" : bid.counted ? `${bid.quantity} at ≤ ${formatAmount(auction.minPrice + BigInt(bid.step) * auction.stepSize, auction.quote.decimals, 4)}` : "not counted · refunded"}</td>
                <td className="font-mono">{lots.toString()}</td>
                <td className="font-mono">{formatAmount(lots * auction.clearingPrice, auction.quote.decimals)} {auction.quote.symbol}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
