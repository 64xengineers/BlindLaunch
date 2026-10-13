import { useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useSession } from "../auth/session";
import { noteKey, openNote, readNote, type BidNote } from "../bids/vault";
import { reads } from "../chain/clients";
import { explorerUrl, network } from "../chain/config";
import { formatDate } from "../chain/format";
import { formatPrice, priceAt } from "../chain/model";
import { Badge, GlassCard } from "../components/ui";
import { friendlyError } from "../state/errors";
import { usePolling } from "../state/hooks";
import { NotFound } from "./NotFound";

export function SealedPage() {
  const { id } = useParams();
  const { state } = useLocation() as { state: { commitTx?: string } | null };
  const { signer, vaultKey } = useSession();
  const [note, setNote] = useState<BidNote | null>(null);
  const [noteError, setNoteError] = useState("");
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
  const auction = data?.auction;
  const tx = state?.commitTx ? explorerUrl("tx", state.commitTx) : null;
  const stored = signer?.kind === "passkey" && network.deployment
    ? readNote(localStorage, noteKey(network.chain.id, network.deployment.auction, signer.address, auctionId))
    : null;

  async function showNote() {
    try {
      const key = await vaultKey();
      const opened = key && stored ? await openNote(key, stored) : null;
      if (!opened) setNoteError("This note could not be opened with your passkey.");
      setNote(opened);
    } catch (error) {
      setNoteError(friendlyError(error));
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-20">
      <Badge dot="teal">Bid sealed</Badge>
      <h1 className="mt-5 text-5xl font-bold leading-[0.95] tracking-[-0.04em]">Done. Your bid opens itself.</h1>
      <p className="mt-5 text-lg text-mist">
        Your price and amount are encrypted to three independent keepers. After bidding closes, two of them publish their keys and the contract opens every bid on chain. You do not need to come back until it is time to claim.
      </p>
      <GlassCard className="mt-8">
        <dl className="grid gap-3 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-lilac">Auction</dt><dd className="text-paper">{auction ? `${auction.id} · ${auction.sale.name}` : `#${id}`}</dd></div>
          {data?.slot !== null && data?.slot !== undefined ? <div className="flex justify-between gap-3"><dt className="text-lilac">Your bid</dt><dd className="font-mono text-paper">#{data.slot} on chain</dd></div> : null}
          {auction ? <div className="flex justify-between gap-3"><dt className="text-lilac">Bidding closes</dt><dd className="text-paper">{formatDate(auction.commitDeadline)}</dd></div> : null}
          {tx ? <div className="flex justify-between gap-3"><dt className="text-lilac">Transaction</dt><dd><a className="text-amber" href={tx} target="_blank" rel="noreferrer">View ↗</a></dd></div> : null}
        </dl>
        {stored ? (
          <div className="mt-5 border-t border-white/10 pt-4">
            {note && auction ? (
              <p className="text-paper">You bid for {note.lots} at most {formatPrice(priceAt(auction, note.step), auction, auction.sale, auction.quote)}. Only your passkey can open this note.</p>
            ) : (
              <button type="button" className="btn-secondary min-h-11" onClick={() => void showNote()}>Show what I bid (passkey)</button>
            )}
            {noteError ? <p className="mt-2 text-sm text-amber">{noteError}</p> : null}
          </div>
        ) : null}
      </GlassCard>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link className="btn-primary inline-flex items-center no-underline" to={`/auction/${id}`}><span className="relative z-10">Back to the auction</span></Link>
        <Link className="btn-secondary inline-flex items-center no-underline" to="/bids">My bids</Link>
      </div>
    </div>
  );
}
