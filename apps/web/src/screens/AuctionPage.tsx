import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Address } from "viem";
import { useSession } from "../auth/session";
import { noteKey, sealNote, writeNote } from "../bids/vault";
import { reads } from "../chain/clients";
import { network } from "../chain/config";
import { formatAmount } from "../chain/format";
import { bidProblem, formatPrice, lotLabel, phaseOf, priceAt, publicActions, type AuctionView, type Phase } from "../chain/model";
import { AuctionRules, BidList, DemandChart, PhaseBar, VerifyLinks } from "../components/auction";
import { Badge, Countdown, GlassCard, PrimaryButton } from "../components/ui";
import { callAuction, mintTestQuote, openRemaining, placeBid } from "../state/actions";
import { useNow, usePolling, useRunner } from "../state/hooks";
import { NotFound } from "./NotFound";

export function AuctionPage() {
  const { id } = useParams();
  if (!id || !/^\d+$/.test(id)) return <NotFound />;
  if (!reads) return <NotFound message={`Blindlaunch is not deployed on ${network.label} yet.`} />;
  return <AuctionScreen id={BigInt(id)} />;
}

function AuctionScreen({ id }: { id: bigint }) {
  const { signer } = useSession();
  const account = signer?.address ?? null;
  const now = useNow();
  const { data, loading, reload } = usePolling(async () => {
    const auction = await reads!.auction(id);
    if (!auction) return null;
    const [bids, demand, mySlot] = await Promise.all([
      reads!.bids(id, auction.bidCount),
      reads!.demand(id),
      account ? reads!.slotOf(id, account) : Promise.resolve(null),
    ]);
    return { auction, bids, demand, mySlot };
  }, [id, account]);

  if (loading && !data) {
    return (
      <div className="mx-auto grid max-w-6xl gap-6 px-4 pb-16 lg:grid-cols-2" aria-label="Loading auction">
        <div className="shimmer h-72 rounded-[20px] bg-white/5" />
        <div className="shimmer h-72 rounded-[20px] bg-white/5" />
      </div>
    );
  }
  if (!data) return <NotFound message={`Auction ${id} does not exist.`} />;

  const { auction, bids, demand, mySlot } = data;
  const phase = phaseOf(auction, now);
  const target = phase === "scheduled" ? auction.commitStart : phase === "bidding" ? auction.commitDeadline : phase === "awaitingKeys" ? auction.cancelAfter : null;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-20">
      <PhaseBar auction={auction} phase={phase} now={now} />
      <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
        <div className="rise min-w-0">
          <Badge dot={phase === "bidding" ? "amber" : undefined} tone={phase === "bidding" ? "paper" : "teal"}>
            Auction {auction.id.toString()} · {auction.sale.symbol} for {auction.quote.symbol}
          </Badge>
          <h1 className="mt-5 text-5xl font-bold leading-[0.95] tracking-[-0.04em] sm:text-6xl">{auction.sale.name}</h1>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-mist">
            Bid once. Your bid is encrypted on your device and opens itself on chain after the deadline. Everyone who wins pays one price.
          </p>
          {target !== null ? (
            <div className="mt-7">
              <p className="mb-2 text-sm text-lilac">
                {phase === "scheduled" ? "Bidding opens in" : phase === "bidding" ? "Bidding closes in" : "Refund deadline if keepers never publish"}
              </p>
              <Countdown target={Number(target)} now={Number(now)} />
            </div>
          ) : null}
          {phase === "settled" || phase === "cancelled" ? (
            <Link className="btn-primary mt-7 inline-flex items-center no-underline" to={`/auction/${auction.id}/result`}>
              <span className="relative z-10">{phase === "settled" ? "See the result and claim" : "Claim your refund"}</span>
            </Link>
          ) : null}
        </div>

        <GlassCard className="rise d1">
          {phase === "bidding" ? (
            <BidCard auction={auction} account={account} alreadyBid={mySlot !== null} now={now} onDone={reload} />
          ) : (
            <PhasePanel auction={auction} phase={phase} mine={mySlot !== null} onDone={reload} />
          )}
        </GlassCard>
      </div>

      <section className="glass mt-10 grid gap-8 p-5 sm:p-6 lg:grid-cols-2">
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm text-mist">What the chain shows</h2>
            <span className="font-mono text-xs text-lilac">{auction.openedCount} of {auction.bidCount} opened</span>
          </div>
          <BidList auction={auction} bids={bids} account={account} />
          <p className="mt-4 text-sm text-teal">Before the keys are published, only encrypted data is on chain.</p>
        </div>
        <div className="min-w-0">
          <DemandChart auction={auction} demand={demand} />
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <GlassCard>
          <h2 className="mb-4 text-lg font-bold">Rules</h2>
          <AuctionRules auction={auction} />
        </GlassCard>
        <VerifyLinks auction={auction} />
      </section>
    </div>
  );
}

