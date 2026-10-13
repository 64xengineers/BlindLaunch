import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useSession } from "../auth/session";
import { noteKey, openNote, readNote, type BidNote } from "../bids/vault";
import { reads } from "../chain/clients";
import { explorerUrl, network } from "../chain/config";
import { formatDate, shortAddress } from "../chain/format";
import { priceAt, type AuctionView } from "../chain/model";
import { moneyText, priceText, Tip, tokensText, VerifyLinks } from "../components/auction";
import { Bubble, CopyButton, Hush, Icon, Panel, PrimaryButton, PrimaryLink, Receipt, ReceiptRow, SecondaryButton, TokenArt, Tracker, timeLeft } from "../components/ui";
import { openConnect } from "../state/connect";
import { friendlyError } from "../state/errors";
import { useNow, usePolling } from "../state/hooks";
import { calm } from "../state/motion";
import { NotFound } from "./NotFound";

export function SealedPage() {
  const { id } = useParams();
  const { state } = useLocation() as { state: { commitTx?: string } | null };
  const { signer, vaultKey } = useSession();
  const now = useNow();
  const [note, setNote] = useState<BidNote | null>(null);
  const [noteError, setNoteError] = useState("");
  const [opening, setOpening] = useState(false);
  const valid = id !== undefined && /^\d+$/.test(id) && reads !== null;
  const auctionId = valid ? BigInt(id) : 0n;
  const account = signer?.address ?? null;
  const { data } = usePolling(
    valid ? async () => {
      const auction = await reads!.auction(auctionId);
      const slot = auction && account ? await reads!.slotOf(auctionId, account) : null;
      return { auction, slot };
    } : null,
    [auctionId, account],
  );
  if (!valid) return <NotFound />;
  const auction = data?.auction ?? null;
  const commitTx = state?.commitTx ?? null;
  const tx = commitTx ? explorerUrl("tx", commitTx) : null;
  const stored = signer?.kind === "passkey" && network.deployment
    ? readNote(localStorage, noteKey(network.chain.id, network.deployment.auction, signer.address, auctionId))
    : null;

  async function showNote() {
    setOpening(true);
    try {
      const key = await vaultKey();
      const opened = key && stored ? await openNote(key, stored) : null;
      if (!opened) setNoteError("This note could not be opened with your passkey.");
      setNote(opened);
    } catch (error) {
      setNoteError(friendlyError(error));
    } finally {
      setOpening(false);
    }
  }

  const closed = auction ? now >= auction.commitDeadline : false;

  // Only say "Bid locked" to a wallet that really has a bid here.
  if (!commitTx && (account === null || data?.slot === null)) return <NoBid id={id!} signedIn={account !== null} />;
  if (!commitTx && data === undefined) return <div className="au-page"><div className="shimmer h-72" aria-label="Loading" /></div>;

  return (
    <div className="au-page au-sealed">
      <Tracker now="bid" done className="rise" />

      <div className="au-lock-hero rise d1">
        <LockedHush />
        <div className="min-w-0">
          <h1 className="au-lock-title">Bid locked.</h1>
          <p className="au-lock-sub">Nobody can see it. Not even us.</p>
          <Bubble className="au-lock-bubble">Locked tight. <b>Even I can't peek.</b></Bubble>
        </div>
      </div>

      <div className="au-lock-grid">
        <Panel className="au-lock-card rise d2">
          <h2 className="label">What happens next</h2>
          <ol className="au-next">
            <li className={closed ? "is-done" : ""}>
              <span className="n">{closed ? <Icon name="check" size={16} /> : 1}</span>
              {auction
                ? closed ? "Bidding has closed" : <span>Bidding closes in <b className="num text-yellow">{timeLeft(Number(auction.commitDeadline), Number(now))}</b></span>
                : "Bidding closes"}
            </li>
            <li><span className="n">2</span>Bids unlock by themselves</li>
            <li><span className="n">3</span>Come back to collect</li>
          </ol>
          <p className="au-ok"><Icon name="check" size={20} />You can leave. There's nothing else to do.</p>
        </Panel>

        <Panel className="au-lock-card rise d3">
          <h2 className="label">Your bid</h2>
          <dl className="au-lock-facts">
            <div>
              <dt>Launch</dt>
              <dd>
                {auction ? (
                  <Link className="inline-flex items-center gap-2 no-underline hover:text-yellow" to={`/auction/${id}`}>
                    <TokenArt address={auction.sale.address} size={28} />
                    <span className="text-paper">{auction.sale.name}</span>
                    <span className="num text-cyan">${auction.sale.symbol}</span>
                  </Link>
                ) : `#${id}`}
              </dd>
            </div>
            {data?.slot !== null && data?.slot !== undefined ? (
              <div><dt>Bid number</dt><dd className="num">#{data.slot + 1}</dd></div>
            ) : null}
            {auction ? <div><dt>Bidding closes</dt><dd>{formatDate(auction.commitDeadline)}</dd></div> : null}
            {commitTx ? (
              <div>
                <dt>Transaction</dt>
                <dd className="flex items-center justify-end gap-1">
                  {tx ? (
                    <a className="inline-flex items-center gap-1.5 no-underline" href={tx} target="_blank" rel="noreferrer">View <Icon name="external" size={14} /></a>
                  ) : (
                    <>
                      <span className="font-mono text-[14px] text-muted">{shortAddress(commitTx)}</span>
                      <CopyButton value={commitTx} />
                    </>
                  )}
                </dd>
              </div>
            ) : null}
          </dl>

          {stored ? (
            <div className="mt-4">
              {note && auction ? <NoteReceipt auction={auction} note={note} /> : (
                <SecondaryButton icon="fingerprint" disabled={opening} onClick={() => void showNote()}>
                  {opening ? "Opening…" : "See what I bid"}
                </SecondaryButton>
              )}
              {noteError ? <p className="au-help is-bad" role="alert">{noteError}</p> : null}
            </div>
          ) : (
            <p className="au-help mt-4">Your price and amount are locked. Not even this page can read them.</p>
          )}
        </Panel>
      </div>

      <div className="au-lock-actions rise d3">
        <SecondaryButton to={`/auction/${id}`} icon="chevron-left">Back to the launch</SecondaryButton>
        <SecondaryButton to="/bids" icon="grid">My bids</SecondaryButton>
      </div>

      <Tip className="rise d4" />

      {auction ? (
        <div className="mt-8">
          <VerifyLinks auction={auction} extra={commitTx ? [["Your bid transaction", tx]] : []} />
        </div>
      ) : null}
    </div>
  );
}

