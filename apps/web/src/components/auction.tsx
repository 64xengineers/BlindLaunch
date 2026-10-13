import type { Outcome } from "@blindlaunch/sealed-bid";
import { useEffect, useState } from "react";
import { formatUnits, type Address } from "viem";
import { explorerUrl, network } from "../chain/config";
import { formatAmount, formatDate, formatLeft, shortAddress } from "../chain/format";
import { priceAt, type AuctionView, type BidView, type Phase, type RawAuction, type TokenMeta } from "../chain/model";
import { calm } from "../state/motion";
import { CopyButton, Fold, Icon, Panel, Sticker, type StickerTone, type TrackerStage } from "./ui";

/** The contract's outcome fields as the TypeScript allocation mirror expects them. */
export function outcomeOf(a: RawAuction): Outcome {
  return {
    clearingStep: a.clearingStep,
    clearingPrice: a.clearingPrice,
    aboveTotal: a.aboveTotal,
    remaining: a.remaining,
    atDemand: a.atDemand,
    proRata: a.atDemand > a.remaining,
    totalSold: a.totalSold,
  };
}

/** One plain sentence for where a launch is. */
export function phaseMessage(phase: Phase, a: AuctionView, now: bigint): string {
  const left = (target: bigint) => formatLeft(Number(target - now));
  switch (phase) {
    case "scheduled":
      return `Bidding opens in ${left(a.commitStart)}.`;
    case "bidding":
      return `Bids stay secret until the end. Bidding closes in ${left(a.commitDeadline)}.`;
    case "awaitingKeys":
      return "Bidding is closed. Every bid unlocks by itself. Bidders have nothing to do.";
    case "cancellable":
      return "The bids could not unlock in time. Anyone can refund everyone, in full.";
    case "opening":
      return "Bids are unlocking. Anyone can press the button to speed it up.";
    case "ready":
      return "Every bid is unlocked. Anyone can reveal the result now.";
    case "settled":
      return a.totalSold > 0n
        ? `Final price ${priceText(a, a.clearingPrice)} for everyone. Winners can collect.`
        : "Nothing was sold. Everyone can collect their money back.";
    case "cancelled":
      return "Called off. Everyone can collect their money back.";
  }
}

/* ---------- plain number formats ---------- */

const usd = (quote: TokenMeta) => /usd/i.test(quote.symbol);
const group = (whole: string) => whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** `value` with exactly `places` decimals, rounded down, with thousands separators. */
function fixed(value: bigint, decimals: number, places: number): string {
  const [whole = "0", fraction = ""] = formatUnits(value, decimals).split(".");
  return places > 0 ? `${group(whole)}.${fraction.padEnd(places, "0").slice(0, places)}` : group(whole);
}

/** Decimals needed to write `value` exactly. */
function places(value: bigint, decimals: number): number {
  const fraction = formatUnits(value, decimals).split(".")[1] ?? "";
  return fraction.replace(/0+$/, "").length;
}

/** Money in the quote token: `$500.00` for dollar tokens, `500 WMON` otherwise. `cents: false` gives `$1,000`. */
export function moneyText(value: bigint, quote: TokenMeta, cents = true): string {
  if (usd(quote)) return `$${fixed(value, quote.decimals, cents ? 2 : 0)}`;
  return `${formatAmount(value, quote.decimals, cents ? 4 : 0)} ${quote.symbol}`;
}

/** A price option, with as many decimals as the options need: `$0.012`, `$2.60`. */
export function priceText(a: Pick<RawAuction, "minPrice" | "stepSize"> & { quote: TokenMeta }, value: bigint): string {
  const q = a.quote;
  const need = Math.min(6, Math.max(places(a.minPrice, q.decimals), places(a.stepSize, q.decimals)));
  if (usd(q)) return `$${fixed(value, q.decimals, Math.max(2, need))}`;
  return `${fixed(value, q.decimals, need)} ${q.symbol}`;
}

/** True when one lot is exactly one whole token. */
export function wholeLots(a: Pick<RawAuction, "lotSize">, sale: TokenMeta): boolean {
  return a.lotSize === 10n ** BigInt(sale.decimals);
}