function BidCard({ auction, account, alreadyBid, now, onDone }: { auction: AuctionView; account: Address | null; alreadyBid: boolean; now: bigint; onDone: () => void }) {
  const navigate = useNavigate();
  const { signer, vaultKey } = useSession();
  const { run, busy } = useRunner();
  const [step, setStep] = useState(Math.floor((auction.stepCount - 1) / 2));
  const [lotsText, setLotsText] = useState("10");
  const { data: balance, reload: reloadBalance } = usePolling(
    account ? () => reads!.balanceOf(auction.quote.address, account) : null,
    [account, auction.quote.address],
    15_000,
  );

  const lots = /^\d+$/.test(lotsText) ? BigInt(lotsText) : 0n;
  const maxPay = priceAt(auction, step) * lots;
  const problem = bidProblem(auction, { account, alreadyBid, now, step, lots });
  const short = balance !== undefined && balance < auction.deposit;
  const testQuote = network.name !== "mainnet" && network.deployment?.quote.toLowerCase() === auction.quote.address.toLowerCase();
  const unit = lotLabel(auction, auction.sale);

  async function seal() {
    const record = await run("Seal bid", (w) => placeBid(w, auction.id, step, lots), "Bid sealed. It opens itself after the deadline.");
    if (!record) return;
    if (signer?.kind === "passkey") {
      try {
        const key = await vaultKey();
        if (key) {
          const sealed = await sealNote(key, { auctionId: auction.id.toString(), step, lots: lots.toString(), commitTx: record.commitTx, savedAt: Date.now() });
          writeNote(localStorage, noteKey(network.chain.id, network.deployment!.auction, signer.address, auction.id), sealed);
        }
      } catch {
        // The bid is on chain; the private note is only a convenience.
      }
    }
    onDone();
    navigate(`/auction/${auction.id}/sealed`, { state: { commitTx: record.commitTx } });
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold">Place a sealed bid</h2>
        <span className="text-xs text-teal">Encrypted on your device</span>
      </div>
      {alreadyBid ? <p className="mt-4 rounded-xl border border-teal/40 bg-teal/10 p-3 text-sm text-paper">You already bid in this auction. It will open itself after the deadline.</p> : null}
      <label className="mt-5 grid gap-2 text-sm text-mist">
        Most you will pay
        <select className="field" value={step} onChange={(event) => setStep(Number(event.target.value))}>
          {Array.from({ length: auction.stepCount }, (_, index) => (
            <option key={index} value={index}>{formatPrice(priceAt(auction, index), auction, auction.sale, auction.quote)}</option>
          ))}
        </select>
      </label>
      <label className="mt-5 grid gap-2 text-sm text-mist">
        How many ({unit})
        <input className="field" inputMode="numeric" value={lotsText} onChange={(event) => setLotsText(event.target.value.replace(/[^\d]/g, ""))} />
      </label>
      <dl className="mt-5 grid gap-2 border-t border-white/10 pt-4 text-sm">
        <div className="flex justify-between"><dt className="text-lilac">Most you could pay</dt><dd className="font-mono font-bold text-paper">{formatAmount(maxPay, auction.quote.decimals)} {auction.quote.symbol}</dd></div>
        <div className="flex justify-between"><dt className="text-lilac">Deposit locked</dt><dd className="font-mono font-bold text-paper">{formatAmount(auction.deposit, auction.quote.decimals)} {auction.quote.symbol}</dd></div>
        {balance !== undefined ? <div className="flex justify-between"><dt className="text-lilac">Your {auction.quote.symbol}</dt><dd className="font-mono text-paper">{formatAmount(balance, auction.quote.decimals)}</dd></div> : null}
      </dl>
      <p className="mt-2 text-xs text-lilac">Every bidder locks the same deposit, so it reveals nothing. What you do not spend comes back after settlement.</p>
      {problem && !alreadyBid && account ? <p className="mt-2 text-sm text-amber" role="alert">{problem}</p> : null}
      {short && testQuote ? (
        <div className="mt-4">
          <button type="button" className="btn-secondary min-h-11 w-full" disabled={busy !== null} onClick={() => void run("Get test tokens", (w) => mintTestQuote(w, auction.deposit)).then(reloadBalance)}>
            Get {formatAmount(auction.deposit, auction.quote.decimals)} test {auction.quote.symbol}
          </button>
        </div>
      ) : null}
      <div className="mt-5">
        <PrimaryButton disabled={busy !== null || problem !== null || short} onClick={() => void seal()}>
          {busy === "Seal bid" ? "Sealing…" : account ? "Seal my bid" : "Connect to bid"}
        </PrimaryButton>
      </div>
    </>
  );
}