/** Hush, shackle up for a beat, then slammed shut with the LOCKED stamp. */
function LockedHush() {
  const ref = useRef<HTMLSpanElement>(null);
  const still = calm();
  useEffect(() => {
    if (still) return;
    const timer = window.setTimeout(() => ref.current?.querySelector("svg.hush")?.classList.remove("is-open"), 380);
    return () => window.clearTimeout(timer);
  }, [still]);
  return (
    <div className="au-lock-art">
      <span className="au-speed" aria-hidden="true" />
      <span ref={ref} className="relative inline-block leading-none">
        <Hush pose="idle" open={!still} size={200} className="bob" />
      </span>
      <span className="au-stamp-sm" aria-hidden="true">Locked</span>
    </div>
  );
}

function NoteReceipt({ auction, note }: { auction: AuctionView; note: BidNote }) {
  const lots = BigInt(note.lots);
  const pay = priceAt(auction, note.step) * lots;
  return (
    <>
      <Receipt title="What you bid" aside="only you can see this" className="au-note-receipt">
        <ReceiptRow icon="coin" tone="cyan" label="You get up to" value={tokensText(auction, lots)} />
        <ReceiptRow icon="dollar" tone="yellow" label="You pay at most" value={moneyText(pay, auction.quote)} />
        <ReceiptRow icon="return" tone="green" label="Comes back for sure" value={moneyText(auction.deposit - pay, auction.quote)} />
      </Receipt>
      <p className="au-help mt-4">
        You asked for {tokensText(auction, lots)} at up to {priceText(auction, priceAt(auction, note.step))}. Only your passkey can open this note.
      </p>
    </>
  );
}

function NoBid({ id, signedIn }: { id: string; signedIn: boolean }) {
  return (
    <div className="au-page">
      <Panel large accent className="mx-auto mt-6 grid max-w-[46rem] grid-cols-[auto_1fr] items-center gap-6 p-8">
        <Hush pose="waiting" size={130} className="bob" />
        <div className="min-w-0">
          <h1 className="m-0 text-[40px] font-bold leading-none">No secret bid {signedIn ? "from this wallet" : "yet"}</h1>
          <p className="mt-3 mb-0 text-[18px] text-muted">
            {signedIn ? "This wallet has not locked a bid in this launch." : "Sign in to see the bid you locked in this launch."}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {signedIn
              ? <PrimaryLink to={`/auction/${id}`} icon="chevron-left">Back to the launch</PrimaryLink>
              : <PrimaryButton className="w-auto" icon="fingerprint" onClick={openConnect}>Sign in</PrimaryButton>}
            {signedIn ? null : <SecondaryButton to={`/auction/${id}`} icon="chevron-left">Back to the launch</SecondaryButton>}
          </div>
        </div>
      </Panel>
    </div>
  );
}