/** Tokens for a number of lots: `25,000 NCAT`. */
export function tokensText(a: AuctionView, lots: bigint): string {
  return `${formatAmount(lots * a.lotSize, a.sale.decimals)} ${a.sale.symbol}`;
}

/* ---------- phase look ---------- */

const phaseLook: Record<Phase, { tone: StickerTone; word: string; stage: TrackerStage; bad?: boolean; done?: boolean }> = {
  scheduled: { tone: "violet", word: "Starts soon", stage: "bid" },
  bidding: { tone: "yellow", word: "Live now", stage: "bid" },
  awaitingKeys: { tone: "cyan", word: "Unlocking", stage: "unlock" },
  opening: { tone: "cyan", word: "Unlocking", stage: "unlock" },
  ready: { tone: "magenta", word: "Ready", stage: "result" },
  cancellable: { tone: "coral", word: "Stuck", stage: "unlock", bad: true },
  settled: { tone: "green", word: "Done", stage: "result", done: true },
  cancelled: { tone: "green", word: "Money back", stage: "unlock", bad: true },
};

export function trackerOf(phase: Phase): { now: TrackerStage; bad: boolean; done: boolean } {
  const look = phaseLook[phase];
  return { now: look.stage, bad: look.bad ?? false, done: look.done ?? false };
}

/** The status sticker: LIVE NOW, UNLOCKING, STUCK… always word and colour. */
export function PhaseSticker({ phase, className = "" }: { phase: Phase; className?: string }) {
  const look = phaseLook[phase];
  return <Sticker tone={look.tone} live={phase === "bidding"} className={className}>{look.word}</Sticker>;
}

const tips = [
  "You never pay more than your max price.",
  "Everyone locks the same bid money, so nobody can guess your size.",
  "Bid high or bid right at the line: every winner pays the same final price.",
  "If the bids can't unlock, everyone gets every cent back.",
  "Trading on Kuru opens at the final price. No dump at listing.",
  "Bots can't snipe what they can't see.",
];

/** One short tip at a time, changing every 6 seconds (still in calm mode). */
export function Tip({ className = "" }: { className?: string }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (calm()) return;
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % tips.length), 6000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <p className={`au-tip ${className}`}>
      <span className="label !text-yellow">Tip</span>
      <span key={index} className="au-tip-text">{tips[index]}</span>
    </p>
  );
}

/* ---------- the quiet section ---------- */

