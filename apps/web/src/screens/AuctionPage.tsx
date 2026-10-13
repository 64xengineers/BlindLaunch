import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { openConnect } from "../state/connect";
import { useNavigate, useParams } from "react-router-dom";
import { formatUnits, type Address } from "viem";
import { useSession } from "../auth/session";
import { noteKey, sealNote, writeNote } from "../bids/vault";
import { reads } from "../chain/clients";
import { network } from "../chain/config";
import { formatAmount } from "../chain/format";
import { bidProblem, phaseOf, priceAt, publicActions, SEED, STATUS, type AuctionView, type BidView, type Phase } from "../chain/model";
import { AuctionRules, BidList, moneyText, PhaseSticker, priceText, Tip, tokensText, trackerOf, VerifyLinks, wholeLots } from "../components/auction";
import type { HushPose, IconName } from "../components/art";
import { Bubble, Countdown, Fold, Hush, Icon, Meter, Panel, PrimaryButton, PrimaryLink, Receipt, ReceiptRow, SecondaryButton, Stat, Sticker, TokenArt, Tracker, timeLeft } from "../components/ui";
import { callAuction, mintTestQuote, openRemaining, placeBid } from "../state/actions";
import { useNow, usePolling, useRunner } from "../state/hooks";
import { calm, clamp, useCountUp } from "../state/motion";
import { NotFound } from "./NotFound";

export function AuctionPage() {
  const { id } = useParams();
  if (!id || !/^\d+$/.test(id)) return <NotFound />;
  if (!reads) return <NotFound message={`Blindlaunch is not deployed on ${network.label} yet.`} />;
  return <AuctionScreen id={BigInt(id)} />;
}

/** What Hush is doing and saying beside the launch. */
type Mood = { pose: HushPose; open?: boolean; say: ReactNode };

const pause = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const isTestQuote = (auction: AuctionView) =>
  network.name !== "mainnet" && network.deployment?.quote.toLowerCase() === auction.quote.address.toLowerCase();

function useQuoteBalance(auction: AuctionView, account: Address | null) {
  return usePolling(account ? () => reads!.balanceOf(auction.quote.address, account) : null, [account, auction.quote.address], 15_000);
}

function AuctionScreen({ id }: { id: bigint }) {
  const { signer } = useSession();
  const account = signer?.address ?? null;
  const now = useNow();
  const hushRef = useRef<HTMLSpanElement>(null);
  const [override, setOverride] = useState<Mood | null>(null);
  const [sealing, setSealing] = useState(false);
  const { data, loading, reload } = usePolling(async () => {
    const auction = await reads!.auction(id);
    if (!auction) return null;
    const [bids, mySlot, position] = await Promise.all([
      reads!.bids(id, auction.bidCount),
      account ? reads!.slotOf(id, account) : Promise.resolve(null),
      auction.status === STATUS.Settled && auction.seedState !== SEED.None ? reads!.position(id) : Promise.resolve(null),
    ]);
    // Same rule as the result page: once the Kuru market is open, the launch is at TRADING.
    const trading = position !== null && position.seeded && !position.unwound;
    return { auction, bids, mySlot, trading };
  }, [id, account]);

  if (loading && !data) {
    return (
      <div className="au-page" aria-label="Loading launch">
        <div className="au-grid">
          <div className="shimmer h-[520px]" />
          <div className="shimmer h-[520px]" />
        </div>
      </div>
    );
  }
  if (!data) return <NotFound message={`Launch ${id} does not exist.`} />;

  const { auction, bids, mySlot, trading } = data;
  const phase = phaseOf(auction, now);
  const myBid = mySlot !== null ? bids[mySlot] ?? null : null;
  const creator = account !== null && account.toLowerCase() === auction.authority.toLowerCase();
  const mood = override ?? moodOf(phase, auction, { mine: mySlot !== null, creator });
  const bidding = phase === "bidding" || sealing;

  return (
    <div className="au-page">
      <div className="au-grid">
        <LaunchSide auction={auction} phase={phase} now={now} mood={mood} hushRef={hushRef} trading={trading} />
        <Panel as="section" large accent className={`au-side rise d1 ${bidding && mySlot !== null && !sealing ? "is-locked" : ""}`}>
          {bidding && (mySlot === null || sealing) && !creator && auction.bidCount < auction.maxBids ? (
            <BidCard
              auction={auction}
              account={account}
              alreadyBid={mySlot !== null}
              now={now}
              onDone={reload}
              hushRef={hushRef}
              setMood={setOverride}
              setSealing={setSealing}
            />
          ) : bidding ? (
            <BiddingNote auction={auction} mine={mySlot !== null} creator={creator} now={now} />
          ) : phase === "scheduled" ? (
            <SoonPanel auction={auction} account={account} />
          ) : (
            <PhasePanel auction={auction} phase={phase} myBid={myBid} now={now} onDone={reload} />
          )}
        </Panel>
      </div>

      <section className="au-more" aria-label="Bids, rules and proof">
        <Panel className="au-fold">
          <Fold title={<span className="inline-flex items-center gap-3"><Icon name="lock" size={20} className="text-cyan" />See all bids ({auction.bidCount})</span>}>
            <p className="m-0 mb-3 text-[15px] text-muted">
              {auction.openedCount > 0 ? `${auction.openedCount} of ${auction.bidCount} bids unlocked.` : "Every bid stays locked until bidding ends. Only the count is public."}
            </p>
            <BidList auction={auction} bids={bids} account={account} />
          </Fold>
        </Panel>
        <Panel className="au-fold">
          <Fold title={<span className="inline-flex items-center gap-3"><Icon name="info" size={20} className="text-cyan" />The rules of this launch</span>}>
            <AuctionRules auction={auction} />
          </Fold>
        </Panel>
        <VerifyLinks auction={auction} />
      </section>
    </div>
  );
}

