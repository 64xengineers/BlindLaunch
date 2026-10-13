import { useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { reads } from "../chain/clients";
import { network } from "../chain/config";
import { formatAmount } from "../chain/format";
import { phaseOf, type AuctionView, type Phase } from "../chain/model";
import type { IconName } from "../components/art";
import { ComicStrip, SectionTitle } from "../components/sections";
import { FinePrint, TrustStickers } from "../components/trust";
import { Hush, Icon, PrimaryButton, PrimaryLink, SecondaryButton, TokenArt, timeLeft } from "../components/ui";
import { useNow, usePolling } from "../state/hooks";
import { useCountUp } from "../state/motion";

type Filter = "all" | "open" | "closed";
type Tone = "yellow" | "cyan" | "magenta" | "coral" | "green" | "violet";
type Group = "live" | "soon" | "waiting" | "finished";

const groupOf: Record<Phase, Group> = {
  scheduled: "soon", bidding: "live", awaitingKeys: "waiting", opening: "waiting", ready: "waiting", cancellable: "waiting", settled: "finished", cancelled: "finished",
};

/** Live and starting-soon launches are "open"; everything past bidding is "closed". */
function isOpen(auction: AuctionView, now: bigint) {
  const group = groupOf[phaseOf(auction, now)];
  return group === "live" || group === "soon";
}

const isDollar = (auction: AuctionView) => /usd/i.test(auction.quote.symbol);

function padFraction(text: string, min: number) {
  const [whole, fraction = ""] = text.split(".");
  return min > 0 ? `${whole}.${fraction.padEnd(min, "0")}` : text;
}

/** Price per whole token: $0.020, or "2.50 MON" when the money is not a dollar token. */
function priceText(auction: AuctionView, perLot: bigint) {
  const perToken = (perLot * 10n ** BigInt(auction.sale.decimals)) / auction.lotSize;
  const one = 10n ** BigInt(auction.quote.decimals);
  const text = padFraction(formatAmount(perToken, auction.quote.decimals, 6), perToken < one ? 3 : 2);
  return isDollar(auction) ? `$${text}` : `${text} ${auction.quote.symbol}`;
}

/** Whole money: $1,600. */
function moneyText(auction: AuctionView, value: bigint) {
  const text = formatAmount(value, auction.quote.decimals, 0);
  return isDollar(auction) ? `$${text}` : `${text} ${auction.quote.symbol}`;
}

const tokens = (auction: AuctionView) => formatAmount(auction.supply, auction.sale.decimals, 0);

type Info = {
  phase: Phase;
  chip: [Tone, IconName | "live", string];
  note: string;
  action: string;
  to: string;
  stats: [string, ReactNode, Tone?][];
};

function describe(auction: AuctionView, now: bigint): Info {
  const phase = phaseOf(auction, now);
  const page = `/auction/${auction.id}`;
  const result = `${page}/result`;
  const bids = auction.bidCount;
  const unlocked = `${auction.openedCount} of ${bids}`;
  const n = Number(now);
  switch (phase) {
    case "scheduled":
      return { phase, chip: ["violet", "clock", "Starts soon"], note: "Bidding opens soon.", action: "See launch", to: page,
        stats: [["Opens in", timeLeft(Number(auction.commitStart), n), "violet"], ["Starts at", priceText(auction, auction.minPrice)], ["For sale", tokens(auction)]] };
    case "bidding":
      return { phase, chip: ["yellow", "live", "Live"], note: "Bid before the timer runs out.", action: `Bid on ${auction.sale.symbol}`, to: page,
        stats: [["Closes in", timeLeft(Number(auction.commitDeadline), n), "yellow"], ["Secret bids", bids, "cyan"], ["Starts at", priceText(auction, auction.minPrice)]] };
    case "awaitingKeys":
      return { phase, chip: ["cyan", "key", "Unlocking"], note: "Bids are unlocking. Nothing to do.", action: "Watch it unlock", to: page,
        stats: [["Secret bids", bids, "cyan"], ["Unlocked", unlocked], ["For sale", tokens(auction)]] };
    case "opening":
      return { phase, chip: ["cyan", "key", "Unlocking"], note: "Bids are unlocking. Anyone can push it along.", action: "Unlock the rest", to: page,
        stats: [["Secret bids", bids, "cyan"], ["Unlocked", unlocked, "cyan"], ["For sale", tokens(auction)]] };
    case "ready":
      return { phase, chip: ["magenta", "sparkle", "Ready"], note: "All bids unlocked. Anyone can reveal the result.", action: "Reveal the result", to: page,
        stats: [["Secret bids", bids, "cyan"], ["Unlocked", unlocked, "green"], ["For sale", tokens(auction)]] };
    case "cancellable":
      return { phase, chip: ["coral", "alert", "Stuck"], note: "The keys never came. Anyone can refund everyone.", action: "Refund everyone", to: page,
        stats: [["Secret bids", bids], ["Unlocked", unlocked, "coral"], ["Money back", "Everyone", "green"]] };
    case "settled": {
      const sold = auction.supplyLots > 0n ? Number((auction.totalSold * 100n) / auction.supplyLots) : 0;
      return auction.totalSold > 0n
        ? { phase, chip: ["green", "check", "Done"], note: "Winners can collect their tokens and money.", action: "See result", to: result,
            stats: [["Final price", priceText(auction, auction.clearingPrice), "yellow"], ["Sold", `${sold}%`, "green"], ["Raised", moneyText(auction, auction.totalSold * auction.clearingPrice)]] }
        : { phase, chip: ["green", "return", "No sale"], note: "Nothing sold. All bid money comes back.", action: "See result", to: result,
            stats: [["Final price", "None"], ["Secret bids", bids], ["Money back", "Everyone", "green"]] };
    }
    case "cancelled":
      return { phase, chip: ["green", "return", "Money back"], note: "Cancelled. Everyone collects every cent back.", action: "See result", to: result,
        stats: [["Secret bids", bids], ["Sold", "Nothing"], ["Money back", "Everyone", "green"]] };
  }
}

const toneVar = (tone: Tone) => `var(--color-${tone})`;

function StatusChip({ info, className = "" }: { info: Info; className?: string }) {
  const [tone, icon, word] = info.chip;
  return (
    <span className={`hm-status ${className}`} style={{ "--c": toneVar(tone) } as CSSProperties}>
      {icon === "live" ? <span className="hm-live-dot" aria-hidden="true" /> : <Icon name={icon} size={14} />}
      {word}
    </span>
  );
}

function Stats({ info, big = false }: { info: Info; big?: boolean }) {
  return (
    <dl className={`hm-stats ${big ? "is-big" : ""}`}>
      {info.stats.map(([label, value, tone]) => (
        <div key={label}>
          <dt className="label">{label}</dt>
          <dd className={`num ${tone ? `text-${tone}` : "text-paper"}`}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The big mission card for a live launch. Only the hero's card carries the yellow button. */
function MissionCard({ auction, now, primary }: { auction: AuctionView; now: bigint; primary: boolean }) {
  const info = describe(auction, now);
  const left = Math.max(0, Number(auction.commitDeadline - now));
  const bids = Math.round(useCountUp(auction.bidCount));
  const last = left > 0 && left < 60;
  return (
    <div className={`hm-mission ${primary ? "is-primary" : ""}`}>
      <span className="hm-tab shout" aria-hidden="true"><span className="hm-live-dot" />{last ? "Last minute" : "Live now"}</span>
      <article className="panel panel-lg hm-mission-body" aria-label={`${auction.sale.name}, live`}>
        <div className="hm-mission-head">
          <div className="hm-mission-art"><TokenArt address={auction.sale.address} size={primary ? 112 : 88} /></div>
          <div className="min-w-0">
            <h3 className="hm-mission-name">
              <Link to={info.to} className="hm-plain">{auction.sale.name}</Link>
            </h3>
            <p className="m-0 mt-1 text-[17px] font-semibold text-muted">
              <span className="num text-cyan">${auction.sale.symbol}</span> · {tokens(auction)} tokens · one price for all
            </p>
          </div>
        </div>
        <div className="hm-mission-count">
          <div className={`label ${last ? "!text-coral" : ""}`}>{last ? "Last minute" : "Bidding closes in"}</div>
          <div className={`num pop-text hm-count ${last ? "text-coral" : "text-yellow"}`} role="timer" aria-label={`${timeLeft(Number(auction.commitDeadline), Number(now))} left`}>
            {timeLeft(Number(auction.commitDeadline), Number(now))}
          </div>
        </div>
        <dl className="hm-stats is-big">
          <div><dt className="label">Secret bids</dt><dd className="num text-cyan">{bids}</dd></div>
          <div><dt className="label">Starts at</dt><dd className="num text-paper">{priceText(auction, auction.minPrice)}</dd></div>
          <div><dt className="label">Bid money</dt><dd className="num text-paper">{moneyText(auction, auction.deposit)}</dd></div>
        </dl>
        {primary ? (
          <PrimaryLink to={info.to} icon="lock" className="w-full">{info.action}</PrimaryLink>
        ) : (
          <Link to={info.to} className="btn-2 w-full">{info.action}<Icon name="chevron-right" size={18} /></Link>
        )}
      </article>
    </div>
  );
}

function LaunchCard({ auction, now }: { auction: AuctionView; now: bigint }) {
  const info = describe(auction, now);
  return (
    <li className="hm-card">
      <StatusChip info={info} className="hm-card-chip" />
      <div className="panel hm-card-body">
        <div className="hm-card-head">
          <TokenArt address={auction.sale.address} size={56} className="hm-card-art" />
          <div className="min-w-0">
            <h4 className="hm-card-name">
              <Link to={info.to} className="hm-stretch">{auction.sale.name}</Link>
            </h4>
            <div className="num text-[15px] font-bold text-muted">${auction.sale.symbol} <span className="font-semibold opacity-80">#{auction.id.toString()}</span></div>
          </div>
        </div>
        <Stats info={info} />
        <p className="hm-card-note">{info.note}</p>
        <span className="btn-2 hm-card-act" aria-hidden="true">{info.action}<Icon name="chevron-right" size={18} /></span>
      </div>
    </li>
  );
}

const groupTitles: Record<Group, string> = { live: "Live now", soon: "Starting soon", waiting: "Waiting for the result", finished: "Finished" };
const order: Group[] = ["live", "soon", "waiting", "finished"];

function HeroSide({ featured, nextSoon, loading, total, now }: { featured: AuctionView | null; nextSoon: AuctionView | null; loading: boolean; total: number; now: bigint }) {
  return (
    <div className="hm-side rise d2">
      <div className="hm-hush">
        <span className="hm-halftone" aria-hidden="true" />
        <p className="bubble hm-bubble-r">{featured ? <>Bots can't snipe what they <b>can't see</b>.</> : <>Quiet right now. I'm <b>watching</b>.</>}</p>
        <Hush pose={featured ? "excited" : "waiting"} size={168} className={featured ? "hm-hop" : "bob"} />
      </div>
      {featured ? (
        <MissionCard auction={featured} now={now} primary />
      ) : loading ? (
        <div className="panel panel-lg shimmer h-[380px]" aria-label="Loading launches" />
      ) : (
        <div className="panel panel-lg hm-empty">
          <span className="label">No launch is live</span>
          <h3 className="m-0 text-[28px] font-bold leading-tight">{total === 0 ? "No launches yet." : "Nothing live right now."}</h3>
          <p className="m-0 text-muted">
            {nextSoon ? <>The next launch opens in <span className="num font-bold text-violet">{timeLeft(Number(nextSoon.commitStart), Number(now))}</span>.</> : total === 0 ? "Be the first: set a price range and a time, and bids do the rest." : "Check the finished launches below, or start your own."}
          </p>
          {nextSoon ? (
            <PrimaryButton icon="clock" onClick={() => document.getElementById("launches")?.scrollIntoView({ behavior: "smooth" })}>See what's next</PrimaryButton>
          ) : (
            <PrimaryLink to="/create" icon="plus" className="w-full">Create a launch</PrimaryLink>
          )}
        </div>
      )}
    </div>
  );
}

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
  const live = auctions.filter((auction) => phaseOf(auction, now) === "bidding").sort((a, b) => Number(a.commitDeadline - b.commitDeadline));
  const featured = live[0] ?? null;
  const nextSoon = auctions.filter((auction) => phaseOf(auction, now) === "scheduled").sort((a, b) => Number(a.commitStart - b.commitStart))[0] ?? null;
  const visible = auctions.filter((auction) => auction !== featured && (filter === "all" || (filter === "open") === isOpen(auction, now)));
  const openCount = auctions.filter((auction) => isOpen(auction, now)).length;
  const groups = order
    .map((group) => [group, visible.filter((auction) => groupOf[phaseOf(auction, now)] === group)] as const)
    .filter(([, list]) => list.length > 0);
  const tabs: [Filter, string, number][] = [["all", "All", auctions.length], ["open", "Live & soon", openCount], ["closed", "Ended", auctions.length - openCount]];

  return (
    <div className="hm-wrap">
      <section className="hm-hero" aria-labelledby="hero-title">
        <div className="hm-copy">
          <span className="hm-onmonad rise">On {network.label}</span>
          <h1 id="hero-title" className="hm-display rise d1">
            Secret bids.<br />
            <span className="hl"><span>One price.</span></span><br />
            <span className="text-yellow">No <span className="strike">bots</span>.</span>
          </h1>
          <p className="hm-lede rise d2">Bid once, in secret. When bidding ends, every winner pays the same price, and trading opens right at it.</p>
          <TrustStickers className="rise d3" />
          <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-3 rise d4">
            <SecondaryButton to="/how" icon="play">How it works</SecondaryButton>
            {live.length > 0 ? (
              <span className="flex items-center gap-2.5 text-[16px] font-semibold text-muted">
                <span className="hm-live-dot is-yellow" aria-hidden="true" />
                <span><span className="num font-bold text-yellow">{live.length}</span> launch{live.length === 1 ? "" : "es"} taking secret bids now</span>
              </span>
            ) : null}
          </div>
        </div>
        <HeroSide featured={featured} nextSoon={nextSoon} loading={Boolean(reads) && loading && !data} total={data?.total ?? 0} now={now} />
      </section>

      <section id="launches" className="hm-section scroll-mt-28" aria-labelledby="launches-title">
        <div className="hm-board-head">
          <SectionTitle id="launches-title" count={data ? auctions.length : undefined}>Launches</SectionTitle>
          <div className="hm-tabs" role="tablist" aria-label="Filter launches">
            {tabs.map(([value, label, count]) => (
              <button key={value} type="button" role="tab" aria-selected={filter === value} onClick={() => setFilter(value)}>
                {label}<span className="num">{count}</span>
              </button>
            ))}
          </div>
        </div>

        {!reads ? <p className="hm-msg">Blindlaunch isn't on {network.label} yet. Check back soon.</p> : null}
        {reads && loading && !data ? (
          <ul className="hm-cards">{[0, 1, 2].map((row) => <li key={row} className="panel shimmer h-[260px]" />)}</ul>
        ) : null}
        {error ? (
          <p className="hm-msg is-error" role="alert"><Icon name="alert" size={22} className="text-coral" />Couldn't load launches. {error}</p>
        ) : null}
        {data && groups.length === 0 ? (
          <div className="hm-msg">
            <Hush pose="waiting" size={64} />
            <span>
              {filter === "open" && featured ? <>Only <b className="text-paper">{featured.sale.name}</b> is live right now. It's at the top.</> : <>No {filter === "all" ? "" : filter === "open" ? "live or upcoming " : "ended "}launches here yet.</>}{" "}
              <Link to="/create">Create one</Link>.
            </span>
          </div>
        ) : null}

        {groups.length > 0 ? (
          <div className="hm-groups">
            {groups.map(([group, list]) => (
              <div key={group} className="hm-group" style={{ "--span": group === "live" ? 3 : Math.min(list.length, 3) } as CSSProperties}>
                <SectionTitle as="h3" count={list.length}>{groupTitles[group]}</SectionTitle>
                {group === "live" ? (
                  <div className="hm-missions">{list.map((auction) => <MissionCard key={auction.id.toString()} auction={auction} now={now} primary={false} />)}</div>
                ) : (
                  <ul className="hm-cards">{list.map((auction) => <LaunchCard key={auction.id.toString()} auction={auction} now={now} />)}</ul>
                )}
              </div>
            ))}
          </div>
        ) : null}

        {data && auctions.length < data.total ? (
          <div className="mt-8 flex justify-center">
            <SecondaryButton icon="plus" onClick={() => setPages((value) => value + 1)}>Show older launches</SecondaryButton>
          </div>
        ) : null}
      </section>

      <section className="hm-section" aria-labelledby="how-title">
        <SectionTitle id="how-title" count="4 panels · 30 seconds">How it works</SectionTitle>
        <ComicStrip />
        <div className="mt-10 flex justify-center">
          <SecondaryButton to="/how" icon="chevron-right">More on how it works</SecondaryButton>
        </div>
      </section>

      <section className="hm-section hm-bottom" aria-labelledby="faq-title">
        <div>
          <SectionTitle id="faq-title">Quick questions</SectionTitle>
          <FinePrint short />
        </div>
        <aside className="panel panel-accent hm-create">
          <Hush pose="idle" size={88} className="bob" />
          <div>
            <span className="label">Got a token?</span>
            <h3 className="m-0 mt-1 text-[26px] font-bold leading-tight">Launch it at one fair price.</h3>
            <p className="m-0 mt-2 text-muted">Pick a price range and how long bidding lasts. Bids unlock by themselves, and trading starts on Kuru at the final price.</p>
            <SecondaryButton to="/create" icon="plus" className="mt-5">Create a launch</SecondaryButton>
          </div>
        </aside>
      </section>
    </div>
  );
}
