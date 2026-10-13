import type { Outcome } from "@blindlaunch/sealed-bid";
import type { Address } from "viem";
import { explorerUrl, network } from "../chain/config";
import { formatAmount, formatDate, formatLeft, shortAddress } from "../chain/format";
import { formatPrice, lotLabel, priceAt, type AuctionView, type BidView, type Phase, type RawAuction } from "../chain/model";
import { CopyButton, GlassCard, LockIcon, StepChart } from "./ui";

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

export function phaseMessage(phase: Phase, a: AuctionView, now: bigint): string {
  const left = (target: bigint) => formatLeft(Number(target - now));
  switch (phase) {
    case "scheduled":
      return `Bidding opens in ${left(a.commitStart)}.`;
    case "bidding":
      return `Bids are encrypted to three keepers. Bidding closes in ${left(a.commitDeadline)}.`;
    case "awaitingKeys":
      return "Bidding closed. Keepers are publishing their keys, and every bid then opens on chain. Bidders have nothing to do.";
    case "cancellable":
      return "The keepers did not publish in time. Anyone can cancel, and every deposit is refunded.";
    case "opening":
      return "Keys are out. Bids are being opened on chain; anyone can help.";
    case "ready":
      return "Every bid is open. Anyone can settle now.";
    case "settled":
      return a.totalSold > 0n
        ? `Cleared at ${formatPrice(a.clearingPrice, a, a.sale, a.quote)}. Winners claim tokens and refunds.`
        : "No sale. Every deposit can be claimed back.";
    case "cancelled":
      return "Cancelled. Every deposit can be claimed back.";
  }
}

const stages = ["Bidding", "Keys", "Opening", "Settled"] as const;
const stageOf: Record<Phase, number> = { scheduled: 0, bidding: 0, awaitingKeys: 1, cancellable: 1, opening: 2, ready: 2, settled: 3, cancelled: -1 };

export function PhaseBar({ auction, phase, now }: { auction: AuctionView; phase: Phase; now: bigint }) {
  const current = stageOf[phase];
  return (
    <div className="glass sticky top-[4.5rem] z-30 mb-6 px-4 py-3 sm:top-[5.5rem]" role="status" aria-live="polite">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <ol className="flex flex-wrap items-center gap-1.5" aria-label="Auction status">
          {current < 0 ? (
            <li className="rounded-full bg-amber/15 px-3 py-1 text-xs font-semibold text-amber">Cancelled · refunds open</li>
          ) : stages.map((stage, index) => (
            <li
              key={stage}
              className={`rounded-full px-3 py-1 text-xs ${index === current ? "bg-amber font-semibold text-ink" : index < current ? "bg-teal/15 text-teal" : "bg-white/5 text-lilac"}`}
              aria-current={index === current ? "step" : undefined}
            >
              {index < current ? "✓ " : ""}{stage}
            </li>
          ))}
        </ol>
        <p className={`min-w-0 flex-1 text-sm ${phase === "cancellable" ? "text-amber" : "text-mist"}`}>{phaseMessage(phase, auction, now)}</p>
      </div>
    </div>
  );
}