export function AuctionRules({ auction }: { auction: AuctionView }) {
  const { sale, quote } = auction;
  const top = priceAt(auction, auction.stepCount - 1);
  const seeded = auction.seedSaleLots > 0n || auction.seedQuoteBps > 0;
  const rules: [string, string][] = [
    ["Tokens for sale", `${formatAmount(auction.supply, sale.decimals)} ${sale.symbol}`],
    ...(wholeLots(auction, sale) ? [] : [["Sold in packs of", `${formatAmount(auction.lotSize, sale.decimals)} ${sale.symbol}`] as [string, string]]),
    ["Price options", `${priceText(auction, auction.minPrice)} to ${priceText(auction, top)} (${auction.stepCount} options)`],
    ["Bid money per bidder", `${moneyText(auction.deposit, quote, false)}, unused part comes back`],
    ...(auction.maxNotional < auction.deposit ? [["Most one bid can spend", moneyText(auction.maxNotional, quote)] as [string, string]] : []),
    ["Secret bids", `${auction.bidCount.toLocaleString()} of ${auction.maxBids.toLocaleString()} places taken`],
    ["Bidding opens", formatDate(auction.commitStart)],
    ["Bidding closes", formatDate(auction.commitDeadline)],
    ["Full refund if bids don't unlock by", formatDate(auction.cancelAfter)],
    [
      "Trading on Kuru",
      seeded
        ? `Opens at the final price with ${formatAmount(auction.seedSaleLots * auction.lotSize, sale.decimals)} ${sale.symbol} and ${auction.seedQuoteBps / 100}% of the money raised, locked until ${formatDate(auction.seedLockUntil)}`
        : "Not set up for this launch",
    ],
  ];
  return (
    <dl className="au-rules m-0">
      {rules.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const PAGE = 10;

/** Every bid in this launch. Locked bids show nothing but their place in line. */
export function BidList({ auction, bids, account }: { auction: AuctionView; bids: readonly BidView[]; account: Address | null }) {
  const [shown, setShown] = useState(PAGE);
  if (bids.length === 0) return <p className="m-0 text-muted">No bids yet. The first one is still up for grabs.</p>;
  return (
    <>
      <ul className="au-bids m-0 list-none p-0">
        {bids.slice(0, shown).map((bid) => {
          const mine = account !== null && bid.bidder.toLowerCase() === account.toLowerCase();
          const link = explorerUrl("address", bid.bidder);
          const [icon, tone, text] = !bid.opened
            ? ["lock", "text-cyan", "Locked. Nobody can see it."] as const
            : bid.forfeited
              ? ["alert", "text-coral", "Cheating bid: its money is burned"] as const
              : bid.counted
                ? ["unlock", "text-green", `Asked ${tokensText(auction, bid.quantity)} at up to ${priceText(auction, priceAt(auction, bid.step))}`] as const
                : ["return", "text-muted", "Didn't count: full refund"] as const;
          return (
            <li key={bid.slot} className={mine ? "is-mine" : ""}>
              <Icon name={icon} size={18} className={tone} />
              <span className="num text-muted">#{bid.slot + 1}</span>
              <span className="min-w-0 truncate">{text}</span>
              <span className="who">
                {mine ? <b className="text-cyan">you</b> : link ? <a href={link} target="_blank" rel="noreferrer">{shortAddress(bid.bidder)}</a> : shortAddress(bid.bidder)}
              </span>
            </li>
          );
        })}
      </ul>
      {bids.length > shown ? (
        <button type="button" className="btn-2 mt-3" onClick={() => setShown((value) => value + PAGE * 2)}>
          Show more ({bids.length - shown} left)
        </button>
      ) : null}
    </>
  );
}

/** "Proof on chain": quiet links anyone can use to check this page against the contract. */
export function VerifyLinks({ auction, extra = [] }: { auction: AuctionView; extra?: [string, string | null][] }) {
  const deployment = network.deployment;
  const rows: { label: string; address?: string; href: string | null }[] = [
    ...(deployment ? [{ label: "Launch contract", address: deployment.auction, href: explorerUrl("address", deployment.auction) }] : []),
    { label: `Token for sale (${auction.sale.symbol})`, address: auction.sale.address, href: explorerUrl("address", auction.sale.address) },
    { label: `Money token (${auction.quote.symbol})`, address: auction.quote.address, href: explorerUrl("address", auction.quote.address) },
    { label: "Creator", address: auction.authority, href: explorerUrl("address", auction.authority) },
    ...extra.map(([label, href]) => ({ label, href })),
  ];
  return (
    <Panel className="au-fold">
      <Fold title={<span className="inline-flex items-center gap-3"><Icon name="shield" size={20} className="text-cyan" />Proof on chain</span>}>
        <p className="m-0 max-w-[40em] text-[15px] text-muted">
          Everything on this page is read from the launch contract. Check it yourself: <span className="font-mono text-paper">getAuction({auction.id.toString()})</span>.
        </p>
        <ul className="au-proof m-0 mt-3 list-none p-0">
          {rows.map((row) => (
            <li key={row.label}>
              <span>{row.label}</span>
              {row.address ? <span className="font-mono text-[14px] text-muted">{shortAddress(row.address)}</span> : <span />}
              <span className="flex items-center justify-end gap-1">
                {row.href ? (
                  <a className="label inline-flex min-h-10 items-center gap-1.5 px-2 !text-cyan no-underline hover:!text-yellow" href={row.href} target="_blank" rel="noreferrer">
                    Open <Icon name="external" size={14} />
                  </a>
                ) : null}
                {row.address ? <CopyButton value={row.address} /> : null}
              </span>
            </li>
          ))}
        </ul>
      </Fold>
    </Panel>
  );
}
