import { Link, useParams } from "react-router-dom";
import { useAuction } from "../auction";
import { PhaseTimeline } from "../components/sections";
import { CopyButton, GlassCard, SecondaryButton, formatLeft } from "../components/ui";

export function BidSealed() {
  const { id } = useParams();
  const { selected, quantity, quotedPrice, myBid, now, recoveryCode, account } = useAuction();
  const deposit = selected?.deposit.toString() ?? "—";

  function download() {
    const text = [
      "Blindlaunch bid recovery",
      `Auction: ${id}`,
      `Wallet: ${account ?? ""}`,
      `Tokens bid: ${quantity}`,
      `Recovery code: ${recoveryCode}`,
      "",
      "To reveal from another browser: open the auction, connect this wallet, enter the token amount and this code, then sign.",
      "Keep this file private.",
    ].join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `blindlaunch-auction-${id}-recovery.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-xl px-4 pb-20 text-center">
      <div className="rise relative mx-auto grid h-24 w-24 place-items-center">
        <span className="absolute inset-0 animate-ping rounded-full border border-teal/40" aria-hidden="true" />
        <span className="grid h-20 w-20 place-items-center rounded-full border-2 border-teal bg-teal/10 text-4xl text-teal" aria-hidden="true">✓</span>
      </div>
      <h1 className="rise d1 mt-6 text-4xl font-bold tracking-[-0.04em] sm:text-5xl">Your bid is sealed.</h1>
      <p className="rise d1 mt-3 text-mist">Nobody can read it until bidding closes, not even us.</p>

      <GlassCard className="rise d2 mt-8 text-left">
        <p className="text-sm text-lilac">Auction {id}</p>
        <dl className="mt-4 grid gap-3 text-paper">
          <div className="flex justify-between"><dt className="text-mist">Most per token</dt><dd className="font-mono">{quotedPrice.toString()}</dd></div>
          <div className="flex justify-between"><dt className="text-mist">Tokens asked</dt><dd className="font-mono">{quantity}</dd></div>
          <div className="flex justify-between"><dt className="text-mist">Deposit locked</dt><dd className="font-mono">{deposit}</dd></div>
        </dl>
        {myBid ? (
          <div className="mt-4 flex items-center justify-between gap-2 rounded-xl bg-white/[0.04] px-3">
            <span className="min-w-0 truncate font-mono text-xs text-lavender">{myBid.commitment}</span>
            <CopyButton value={myBid.commitment} />
          </div>
        ) : null}
        {selected ? (
          <div className="mt-6">
            <PhaseTimeline phase={now < selected.commitDeadline ? 0 : 1} />
            <p className="mt-4 text-sm text-mist">
              {now < selected.commitDeadline
                ? <>Reveal opens in <span className="font-mono text-amber">{formatLeft(selected.commitDeadline - now)}</span>. Come back then and press Reveal.</>
                : "The reveal window is open. Reveal now so your bid counts."}
            </p>
          </div>
        ) : null}
        {recoveryCode ? (
          <div className="mt-4 rounded-xl border border-amber/30 bg-amber/10 p-3 text-sm text-paper">
            <p className="font-semibold">Save your recovery code</p>
            <p className="mt-1 text-mist">To reveal from another browser you need this wallet, this code and the number of tokens you bid. Keep the code private. On its own it cannot open your bid.</p>
            <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-ink/60 px-3">
              <span className="min-w-0 truncate font-mono text-xs text-paper">{recoveryCode}</span>
              <CopyButton value={recoveryCode} />
            </div>
            <button type="button" className="mt-2 min-h-11 text-sm text-amber underline-offset-4 hover:underline" onClick={download}>Download as a text file</button>
          </div>
        ) : (
          <p className="mt-4 rounded-xl border border-amber/30 bg-amber/10 p-3 text-sm text-paper">You used a custom salt. It is stored only in this browser, so reveal from here.</p>
        )}
      </GlassCard>

      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
        <Link className="btn-primary inline-flex items-center justify-center no-underline" to={`/auction/${id}`}><span className="relative z-10">Back to the auction</span></Link>
        <SecondaryButton to="/">Browse auctions</SecondaryButton>
      </div>
    </div>
  );
}