function moodOf(phase: Phase, auction: AuctionView, who: { mine: boolean; creator: boolean }): Mood {
  const money = moneyText(auction.deposit, auction.quote, false);
  switch (phase) {
    case "scheduled":
      return { pose: "idle", say: <>Bidding hasn't started yet. Have your <b>{money}</b> bid money ready.</> };
    case "bidding":
      if (who.mine) return { pose: "idle", say: <>Your bid is locked. Nobody can see it. <b>Not even us.</b></> };
      if (who.creator) return { pose: "idle", say: <>This is your launch. Sit back and watch the secret bids come in.</> };
      return { pose: "excited", say: <>Pick the <b>most</b> you'd pay. If the final price ends lower, you pay less. Everyone who wins pays the same price.</> };
    case "awaitingKeys":
    case "opening":
      return { pose: "waiting", say: <>Unlocking. <b>Nothing</b> for you to do.</> };
    case "ready":
      return { pose: "excited", say: <>Somebody press the button! One tap reveals the <b>final price.</b></> };
    case "cancellable":
      return { pose: "error", say: <>Keys didn't show. Everyone gets <b>every cent</b> back.</> };
    case "settled":
      return auction.totalSold > 0n
        ? { pose: "win", say: <>The result is in. Everyone who won pays <b>{priceText(auction, auction.clearingPrice)}.</b></> }
        : { pose: "refund", say: <>Nothing sold this time. Everyone gets their <b>money back.</b></> };
    case "cancelled":
      return { pose: "refund", say: <>Called off. Everyone gets <b>every cent</b> back.</> };
  }
}

/* ---------- left: the launch ---------- */

const trust: [IconName, string][] = [
  ["shield", "Nobody sees bids. Not even us."],
  ["equals", "One final price for all winners."],
  ["return", "Unused money comes straight back."],
];

function LaunchSide({ auction, phase, now, mood, hushRef, trading = false }: { auction: AuctionView; phase: Phase; now: bigint; mood: Mood; hushRef: RefObject<HTMLSpanElement | null>; trading?: boolean }) {
  const bidsShown = Math.round(useCountUp(auction.bidCount));
  const top = priceAt(auction, auction.stepCount - 1);
  const seeded = auction.seedSaleLots > 0n || auction.seedQuoteBps > 0;
  const lines: [IconName, string][] = [...trust, seeded ? ["arrow-up-right", "Trading opens at that same price."] : ["check", "If it breaks, everyone gets a full refund."]];
  const tracker = trading ? { now: "trading" as const, bad: false, done: false } : trackerOf(phase);
  const closing = Number(auction.commitDeadline - now);

  return (
    <section className="min-w-0" aria-labelledby="launch-name">
      <Tracker now={tracker.now} bad={tracker.bad} done={tracker.done} className="rise" />

      <div className="au-hero rise d1">
        <TokenArt address={auction.sale.address} size={120} className="au-art" />
        <div className="min-w-0">
          <PhaseSticker phase={phase} />
          <h1 id="launch-name" className="au-name">
            <span className="glitch" data-text={auction.sale.name}>{auction.sale.name}</span>
            <small>${auction.sale.symbol}</small>
          </h1>
          <p className="au-tag">
            {formatAmount(auction.supply, auction.sale.decimals)} {auction.sale.symbol} for sale · one price for all · bids stay secret
          </p>
        </div>
      </div>

      {phase === "bidding" || phase === "scheduled" ? (
        <div className={`au-count rise d2 ${phase === "scheduled" ? "is-soon" : ""}`}>
          <div className="label">{phase === "scheduled" ? "Bidding opens in" : closing < 60 ? "Last minute" : "Bidding closes in"}</div>
          <Countdown target={Number(phase === "scheduled" ? auction.commitStart : auction.commitDeadline)} now={Number(now)} />
        </div>
      ) : phase === "settled" && auction.totalSold > 0n ? (
        <div className="au-count rise d2">
          <div className="label">Final price · everyone pays</div>
          <div className="au-final num pop-text">{priceText(auction, auction.clearingPrice)}</div>
        </div>
      ) : null}

      <div className="au-stats rise d2">
        <Stat label="Secret bids" value={bidsShown.toLocaleString()} tone="cyan" sub={auction.maxBids - auction.bidCount <= 50 ? `only ${(auction.maxBids - auction.bidCount).toLocaleString()} spots left` : "nobody can see them"} />
        <Stat label="Prices from" value={priceText(auction, auction.minPrice)} sub={`up to ${priceText(auction, top)}`} />
        <Stat label="Bid money" value={moneyText(auction.deposit, auction.quote, false)} sub="unused part comes back" />
      </div>

      <div className="au-hushrow rise d3">
        <span ref={hushRef} className="au-hush">
          <Hush pose={mood.pose} open={mood.open} size={132} className="bob" />
        </span>
        <Bubble className="au-bubble">
          <span key={String(mood.pose)} className="au-say">{mood.say}</span>
        </Bubble>
      </div>

      <ul className="au-trust rise d4">
        {lines.map(([icon, text]) => (
          <li key={text}><span className="ic"><Icon name={icon} size={20} /></span>{text}</li>
        ))}
      </ul>
    </section>
  );
}

/* ---------- right: the bid form ---------- */

type Stage = "idle" | "clamping" | "locked";

const amountSteps = [100n, 250n, 500n];

/** Balanced rows: 16 options make two rows of 8, not 6 + 6 + 4. Many options get smaller chips and a scroll box. */
function priceColumns(count: number): { cols: number; density: string } {
  if (count <= 6) return { cols: count, density: "" };
  const widest = count <= 12 ? 6 : 8;
  const cols = Math.ceil(count / Math.ceil(count / widest));
  return { cols, density: cols > 6 ? `is-tight${count > 32 ? " is-scroll" : ""}` : "" };
}

function Rolling({ value, exact, format }: { value: number; exact: string; format: (shown: number) => string }) {
  const shown = useCountUp(value, 420);
  return <>{shown === value ? exact : format(shown)}</>;
}

function BidCard({ auction, account, alreadyBid, now, onDone, hushRef, setMood, setSealing }: {
  auction: AuctionView;
  account: Address | null;
  alreadyBid: boolean;
  now: bigint;
  onDone: () => void;
  hushRef: RefObject<HTMLSpanElement | null>;
  setMood: (mood: Mood | null) => void;
  setSealing: (value: boolean) => void;
}) {
  const navigate = useNavigate();
  const { signer, vaultKey } = useSession();
  const { run, busy } = useRunner();
  const { data: balance, reload: reloadBalance } = useQuoteBalance(auction, account);
  const wrapRef = useRef<HTMLDivElement>(null);
  const pricesRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLSpanElement>(null);
  const [stage, setStage] = useState<Stage>("idle");

  const { quote, sale } = auction;
  const dollars = /usd/i.test(quote.symbol);
  const unit = 10n ** BigInt(quote.decimals);
  const cap = auction.deposit < auction.maxNotional ? auction.deposit : auction.maxNotional;
  const count = Math.min(auction.stepCount, 64);
  const whole = wholeLots(auction, sale);
  const presets = [
    ...amountSteps.filter((amount) => amount * unit < cap).map((amount) => ({ key: String(amount), label: dollars ? `$${amount}` : `${amount}`, spend: amount * unit })),
    { key: "max", label: "MAX", spend: cap },
  ];
  const lotsFor = (spend: bigint, at: number) => spend / priceAt(auction, at);
  const firstStep = Math.min(count - 1, Math.floor((auction.stepCount - 1) / 2));
  const firstPreset = presets.some((preset) => preset.key === "500") ? "500" : "max";

  const [step, setStep] = useState(firstStep);
  const [preset, setPreset] = useState<string | null>(firstPreset);
  const [lotsText, setLotsText] = useState(() => String(lotsFor(presets.find((p) => p.key === firstPreset)!.spend, firstStep)));

  const lots = /^\d+$/.test(lotsText) ? BigInt(lotsText) : 0n;
  const price = priceAt(auction, step);
  const maxPay = price * lots;
  const maxLots = cap / price;
  const over = lots > 0n && maxPay > cap;
  const valid = lots > 0n && !over;
  const problem = bidProblem(auction, { account, alreadyBid, now, step, lots });
  const short = balance !== undefined && balance < auction.deposit;
  const testQuote = isTestQuote(auction);
  const passkey = signer?.kind === "passkey";

  // A small nudge on the receipt whenever the numbers on it change.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (calm() || !wrapRef.current) return;
    wrapRef.current.animate([{ transform: "translateY(3px) scale(1.02)" }, { transform: "none" }], { duration: 220, easing: "cubic-bezier(.3,1.6,.5,1)" });
  }, [step, lots]);

  // With many price options the grid scrolls: keep the chosen one in view.
  useEffect(() => {
    const box = pricesRef.current;
    const chip = box?.querySelector<HTMLElement>("[aria-pressed='true']");
    if (box && chip && box.scrollHeight > box.clientHeight) box.scrollTop = chip.offsetTop - box.clientHeight / 2 + chip.offsetHeight / 2;
  }, []);

  function pickPrice(index: number) {
    setStep(index);
    const chosen = presets.find((p) => p.key === preset);
    if (chosen) setLotsText(String(lotsFor(chosen.spend, index)));
  }

  function pickPreset(key: string) {
    const chosen = presets.find((p) => p.key === key)!;
    setPreset(key);
    setLotsText(String(lotsFor(chosen.spend, step)));
  }

  function typeLots(text: string) {
    // Whole tokens only: "12.5" means 12, never 125.
    const clean = (text.replace(/[,\s_]/g, "").split(".")[0] ?? "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
    setLotsText(clean);
    const match = presets.find((p) => clean !== "" && lotsFor(p.spend, step) === BigInt(clean));
    setPreset(match ? match.key : null);
  }

  /** The Clamp: the receipt flies into Hush, his shackle slams shut, LOCKED lands. */
  async function lockAnimation() {
    const receipt = wrapRef.current?.querySelector<HTMLElement>(".receipt");
    const hush = hushRef.current;
    if (receipt && hush && !calm()) {
      const box = hush.getBoundingClientRect();
      const target = box.bottom > 0 && box.top < window.innerHeight ? hush : titleRef.current ?? hush;
      const rect = receipt.getBoundingClientRect();
      const flyer = receipt.cloneNode(true) as HTMLElement;
      flyer.removeAttribute("id");
      Object.assign(flyer.style, { position: "fixed", left: `${rect.left}px`, top: `${rect.top}px`, width: `${receipt.offsetWidth}px`, margin: "0", zIndex: "64", pointerEvents: "none" });
      document.body.appendChild(flyer);
      receipt.style.visibility = "hidden";
      await clamp(flyer, target);
      flyer.remove();
    }
    hush?.querySelector("svg.hush")?.classList.remove("is-open");
  }

  async function seal() {
    setSealing(true);
    setMood({ pose: "locking", open: true, say: passkey ? <>Locking it on your device. Confirm with your <b>passkey.</b></> : <>Locking it on your device. Confirm in your <b>wallet.</b></> });
    const record = await run("Seal bid", (w) => placeBid(w, auction.id, step, lots), "Bid locked. Nobody can see it. Not even us.");
    if (!record) {
      setMood(null);
      setSealing(false);
      return;
    }
    setStage("clamping");
    await lockAnimation();
    setStage("locked");
    setMood({ pose: "locking", open: true, say: <>Locked tight. <b>Even I can't peek.</b></> });
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
    await pause(calm() ? 600 : 1000);
    onDone();
    navigate(`/auction/${auction.id}/sealed`, { state: { commitTx: record.commitTx } });
  }

  const money = (value: bigint) => moneyText(value, quote);
  const moneyFloat = (shown: number) =>
    dollars ? `$${shown.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `${shown.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${quote.symbol}`;
  const tokensFloat = (shown: number) => `${shown.toLocaleString("en-US", { maximumFractionDigits: whole ? 0 : 4 })} ${sale.symbol}`;
  const asNumber = (value: bigint, decimals: number) => Number(formatUnits(value, decimals));
  const back = auction.deposit - maxPay;
  const { cols, density } = priceColumns(count);
  const getTest = account !== null && short && testQuote;
  const locked = stage !== "idle";

  let label = "Lock in my bid";
  if (!account) label = "Connect to bid";
  else if (getTest) label = busy === "Get test tokens" ? `Sending test ${quote.symbol}…` : `Get ${formatAmount(auction.deposit, quote.decimals)} test ${quote.symbol}`;
  else if (locked) label = "Locked";
  else if (busy === "Seal bid") label = passkey ? "Confirm with your passkey…" : "Confirm in your wallet…";
  else if (lots === 0n) label = "Pick how much";
  else if (over) label = "Too many tokens";
  else if (short) label = `Not enough ${quote.symbol}`;

  const disabled = busy !== null || locked || (account !== null && !getTest && (problem !== null || short));
  const onPress = !account ? openConnect : getTest
    ? () => void run("Get test tokens", (w) => mintTestQuote(w, auction.deposit), `Got ${formatAmount(auction.deposit, quote.decimals)} test ${quote.symbol}.`).then(reloadBalance)
    : () => void seal();
  const otherProblem = account && problem && lots > 0n && !over && !locked && busy === null ? problem : null;

  return (
    <div className={`au-bid ${locked ? "is-locking" : ""}`}>
      <h2 className="au-h2"><span ref={titleRef} className="text-cyan"><Icon name="lock" size={28} /></span>Your secret bid</h2>
      <p className="au-sub">Two taps. Locked on your device before it leaves. One bid per wallet.</p>

      <div className="au-step">
        <div className="au-step-head">
          <span className="label">1 · Most you'd pay per {whole ? "token" : `pack of ${formatAmount(auction.lotSize, sale.decimals)}`}</span>
          <span className="au-note">{priceText(auction, price)} max</span>
        </div>
        <div
          ref={pricesRef}
          className={`au-prices ${density}`}
          style={{ "--cols": cols } as CSSProperties}
          role="group"
          aria-label="Most you'd pay per token"
        >
          {Array.from({ length: count }, (_, index) => (
            <button
              key={index}
              id={`price-${index}`}
              type="button"
              className="chip"
              aria-pressed={index === step}
              disabled={locked || busy !== null}
              onClick={() => pickPrice(index)}
            >
              {dollars ? priceText(auction, priceAt(auction, index)) : priceText(auction, priceAt(auction, index)).replace(` ${quote.symbol}`, "")}
            </button>
          ))}
        </div>
        {count > 32 ? <p className="au-help">{count} price options. Scroll for more.</p> : null}
      </div>

      <div className="au-step">
        <div className="au-step-head">
          <span className="label">2 · How much to spend</span>
          <span className="au-note">of your {moneyText(cap, quote, false)} bid money</span>
        </div>
        <div className="au-amounts" style={{ "--cols": presets.length } as CSSProperties} role="group" aria-label="How much to spend">
          {presets.map((p) => (
            <button
              key={p.key}
              id={`amount-${p.key}`}
              type="button"
              className="chip au-preset"
              aria-pressed={preset === p.key}
              disabled={locked || busy !== null || lotsFor(p.spend, step) === 0n}
              onClick={() => pickPreset(p.key)}
            >
              {p.label}
            </button>
          ))}
          <label className="au-typed" title={whole ? "Or type how many tokens" : "Or type how many packs"}>
            <span className="sr-only">{whole ? `Or type how many ${sale.symbol}` : `Or type how many packs of ${formatAmount(auction.lotSize, sale.decimals)} ${sale.symbol}`}</span>
            <span className="or" aria-hidden="true">{whole ? "or tokens" : "or packs"}</span>
            <input
              id="bid-tokens"
              className="field field-num"
              inputMode="numeric"
              autoComplete="off"
              value={lotsText}
              aria-invalid={over}
              aria-describedby="amount-help"
              disabled={locked || busy !== null}
              onChange={(event) => typeLots(event.target.value)}
            />
            <span className="suffix" aria-hidden="true">{whole ? sale.symbol : "packs"}</span>
          </label>
        </div>
        <p id="amount-help" className={`au-help ${over ? "is-bad" : ""}`} role={over ? "alert" : undefined}>
          {over
            ? `That's more than your ${moneyText(cap, quote, false)} bid money. At ${priceText(auction, price)} the most is ${tokensText(auction, maxLots)}.`
            : lots === 0n
              ? `Pick an amount, or type how many ${whole ? sale.symbol : "packs"} you want.`
              : whole
                ? "Tap an amount or type an exact number of tokens."
                : `Tokens come in packs of ${formatAmount(auction.lotSize, sale.decimals)} ${sale.symbol}.`}
        </p>
      </div>

      <div ref={wrapRef} className="au-receipt-wrap">
        <Receipt id="receipt" title="Your receipt" aside="locked now, settled later">
          <ReceiptRow icon="lock" tone="violet" label="You lock now (same for everyone)" value={money(auction.deposit)} />
          <ReceiptRow icon="coin" tone="cyan" label="You get up to" value={valid ? <Rolling value={asNumber(lots * auction.lotSize, sale.decimals)} exact={tokensText(auction, lots)} format={tokensFloat} /> : "–"} />
          <ReceiptRow icon="dollar" tone="yellow" label="You pay at most" value={valid ? <Rolling value={asNumber(maxPay, quote.decimals)} exact={money(maxPay)} format={moneyFloat} /> : "–"} />
          <ReceiptRow icon="return" tone="green" label="Comes back for sure" value={valid && back >= 0n ? <Rolling value={asNumber(back, quote.decimals)} exact={money(back)} format={moneyFloat} /> : "–"} />
          <p className="au-fine">{valid ? "If the final price is lower, you pay less." : "Pick a price and an amount to see your bid."}</p>
        </Receipt>
        {stage === "locked" ? <div className="au-stamp" aria-hidden="true"><span>Locked</span></div> : null}
      </div>

      {account && short ? (
        <p className="au-short" role="status">
          <Icon name="alert" size={20} className="text-coral" />
          <span>You need {money(auction.deposit)}{dollars ? ` ${quote.symbol}` : ""} to bid. You have {money(balance ?? 0n)}.</span>
        </p>
      ) : null}

      <div className="au-cta">
        <PrimaryButton id="lock-btn" icon={getTest ? "coin" : locked ? "check" : "lock"} disabled={disabled} onClick={onPress}>
          {label}
        </PrimaryButton>
      </div>
      {otherProblem ? <p className="au-help is-bad text-center" role="alert">{otherProblem}</p> : null}
      <p className="au-after">
        {!account
          ? "Sign in with Face ID or a wallet. No wallet app needed with Face ID."
          : getTest
            ? `Free test money for ${network.label}. Then lock in your bid.`
            : "Then walk away. Your bid unlocks itself when bidding ends."}
      </p>
    </div>
  );
}

/* ---------- right: other states ---------- */

const phaseIcon: Record<Phase, [IconName, string]> = {
  scheduled: ["clock", "text-violet"],
  bidding: ["lock", "text-cyan"],
  awaitingKeys: ["key", "text-cyan"],
  opening: ["key", "text-cyan"],
  ready: ["sparkle", "text-magenta"],
  cancellable: ["alert", "text-coral"],
  settled: ["star", "text-yellow"],
  cancelled: ["return", "text-green"],
};

/** The panel title with the phase icon; the phase sticker already sits by the token name. */
function PanelHead({ phase, icon, title, children }: { phase?: Phase; icon?: ReactNode; title: ReactNode; children?: ReactNode }) {
  const [name, tone] = phaseIcon[phase ?? "bidding"];
  return (
    <>
      <h2 className="au-h2">{icon ?? <Icon name={name} size={28} className={tone} />}{title}</h2>
      {children ? <p className="au-body">{children}</p> : null}
    </>
  );
}

/** Bidding is live, but this wallet can't bid: it already did, it made the launch, or every place is taken. */
function BiddingNote({ auction, mine, creator, now }: { auction: AuctionView; mine: boolean; creator: boolean; now: bigint }) {
  const left = timeLeft(Number(auction.commitDeadline), Number(now));
  if (mine) {
    return (
      <div className="au-state">
        <Sticker tone="cyan" className="mb-4"><Icon name="lock" size={16} />Locked</Sticker>
        <PanelHead title="Your bid is locked">
          Nobody can see it until bidding ends. Not even us.
        </PanelHead>
        <p className="au-ok"><Icon name="check" size={20} />You can leave. There's nothing else to do.</p>
        <ul className="au-next">
          <li><span className="n">1</span>Bidding closes in <b className="num">{left}</b></li>
          <li><span className="n">2</span>Bids unlock by themselves</li>
          <li><span className="n">3</span>Come back to collect</li>
        </ul>
        <div className="mt-6 flex flex-wrap gap-3">
          <SecondaryButton to={`/auction/${auction.id}/sealed`} icon="eye-off">My bid</SecondaryButton>
          <SecondaryButton to="/bids" icon="grid">All my bids</SecondaryButton>
        </div>
        <p className="au-after !text-left">One bid per wallet. Yours is in.</p>
      </div>
    );
  }
  if (creator) {
    return (
      <div className="au-state">
        <PanelHead phase="bidding" title="This is your launch">
          You made this launch, so you can't bid in it. Share the link: bidding closes in <b className="num text-yellow">{left}</b>.
        </PanelHead>
        <div className="mt-6"><SecondaryButton to="/team" icon="flag">My launches</SecondaryButton></div>
      </div>
    );
  }
  return (
    <div className="au-state">
      <PanelHead phase="bidding" title="Every place is taken">
        This launch has room for {auction.maxBids.toLocaleString()} bids and all of them are in. The bidding stays open until the timer ends, but no new bid fits.
      </PanelHead>
      <div className="mt-6"><SecondaryButton to="/" icon="grid">Other launches</SecondaryButton></div>
    </div>
  );
}

function SoonPanel({ auction, account }: { auction: AuctionView; account: Address | null }) {
  const { run, busy } = useRunner();
  const { data: balance, reload } = useQuoteBalance(auction, account);
  const short = balance !== undefined && balance < auction.deposit;
  const money = moneyText(auction.deposit, auction.quote, false);
  const named = /usd/i.test(auction.quote.symbol) ? `${money} ${auction.quote.symbol}` : money;
  return (
    <div className="au-state">
      <PanelHead phase="scheduled" title="Bidding hasn't started">
        Have {named} ready. When the timer ends you'll pick a price and an amount, then lock it in. Two taps.
      </PanelHead>
      <ul className="au-next">
        <li><span className="n">1</span>Pick the most you'd pay per token</li>
        <li><span className="n">2</span>Pick how much to spend</li>
        <li><span className="n">3</span>Lock it in and walk away</li>
      </ul>
      <div className="au-cta">
        {account && short && isTestQuote(auction) ? (
          <PrimaryButton icon="coin" disabled={busy !== null} onClick={() => void run("Get test tokens", (w) => mintTestQuote(w, auction.deposit), `Got ${formatAmount(auction.deposit, auction.quote.decimals)} test ${auction.quote.symbol}.`).then(reload)}>
            {busy ? `Sending test ${auction.quote.symbol}…` : `Get ${formatAmount(auction.deposit, auction.quote.decimals)} test ${auction.quote.symbol}`}
          </PrimaryButton>
        ) : (
          <SecondaryButton to="/" icon="chevron-left">Back to launches</SecondaryButton>
        )}
      </div>
    </div>
  );
}

function UnlockMeter({ auction, tone }: { auction: AuctionView; tone: "cyan" | "green" | "coral" }) {
  const sentence = `${auction.openedCount} of ${auction.bidCount} bids unlocked`;
  return (
    <div className="au-meter">
      <p><b className="num">{auction.openedCount}</b> of <b className="num">{auction.bidCount}</b> bids unlocked</p>
      <Meter value={auction.openedCount} max={Math.max(1, auction.bidCount)} tone={tone} label={sentence} />
    </div>
  );
}

function YourBid({ bid }: { bid: BidView | null }) {
  if (!bid) return null;
  return (
    <p className="au-yours">
      <Icon name={bid.opened ? "unlock" : "lock"} size={18} className={bid.opened ? "text-green" : "text-cyan"} />
      Your bid: {bid.opened ? "unlocked" : "still locked"}
    </p>
  );
}

function PhasePanel({ auction, phase, myBid, now, onDone }: { auction: AuctionView; phase: Phase; myBid: BidView | null; now: bigint; onDone: () => void }) {
  const navigate = useNavigate();
  const { run, busy } = useRunner();
  const actions = publicActions(phase);
  const money = moneyText(auction.deposit, auction.quote, false);
  const result = `/auction/${auction.id}/result`;

  async function reveal() {
    const done = await run("Settle", (w) => callAuction(w, "settle", auction.id), "The result is in.");
    onDone();
    if (done) navigate(result);
  }

  async function refund() {
    const done = await run("Cancel", (w) => callAuction(w, "cancel", auction.id), "Called off. Everyone can collect their money back.");
    onDone();
    if (done) navigate(result);
  }

  if (phase === "awaitingKeys" || phase === "opening") {
    return (
      <div className="au-state">
        <PanelHead phase={phase} title="Bids are unlocking">
          Bidding is closed. Every bid unlocks by itself. You don't need to do anything.
        </PanelHead>
        <UnlockMeter auction={auction} tone="cyan" />
        <YourBid bid={myBid} />
        {actions.includes("openRemaining") ? (
          <>
            <div className="au-cta">
              <PrimaryButton icon="unlock" disabled={busy !== null} onClick={() => void run("Open bids", (w) => openRemaining(w, auction.id), "All bids unlocked.").then(onDone)}>
                {busy ? "Unlocking…" : "Unlock the rest"}
              </PrimaryButton>
            </div>
            <p className="au-after">Anyone can press this to speed it up. Costs a tiny network fee.</p>
          </>
        ) : (
          <p className="au-help mt-5">
            If the bids haven't unlocked in <b className="num text-paper">{timeLeft(Number(auction.cancelAfter), Number(now))}</b>, anyone can refund everyone.
          </p>
        )}
        <h3 className="label mt-7">What happens next</h3>
        <ol className="au-next">
          <li className="is-done"><span className="n"><Icon name="check" size={16} /></span>Bidding closed</li>
          <li><span className="n">2</span>Every bid unlocks, then the final price is set</li>
          <li><span className="n">3</span>Winners collect tokens, everyone collects unused money</li>
        </ol>
        <Tip className="au-tip-panel" />
      </div>
    );
  }

  if (phase === "ready") {
    return (
      <div className="au-state">
        <PanelHead phase={phase} title="All bids are unlocked">
          One tap reveals the final price for everyone. Anyone can press it.
        </PanelHead>
        <UnlockMeter auction={auction} tone="green" />
        <YourBid bid={myBid} />
        {actions.includes("settle") ? (
          <>
            <div className="au-cta">
              <PrimaryButton icon="star" disabled={busy !== null} onClick={() => void reveal()}>
                {busy ? "Revealing…" : "Reveal the result"}
              </PrimaryButton>
            </div>
            <p className="au-after">Costs a tiny network fee. Then everyone can collect.</p>
          </>
        ) : null}
        <Tip className="au-tip-panel" />
      </div>
    );
  }

  if (phase === "cancellable") {
    return (
      <div className="au-state">
        <PanelHead phase={phase} title="The unlock keys never came">
          The bids can't unlock in time. Anyone can call this launch off, and everyone gets every cent back.
        </PanelHead>
        <UnlockMeter auction={auction} tone="coral" />
        <YourBid bid={myBid} />
        {actions.includes("cancel") ? (
          <>
            <div className="au-cta">
              <PrimaryButton icon="return" disabled={busy !== null} onClick={() => void refund()}>
                {busy ? "Calling it off…" : "Refund everyone"}
              </PrimaryButton>
            </div>
            <p className="au-after">{myBid ? `Your ${money} comes back. So does everyone else's.` : `Every bidder's ${money} comes back in full.`}</p>
          </>
        ) : null}
      </div>
    );
  }

  if (phase === "settled") {
    const sold = auction.totalSold > 0n;
    return (
      <div className="au-state">
        <PanelHead phase={phase} title={sold ? "The result is in" : "Nothing was sold"}>
          {sold
            ? <>Everyone who won pays <b className="num text-yellow">{priceText(auction, auction.clearingPrice)}</b> per token. Unused money goes back to every bidder.</>
            : "No bid reached the lowest price. Everyone can collect their money back."}
        </PanelHead>
        {sold ? (
          <div className="au-meter">
            <p><b className="num">{formatAmount(auction.totalSold * auction.lotSize, auction.sale.decimals)}</b> of <b className="num">{formatAmount(auction.supply, auction.sale.decimals)}</b> {auction.sale.symbol} sold</p>
            <Meter value={Number(auction.totalSold)} max={Math.max(1, Number(auction.supplyLots))} tone="green" label={`${auction.totalSold} of ${auction.supplyLots} sold`} />
          </div>
        ) : null}
        <div className="au-cta">
          <PrimaryLink to={result} icon="star" className="w-full">{myBid ? "See my result" : "See the result"}</PrimaryLink>
        </div>
        <p className="au-after">{myBid ? "Collect your tokens and money there." : "Winners and refunds are all on the result page."}</p>
      </div>
    );
  }

  return (
    <div className="au-state">
      <PanelHead phase={phase} title="This launch was called off">
        The bids never unlocked, so nobody bought anything. Every bidder gets their {money} back in full.
      </PanelHead>
      <div className="au-cta">
        <PrimaryLink to={result} icon="return" className="w-full">{myBid ? "Collect my money back" : "See the refunds"}</PrimaryLink>
      </div>
    </div>
  );
}
