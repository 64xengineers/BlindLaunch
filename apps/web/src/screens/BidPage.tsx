import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { priceAt, readAuctionMeta, readStoredBid, shortAddress, useAuction } from "../auction";
import { AuctionChart, PhaseTimeline, auctionPhase } from "../components/sections";
import { AuctionRules, CostsPanel, NotifyButton, StatusBar, VerifyPanel } from "../components/trust";
import { Badge, CopyButton, Countdown, GlassCard, LockIcon, PrimaryButton } from "../components/ui";

export function BidPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const auction = useAuction();
  const {
    account, wrongChain, busy, now, bids, mySlot, myBid,
    priceStep, quantity, salt, quotedPrice, setPriceStep, setQuantity, setSalt, recoveryCode, setRecoveryCode,
    selectAuction, selected, commit, reveal, act, connect,
  } = auction;

  useEffect(() => {
    if (id) selectAuction(BigInt(id));
  }, [id, selectAuction]);

  const exists = id ? auction.auctions.some((row) => row.id.toString() === id) : false;
  if (auction.loading || (!selected && exists)) {
    return (
      <div className="mx-auto grid max-w-6xl gap-6 px-4 pb-16 lg:grid-cols-2" aria-label="Loading auction">
        <div className="shimmer h-72 rounded-[20px] bg-white/5" />
        <div className="shimmer h-72 rounded-[20px] bg-white/5" />
      </div>
    );
  }
  if (!selected) {
    return <p className="mx-auto max-w-6xl px-4 text-paper" role="alert">This auction could not be loaded. <Link className="text-amber" to="/">Back to auctions</Link></p>;
  }

  const biddingOpen = selected.status === 1 && now < selected.commitDeadline;
  const revealOpen = selected.status === 1 && now >= selected.commitDeadline && now < selected.revealDeadline;
  const cancelled = selected.status === 3;
  const settled = selected.status === 2;
  const phase = auctionPhase(selected, now);
  const target = now < selected.commitDeadline ? selected.commitDeadline : selected.revealDeadline;
  const top = selected.stepCount - 1;
  const chips: [string, number][] = [["Low", 0], ["Mid", Math.floor(top / 2)], ["High", top]];
  const qty = /^\d+$/.test(quantity) ? BigInt(quantity) : 0n;
  const maxSpend = quotedPrice * qty;
  const cap = selected.deposit < selected.maxNotional ? selected.deposit : selected.maxNotional;
  const overCap = maxSpend > cap;
  const isAuthority = account !== null && account.toLowerCase() === selected.authority.toLowerCase();
  const full = selected.bidCount >= selected.maxSlots && mySlot === 0;
  const closingSoon = biddingOpen && selected.commitDeadline - now < 15;
  const saltValid = salt === "" || /^0x[0-9a-fA-F]{64}$/.test(salt);
  const blocker = isAuthority
    ? "You created this auction. The creator cannot bid in it."
    : full
      ? `All ${selected.maxSlots} bid slots are taken.`
      : closingSoon
        ? "Bidding closes in a few seconds. A new bid would likely arrive too late."
        : !saltValid
          ? "The salt must be 0x followed by 64 hex characters. Clear it to get a new one."
          : "";

  const badge = cancelled
    ? <Badge tone="paper">Cancelled: Auction {selected.id.toString()}</Badge>
    : settled
      ? <Badge>Auction {selected.id.toString()} settled</Badge>
      : biddingOpen
        ? <Badge dot="amber" tone="paper">Bidding open: Auction {selected.id.toString()}</Badge>
        : revealOpen
          ? <Badge dot="teal">Reveal window: Auction {selected.id.toString()}</Badge>
          : <Badge tone="paper">Bidding closed: Auction {selected.id.toString()}</Badge>;

  const meta = readAuctionMeta(selected.id);
  const storedBid = account ? readStoredBid(selected.id, account) : null;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-20">
      <StatusBar auction={selected} now={now} />
      <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
        <div className="rise min-w-0">
          {badge}
          <h1 className="mt-5 text-5xl font-bold leading-[0.95] tracking-[-0.04em] sm:text-6xl">
            Bid in secret.<br />Pay one price.
          </h1>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-mist">
            Your bid is scrambled on your device and stays hidden until the deadline. Speed earns nothing, so bots lose their edge.
          </p>
          {!cancelled && !settled ? (
            <div className="mt-7">
              <p className="mb-2 text-sm text-lilac">{biddingOpen ? "Bidding closes in" : revealOpen ? "Reveal closes in" : "Waiting for settlement"}</p>
              <Countdown target={target} now={now} />
            </div>
          ) : null}
          <div className="mt-5"><NotifyButton auction={selected} now={now} /></div>
          {wrongChain ? <p className="mt-4 text-amber" role="alert">Switch the wallet to Monad testnet.</p> : null}
          {settled ? (
            <Link className="btn-primary mt-7 inline-flex items-center no-underline" to={`/auction/${selected.id}/result`}>
              <span className="relative z-10">See the result</span>
            </Link>
          ) : null}
        </div>

        <GlassCard className="rise d1">
          {cancelled ? (
            <>
              <h2 className="text-xl font-bold">Auction cancelled</h2>
              <p className="mt-2 text-mist">Nobody settled before the cancel time. Every bidder can claim the full deposit back.</p>
              <div className="mt-5"><PrimaryButton disabled={!account || busy || !myBid || myBid.claimed} onClick={() => act("claim")}>
                {myBid?.claimed ? "Refund claimed" : "Claim refund"}
              </PrimaryButton></div>
            </>
          ) : biddingOpen ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xl font-bold">Place a sealed bid</h2>
                <span className="text-xs text-teal">Sealed (hashed) on your device</span>
              </div>
              {mySlot !== 0 ? (
                <p className="mt-4 rounded-xl border border-teal/40 bg-teal/10 p-3 text-sm text-paper">You already sealed a bid in this auction. Come back when the reveal window opens.</p>
              ) : null}
              <label className="mt-5 grid gap-2 text-sm text-mist">
                Most you will pay per token
                <select className="field" value={priceStep} onChange={(event) => setPriceStep(event.target.value)}>
                  {Array.from({ length: selected.stepCount }, (_, step) => (
                    <option key={step} value={String(step)}>{priceAt(selected, step).toString()} per token</option>
                  ))}
                </select>
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                {chips.map(([label, step]) => (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={priceStep === String(step)}
                    className={`min-h-11 rounded-full border px-4 text-sm transition-colors ${priceStep === String(step) ? "border-amber bg-amber/15 text-amber" : "border-white/20 text-mist hover:border-lavender hover:text-paper"}`}
                    onClick={() => setPriceStep(String(step))}
                  >
                    {label} · {priceAt(selected, step).toString()}
                  </button>
                ))}
              </div>
              <label className="mt-5 grid gap-2 text-sm text-mist">
                Tokens you want
                <input className="field" inputMode="numeric" placeholder="Amount" value={quantity} onChange={(event) => setQuantity(event.target.value.replace(/[^\d]/g, ""))} />
              </label>
              <dl className="mt-5 grid gap-2 border-t border-white/10 pt-4 text-sm">
                <div className="flex justify-between"><dt className="text-lilac">Most you could pay</dt><dd className={`font-mono font-bold ${overCap ? "text-amber" : "text-paper"}`}>{maxSpend.toString()}</dd></div>
                <div className="flex justify-between"><dt className="text-lilac">Deposit locked</dt><dd className="font-mono font-bold text-paper">{selected.deposit.toString()}</dd></div>
              </dl>
              {overCap ? <p className="mt-2 text-sm text-amber" role="alert">That is above the limit of {cap.toString()} per bid. The contract would not count it. Lower the price or the amount.</p> : null}
              {blocker && mySlot === 0 ? <p className="mt-2 text-sm text-amber" role="alert">{blocker}</p> : null}
              <p className="mt-2 text-xs text-lilac">Whatever you do not spend is refunded after settlement.</p>
              <details className="mt-4 text-sm">
                <summary className="min-h-11 cursor-pointer py-2 text-lilac hover:text-paper">Advanced: secret salt</summary>
                <label className="grid gap-2 text-mist">
                  Leave empty to build it from a free wallet signature plus a random recovery code, so you can reveal on another device. A custom salt is stored only in this browser.
                  <input className="field font-mono text-xs" value={salt} onChange={(event) => setSalt(event.target.value)} />
                </label>
              </details>
              <div className="mt-5">
                {account ? (
                  <PrimaryButton
                    disabled={busy || mySlot !== 0 || qty === 0n || overCap || blocker !== ""}
                    onClick={async () => {
                      const ok = await commit();
                      if (ok) navigate(`/auction/${selected.id}/sealed`);
                    }}
                  >
                    {busy ? "Sealing…" : "Seal my bid"}
                  </PrimaryButton>
                ) : (
                  <PrimaryButton onClick={() => { void connect(); }}>Connect wallet to bid</PrimaryButton>
                )}
              </div>
            </>
          ) : revealOpen ? (
            <>
              <h2 className="text-xl font-bold">Reveal your bid</h2>
              <p className="mt-2 text-mist">Bidding has closed. Reveal now so your bid counts. Unrevealed bids are not filled.</p>
              {myBid ? (
                <dl className="mt-4 grid gap-2 text-sm">
                  <div className="flex justify-between"><dt className="text-lilac">Your slot</dt><dd className="font-mono text-paper">#{myBid.slot}</dd></div>
                  {storedBid ? (
                    <div className="flex justify-between"><dt className="text-lilac">Saved bid</dt><dd className="font-mono text-paper">{priceAt(selected, storedBid.step).toString()} × {storedBid.quantity}</dd></div>
                  ) : !myBid.revealed ? (
                    <div className="grid gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <p className="text-xs text-lilac">No saved bid in this browser. Enter the number of tokens you bid and the recovery code shown when you sealed. Your wallet signs the same free message, and the price is recovered from the on-chain commitment.</p>
                      <label className="grid gap-1 text-xs text-mist">
                        Tokens you bid
                        <input className="field" inputMode="numeric" placeholder="Amount" value={quantity} onChange={(event) => setQuantity(event.target.value.replace(/[^\d]/g, ""))} />
                      </label>
                      <label className="grid gap-1 text-xs text-mist">
                        Recovery code
                        <input className="field font-mono text-xs" placeholder="0x…" autoComplete="off" spellCheck={false} value={recoveryCode} onChange={(event) => setRecoveryCode(event.target.value.trim())} />
                      </label>
                    </div>
                  ) : null}
                  <div className="flex justify-between"><dt className="text-lilac">Status</dt><dd className={myBid.revealed ? "text-teal" : "text-amber"}>{myBid.revealed ? "Revealed" : "Waiting for reveal"}</dd></div>
                </dl>
              ) : <p className="mt-4 text-sm text-lilac">{account ? "This wallet has no bid in this auction." : "Connect the wallet that placed the bid."}</p>}
              <div className="mt-5">
                <PrimaryButton disabled={!account || busy || !myBid || myBid.revealed} onClick={() => reveal()}>
                  {myBid?.revealed ? "Bid revealed" : busy ? "Revealing…" : "Reveal my bid"}
                </PrimaryButton>
              </div>
            </>
          ) : settled ? (
            <>
              <h2 className="text-xl font-bold">Auction settled</h2>
              <p className="mt-2 text-mist">One price was found. Claim tokens and your refund on the result page.</p>
              <div className="mt-5 text-4xl font-bold text-amber">{selected.totalSold > 0n ? selected.clearingPrice.toString() : "No sale"}</div>
            </>
          ) : (
            <>
              <h2 className="text-xl font-bold">Ready to settle</h2>
              <p className="mt-2 text-mist">The reveal window is over. Anyone can settle to compute the one price.</p>
              <div className="mt-5">
                <PrimaryButton disabled={!account || busy || now >= selected.cancelAfter} onClick={() => act("settle")}>
                  {busy ? "Settling…" : "Settle auction"}
                </PrimaryButton>
              </div>
              {now >= selected.cancelAfter ? (
                <div className="mt-3"><PrimaryButton disabled={!account || busy} onClick={() => act("cancel")}>Cancel auction</PrimaryButton></div>
              ) : null}
            </>
          )}
        </GlassCard>
      </div>

      <section className="glass mt-10 grid gap-8 p-5 sm:p-6 lg:grid-cols-2">
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm text-mist">What the public chain shows</h2>
            <span className="font-mono text-xs text-lilac">{bids.length} / {selected.maxSlots} bids</span>
          </div>
          <ul className="mt-4 grid gap-2">
            {bids.length === 0 ? <li className="rounded-xl bg-white/[0.04] p-4 text-sm text-lilac">No sealed bids yet. Be the first.</li> : null}
            {bids.map((bid) => {
              const width = 40 + (parseInt(bid.commitment.slice(2, 4), 16) / 255) * 60;
              const mine = account && bid.bidder.toLowerCase() === account.toLowerCase();
              return (
                <li key={bid.slot} className={`flex min-w-0 items-center gap-2 rounded-xl sm:gap-3 px-3 py-1 transition-colors hover:bg-white/[0.07] ${mine ? "bg-amber/10" : "bg-white/[0.04]"}`}>
                  <LockIcon className={`h-4 w-4 shrink-0 ${bid.revealed ? "text-teal" : "text-amber"}`} open={bid.revealed} />
                  <span className="min-w-0 truncate font-mono text-xs text-lavender sm:shrink-0 sm:text-sm">{bid.commitment.slice(0, 10)}…{bid.commitment.slice(-4)}</span>
                  {bid.revealed ? (
                    <span className="min-w-0 flex-1 truncate text-xs text-teal">price {priceAt(selected, bid.priceStep).toString()} · {bid.quantity.toString()} tokens</span>
                  ) : (
                    <span className="relative hidden h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-white/5 min-[420px]:block">
                      <span className="absolute inset-y-0 left-0 rounded-full bg-lavender/50" style={{ width: `${width}%` }} />
                      <span className="shimmer absolute inset-0" />
                    </span>
                  )}
                  <CopyButton value={bid.commitment} />
                  <a
                    className="inline-flex min-h-11 shrink-0 items-center px-1 text-xs text-lilac no-underline hover:text-amber"
                    href={`https://testnet.monadscan.com/address/${bid.bidder}`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Bidder ${shortAddress(bid.bidder)} on the explorer`}
                  >
                    ↗
                  </a>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-sm text-teal">Only scrambled data. The price is revealed when bidding closes.</p>
        </div>
        <div className="min-w-0">
          <AuctionChart auction={selected} bids={bids} />
        </div>
      </section>

      <section className="mt-6">
        <GlassCard>
          <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="text-sm text-teal">About this launch</p>
              <h2 className="mt-1 text-2xl font-bold">{meta?.name || `Auction ${selected.id.toString()}`}</h2>
              <p className="mt-2 text-sm leading-relaxed text-mist">
                {meta?.description || "A test sale of the Blindlaunch SALE token, paid in the QUOTE test token, on Monad testnet. Bids are sealed until the window closes, then everyone who wins pays one price."}
              </p>
              <p className="mt-3 text-xs text-lilac">Created by {shortAddress(selected.authority)}</p>
              {!cancelled ? <div className="mt-5"><PhaseTimeline phase={phase} /></div> : null}
            </div>
            <div>
              <h3 className="mb-3 text-sm text-lilac">Rules</h3>
              <AuctionRules auction={selected} />
            </div>
          </div>
        </GlassCard>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <CostsPanel auction={selected} maxSpend={biddingOpen ? maxSpend : undefined} />
        <VerifyPanel auction={selected} account={account} />
      </section>
    </div>
  );
}