export function AuctionRules({ auction }: { auction: AuctionView }) {
  const { sale, quote } = auction;
  const top = priceAt(auction, auction.stepCount - 1);
  const rules: [string, string][] = [
    ["For sale", `${formatAmount(auction.supply, sale.decimals)} ${sale.symbol}`],
    ["Sold in lots of", lotLabel(auction, sale)],
    ["Price levels", `${formatAmount(auction.minPrice, quote.decimals, 6)} to ${formatAmount(top, quote.decimals, 6)} ${quote.symbol}`],
    ["Levels", `${auction.stepCount}, steps of ${formatAmount(auction.stepSize, quote.decimals, 6)}`],
    ["Deposit per bidder", `${formatAmount(auction.deposit, quote.decimals)} ${quote.symbol}`],
    ["Bids", `${auction.bidCount} of ${auction.maxBids.toLocaleString()}`],
    ["Bidding opens", formatDate(auction.commitStart)],
    ["Bidding closes", formatDate(auction.commitDeadline)],
    ["Refund deadline if keys never come", formatDate(auction.cancelAfter)],
    [
      "Market at the price",
      auction.seedSaleLots > 0n || auction.seedQuoteBps > 0
        ? `Kuru, ${auction.seedSaleLots} lots and ${auction.seedQuoteBps / 100}% of proceeds, locked until ${formatDate(auction.seedLockUntil)}`
        : "No market seeding",
    ],
  ];
  return (
    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      {rules.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-3 border-b border-white/5 pb-2">
          <dt className="text-lilac">{label}</dt>
          <dd className="text-right font-mono text-paper">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DemandChart({ auction, demand }: { auction: AuctionView; demand: readonly bigint[] | undefined }) {
  const prices = Array.from({ length: auction.stepCount }, (_, step) => formatAmount(priceAt(auction, step), auction.quote.decimals, 4));
  const cumulative = prices.map((_, step) => (demand ?? []).slice(step, auction.stepCount).reduce((sum, lots) => sum + lots, 0n));
  const settled = auction.status === 2;
  return (
    <StepChart
      prices={prices}
      demand={cumulative.map(Number)}
      supply={Number(auction.supplyLots)}
      clearingIndex={settled && auction.totalSold > 0n ? auction.clearingStep : null}
      priceLabel="One price"
      empty="Demand appears once bids are opened."
    />
  );
}

export function BidList({ auction, bids, account }: { auction: AuctionView; bids: readonly BidView[]; account: Address | null }) {
  return (
    <ul className="mt-4 grid gap-2">
      {bids.length === 0 ? <li className="rounded-xl bg-white/[0.04] p-4 text-sm text-lilac">No bids yet.</li> : null}
      {bids.map((bid) => {
        const mine = account !== null && bid.bidder.toLowerCase() === account.toLowerCase();
        const link = explorerUrl("address", bid.bidder);
        const state = !bid.opened
          ? <span className="text-xs text-lilac">sealed</span>
          : bid.forfeited
            ? <span className="text-xs text-amber">did not match its commitment · deposit forfeited</span>
            : bid.counted
              ? <span className="text-xs text-teal">{formatAmount(priceAt(auction, bid.step), auction.quote.decimals, 4)} {auction.quote.symbol} × {bid.quantity.toString()}</span>
              : <span className="text-xs text-mist">opened, not counted · refunded</span>;
        return (
          <li key={bid.slot} className={`flex min-w-0 items-center gap-3 rounded-xl px-3 py-2 ${mine ? "bg-amber/10" : "bg-white/[0.04]"}`}>
            <LockIcon className={`h-4 w-4 shrink-0 ${bid.opened ? "text-teal" : "text-amber"}`} open={bid.opened} />
            <span className="w-8 shrink-0 font-mono text-xs text-lilac">#{bid.slot}</span>
            <span className="min-w-0 flex-1 truncate">{state}</span>
            <span className="hidden font-mono text-xs text-lavender sm:inline">{mine ? "you" : shortAddress(bid.bidder)}</span>
            {link ? <a className="inline-flex min-h-9 items-center px-1 text-xs text-lilac no-underline hover:text-amber" href={link} target="_blank" rel="noreferrer" aria-label="Bidder on the explorer">↗</a> : null}
          </li>
        );
      })}
    </ul>
  );
}

export function VerifyLinks({ auction, extra = [] }: { auction: AuctionView; extra?: [string, string | null][] }) {
  const deployment = network.deployment;
  const links: [string, string | null][] = [
    ["Auction contract", deployment ? explorerUrl("address", deployment.auction) : null],
    [`Token for sale, ${auction.sale.symbol}`, explorerUrl("address", auction.sale.address)],
    [`Payment token, ${auction.quote.symbol}`, explorerUrl("address", auction.quote.address)],
    [`Creator ${shortAddress(auction.authority)}`, explorerUrl("address", auction.authority)],
    ...extra,
  ];
  return (
    <GlassCard>
      <h2 className="text-lg font-bold">Verify on chain</h2>
      <p className="mt-2 text-sm text-mist">
        Everything on this page is read from the contract. Call <span className="font-mono text-paper">getAuction({auction.id.toString()})</span> and{" "}
        <span className="font-mono text-paper">getBid({auction.id.toString()}, slot)</span> on the explorer to check it.
      </p>
      <ul className="mt-4 grid gap-2">
        {links.map(([label, href]) => (
          <li key={label} className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-white/[0.04] px-3 text-sm text-paper">
            {href ? <a className="no-underline hover:text-amber" href={href} target="_blank" rel="noreferrer">{label} ↗</a> : <span>{label}</span>}
            {deployment && label === "Auction contract" ? <CopyButton value={deployment.auction} /> : null}
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}
