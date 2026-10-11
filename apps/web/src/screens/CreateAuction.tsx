import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuction } from "../auction";
import { Badge, GlassCard, PrimaryButton } from "../components/ui";

const STEP_SIZE = 10;
const STEP_COUNT = 6;

function formatTime(seconds: number) {
  return new Date(seconds * 1000).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

export function CreateAuction() {
  const navigate = useNavigate();
  const { account, busy, error, createAuction, connect } = useAuction();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [supply, setSupply] = useState("1000");
  const [minPrice, setMinPrice] = useState("50");
  const [deposit, setDeposit] = useState("1000000");
  const [closeAt, setCloseAt] = useState("");
  const [localError, setLocalError] = useState("");

  const close = closeAt ? Math.floor(new Date(closeAt).getTime() / 1000) : null;
  const ladder = Array.from({ length: STEP_COUNT }, (_, step) => (Number(minPrice) || 0) + step * STEP_SIZE);

  function quickClose(minutes: number) {
    const date = new Date(Date.now() + minutes * 60_000);
    date.setSeconds(0, 0);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    setCloseAt(local);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!account) {
      setLocalError("Connect a wallet before creating an auction.");
      return;
    }
    if (close === null || !Number.isFinite(close) || close <= Math.floor(Date.now() / 1000)) {
      setLocalError("Choose a bidding close time in the future.");
      return;
    }
    setLocalError("");
    const id = await createAuction({ supply, minPrice, deposit, closeAt: close, name, description });
    if (id) navigate(`/auction/${id.toString()}`);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pb-20">
      <div className="grid gap-8 lg:grid-cols-2">
        <form onSubmit={onSubmit} className="rise min-w-0">
          <Badge>For teams</Badge>
          <h1 className="mt-5 text-4xl font-bold tracking-[-0.04em] sm:text-5xl">Create an auction</h1>
          <p className="mt-3 text-mist">The sale token is the deployed test token. Bidders lock the deposit you set.</p>
          {localError || error ? <p className="mt-4 break-words text-amber" role="alert">{localError || error}</p> : null}
          <div className="mt-6 grid gap-4">
            <label className="grid gap-2 text-sm text-mist">Token name, shown in the preview<input className="field" placeholder="Token name" value={name} onChange={(event) => setName(event.target.value)} /></label>
            <label className="grid gap-2 text-sm text-mist">
              Project description
              <textarea className="field min-h-24 resize-y" maxLength={400} placeholder="What the token is for, in a sentence or two" value={description} onChange={(event) => setDescription(event.target.value)} />
              <span className="text-xs text-lilac">Saved in this browser and shown on the auction page here. The contract does not store text.</span>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm text-mist">Tokens for sale<input className="field" inputMode="numeric" value={supply} onChange={(event) => setSupply(event.target.value.replace(/[^\d]/g, ""))} /></label>
              <label className="grid gap-2 text-sm text-mist">Lowest price accepted<input className="field" inputMode="numeric" value={minPrice} onChange={(event) => setMinPrice(event.target.value.replace(/[^\d]/g, ""))} /></label>
            </div>
            <label className="grid gap-2 text-sm text-mist">Bidding close<input className="field" type="datetime-local" value={closeAt} onChange={(event) => setCloseAt(event.target.value)} /></label>
            <div className="flex flex-wrap gap-2" aria-label="Quick close times">
              {[["In 10 min", 10], ["In 1 hour", 60], ["In 1 day", 1440]].map(([label, minutes]) => (
                <button key={label} type="button" className="min-h-11 rounded-full border border-white/20 px-4 text-sm text-mist transition-colors hover:border-amber hover:text-amber" onClick={() => quickClose(Number(minutes))}>
                  {label}
                </button>
              ))}
            </div>
            <label className="grid gap-2 text-sm text-mist">Deposit per bidder<input className="field" inputMode="numeric" value={deposit} onChange={(event) => setDeposit(event.target.value.replace(/[^\d]/g, ""))} /></label>
            {account ? (
              <PrimaryButton type="submit" disabled={busy}>{busy ? "Creating…" : "Create auction"}</PrimaryButton>
            ) : (
              <PrimaryButton onClick={() => { void connect(); }}>Connect wallet to create</PrimaryButton>
            )}
          </div>
        </form>

        <div className="grid content-start gap-4">
          <GlassCard className="rise d1">
            <h2 className="text-sm text-lilac">What bidders will see</h2>
            <p className="mt-3 break-words text-3xl font-bold text-paper">{name || "Token name"}</p>
            {description ? <p className="mt-2 break-words text-sm text-mist">{description}</p> : null}
            <dl className="mt-4 grid gap-2 text-sm text-mist">
              <div className="flex justify-between"><dt>For sale</dt><dd className="font-mono text-paper">{supply || "—"}</dd></div>
              <div className="flex justify-between"><dt>Lowest price</dt><dd className="font-mono text-paper">{minPrice || "—"}</dd></div>
              <div className="flex justify-between"><dt>Deposit</dt><dd className="font-mono text-paper">{deposit || "—"}</dd></div>
            </dl>
          </GlassCard>
          <GlassCard className="rise d2">
            <h2 className="text-sm text-lilac">Price ladder bidders choose from</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {ladder.map((price) => (
                <span key={price} className="rounded-full border border-lavender/40 bg-white/5 px-3 py-1.5 font-mono text-sm text-paper">{price}</span>
              ))}
            </div>
          </GlassCard>
          <GlassCard className="rise d3">
            <h2 className="text-sm text-lilac">Timeline</h2>
            <ol className="mt-3 grid gap-3 text-sm">
              {[
                ["Bidding closes", close],
                ["Reveal window ends", close === null ? null : close + 15 * 60],
                ["Cancel opens if not settled", close === null ? null : close + 30 * 60],
              ].map(([label, time], index) => (
                <li key={String(label)} className="flex items-center gap-3">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${index === 0 ? "bg-amber" : index === 1 ? "bg-teal" : "bg-lavender"}`} />
                  <span className="flex-1 text-mist">{label}</span>
                  <span className="font-mono text-xs text-paper">{typeof time === "number" ? formatTime(time) : "Choose a time"}</span>
                </li>
              ))}
            </ol>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
