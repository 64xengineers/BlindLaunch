import { useState } from "react";
import { Link } from "react-router-dom";
import { reads } from "../chain/clients";
import { network } from "../chain/config";
import { formatAmount, formatLeft } from "../chain/format";
import { formatPrice, phaseOf, type AuctionView } from "../chain/model";
import { ClearingSimulator, FaqSection, MonadSection, StepsSection, TeamsCta } from "../components/sections";
import { BotRaceDemo, PrivacySection, RiskNotice } from "../components/trust";
import { Badge, GlassCard, Reveal, SecondaryButton, Vault } from "../components/ui";
import { useNow, usePolling } from "../state/hooks";

type Filter = "all" | "open" | "closed";

function describe(auction: AuctionView, now: bigint) {
  const to = `/auction/${auction.id}`;
  const phase = phaseOf(auction, now);
  switch (phase) {
    case "scheduled": return { open: false, line: `Opens in ${formatLeft(Number(auction.commitStart - now))}`, action: "View", to };
    case "bidding": return { open: true, line: `Open, closes in ${formatLeft(Number(auction.commitDeadline - now))}`, action: "Place a bid", to };
    case "awaitingKeys": return { open: false, line: "Closed, bids opening", action: "Follow", to };
    case "opening": return { open: false, line: "Closed, bids opening", action: "Open bids", to };
    case "ready": return { open: false, line: "Ready to settle", action: "Settle", to };
    case "cancellable": return { open: false, line: "Keys never came, refunds available", action: "Cancel", to };
    case "settled": return { open: false, line: "Settled", action: "Result", to: `${to}/result` };
    case "cancelled": return { open: false, line: "Cancelled, deposits refundable", action: "Refund", to: `${to}/result` };
  }
}

const features = [
  ["Bid once, walk away", "Your bid is encrypted on your device and opens itself on chain after the deadline. No reveal step."],
  ["One price for all", "Everyone who wins pays the same price, however high they bid."],
  ["Trading at that price", "The token's Kuru order book opens at the clearing price, so the race does not restart at listing."],
];

export function Home() {
  const now = useNow();
  const [filter, setFilter] = useState<Filter>("all");
  const [pages, setPages] = useState(1);
  const { data, loading, error } = usePolling(
    reads ? async () => {
      const next = await reads!.nextAuctionId();
      const ids = (await Promise.all(Array.from({ length: pages }, (_, page) => reads!.pageIds(page, next)))).flat();
      const auctions = (await Promise.all(ids.map((id) => reads!.auction(id)))).filter((a): a is AuctionView => a !== null);
      return { auctions, total: Number(next - 1n) };
    } : null,
    [pages],
  );
  const auctions = data?.auctions ?? [];
  const visible = auctions.filter((auction) => filter === "all" || (filter === "open") === describe(auction, now).open);
  const openCount = auctions.filter((auction) => describe(auction, now).open).length;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-20">
      <section className="grid items-center gap-10 py-6 md:grid-cols-[1.1fr_0.9fr] md:py-10">
        <div className="rise">
          <Badge>Sealed-bid token launches on {network.label}</Badge>
          <h1 className="mt-5 text-5xl font-bold leading-[0.95] tracking-[-0.04em] text-paper sm:text-6xl lg:text-7xl">Launches without the bot race.</h1>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-mist">Bid once in secret. One price is chosen for everyone. Trading opens at that price.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a className="btn-primary inline-flex items-center justify-center no-underline" href="#auctions"><span className="relative z-10">Browse auctions</span></a>
            <SecondaryButton to="/how">How it works</SecondaryButton>
          </div>
          {openCount > 0 ? (
            <p className="mt-6 flex items-center gap-2 text-sm text-mist"><span className="pulse-dot h-2 w-2 rounded-full bg-amber" />{openCount} auction{openCount === 1 ? "" : "s"} open for bids now</p>
          ) : null}
        </div>
        <div className="rise d2"><Vault /></div>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        {features.map(([title, copy], index) => (
          <GlassCard key={title} className={`lift rise d${index + 1}`}>
            <div className="h-1 rounded-full bg-gradient-to-r from-lavender/70 via-lavender/40 to-transparent" />
            <h2 className="mt-5 text-xl font-bold text-paper">{title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-mist">{copy}</p>
          </GlassCard>
        ))}
      </section>

      <Reveal className="mt-12">
        <section id="auctions" className="glass scroll-mt-6 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-bold">Auctions</h2>
            <div className="flex rounded-full border border-white/15 bg-white/5 p-1" role="tablist" aria-label="Filter auctions">
              {(["all", "open", "closed"] as Filter[]).map((value) => (
                <button key={value} type="button" role="tab" aria-selected={filter === value}
                  className={`min-h-9 rounded-full px-4 text-sm capitalize transition-colors ${filter === value ? "bg-amber font-semibold text-ink" : "text-mist hover:text-paper"}`}
                  onClick={() => setFilter(value)}>{value}</button>
              ))}
            </div>
          </div>
          {!reads ? <p className="mt-4 text-mist">Blindlaunch is not deployed on {network.label} yet.</p> : null}
          {reads && loading && !data ? <div className="mt-4 grid gap-3">{[0, 1, 2].map((row) => <div key={row} className="shimmer h-16 rounded-2xl bg-white/5" />)}</div> : null}
          {error ? <p className="mt-4 rounded-2xl border border-amber/40 bg-white/5 p-4 text-paper" role="alert">{error}</p> : null}
          {data && visible.length === 0 ? <p className="mt-6 text-mist">No {filter === "all" ? "" : filter} auctions here. <Link className="text-amber" to="/create">Create one</Link>.</p> : null}
          <ul className="mt-3 divide-y divide-white/10">
            {visible.map((auction) => {
              const info = describe(auction, now);
              return (
                <li key={auction.id.toString()} className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="min-w-0">
                    <h3 className="flex items-center gap-2 text-lg font-bold text-paper">
                      {info.open ? <span className="pulse-dot h-2 w-2 rounded-full bg-amber" /> : null}
                      {auction.sale.name} <span className="font-mono text-sm text-lilac">#{auction.id.toString()}</span>
                    </h3>
                    <p className="font-mono text-xs text-lilac tabular-nums sm:text-sm">{info.line}</p>
                    <p className="mt-1 text-xs text-lilac">
                      {formatAmount(auction.supply, auction.sale.decimals)} {auction.sale.symbol} · from {formatPrice(auction.minPrice, auction, auction.sale, auction.quote)}
                      {auction.status === 2 && auction.totalSold > 0n ? <> · cleared at <span className="text-amber">{formatAmount(auction.clearingPrice, auction.quote.decimals, 6)}</span></> : null}
                    </p>
                  </div>
                  <Link to={info.to} className={`inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold no-underline transition-transform hover:-translate-y-0.5 ${info.open ? "bg-amber text-ink" : "border border-amber/50 bg-amber/10 text-amber"}`}>{info.action}</Link>
                </li>
              );
            })}
          </ul>
          {data && auctions.length < data.total ? (
            <button type="button" className="btn-secondary mt-4 min-h-11" onClick={() => setPages((value) => value + 1)}>Show older auctions</button>
          ) : null}
        </section>
      </Reveal>

      <ClearingSimulator />
      <BotRaceDemo />
      <PrivacySection />
      <StepsSection />
      <MonadSection />
      <TeamsCta />
      <FaqSection />
      <RiskNotice />
    </div>
  );
}