function PhasePanel({ auction, phase, mine, onDone }: { auction: AuctionView; phase: Phase; mine: boolean; onDone: () => void }) {
  const { run, busy } = useRunner();
  const actions = publicActions(phase);
  const copy: Record<Phase, [string, string]> = {
    scheduled: ["Bidding has not opened", "Come back when the countdown ends."],
    bidding: ["", ""],
    awaitingKeys: ["Bidding closed", mine ? "Your bid is sealed. The keepers publish their keys and it opens itself. You have nothing to do." : "The keepers are publishing their keys."],
    cancellable: ["Keys never came", "Two keepers did not publish in time. Cancel the auction and every deposit is refunded in full."],
    opening: ["Opening bids", "The keys are published. Open the remaining bids, or wait for a keeper to do it."],
    ready: ["Ready to settle", "Every bid is open. Settling computes the one price."],
    settled: ["Settled", auction.totalSold > 0n ? `One price: ${formatPrice(auction.clearingPrice, auction, auction.sale, auction.quote)}.` : "Nothing was sold."],
    cancelled: ["Cancelled", "Every deposit can be claimed back on the result page."],
  };
  const [title, body] = copy[phase];
  return (
    <>
      <h2 className="text-xl font-bold">{title}</h2>
      <p className="mt-2 text-mist">{body}</p>
      <div className="mt-5 grid gap-3">
        {actions.includes("openRemaining") ? (
          <PrimaryButton disabled={busy !== null} onClick={() => void run("Open bids", (w) => openRemaining(w, auction.id)).then(onDone)}>
            {busy ? "Opening…" : `Open the remaining ${auction.bidCount - auction.openedCount} bids`}
          </PrimaryButton>
        ) : null}
        {actions.includes("settle") ? (
          <PrimaryButton disabled={busy !== null} onClick={() => void run("Settle", (w) => callAuction(w, "settle", auction.id)).then(onDone)}>
            {busy ? "Settling…" : "Settle the auction"}
          </PrimaryButton>
        ) : null}
        {actions.includes("cancel") ? (
          <PrimaryButton disabled={busy !== null} onClick={() => void run("Cancel", (w) => callAuction(w, "cancel", auction.id)).then(onDone)}>
            {busy ? "Cancelling…" : "Cancel and refund everyone"}
          </PrimaryButton>
        ) : null}
      </div>
    </>
  );
}
