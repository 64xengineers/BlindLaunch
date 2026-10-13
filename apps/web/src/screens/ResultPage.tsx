import { allocationOf } from "@blindlaunch/sealed-bid";
import { openConnect } from "../state/connect";
import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { formatUnits, isAddress, type Address } from "viem";
import { useSession } from "../auth/session";
import { reads } from "../chain/clients";
import { explorerUrl, network } from "../chain/config";
import { formatAmount, shortAddress } from "../chain/format";
import { lotLabel, phaseOf, priceAt, SEED, STATUS, type AuctionView, type BidView, type TokenMeta } from "../chain/model";
import { outcomeOf, VerifyLinks } from "../components/auction";
import { Bubble, CopyButton, Fold, Hush, Icon, Meter, Panel, PrimaryButton, SecondaryButton, Stat, TokenArt, Tracker } from "../components/ui";
import { callAuction, claimLeg, openMarket, seedCall, seedIntoMarket } from "../state/actions";
import { useNow, usePolling, useRunner } from "../state/hooks";
import { calm, confetti, useCountUp, useDecode } from "../state/motion";
import { NotFound } from "./NotFound";

/* ---------- plain-word formatting shared by the result, my bids and my launches ---------- */

const isUsd = (quote: TokenMeta) => /usd/i.test(quote.symbol);
const withUnit = (text: string, quote: TokenMeta) => (isUsd(quote) ? `$${text}` : `${text} ${quote.symbol}`);

/** Money in loot, receipts and toasts: two decimals, "$600.00". */
export function money(value: bigint, quote: TokenMeta): string {
  const [whole = "0", fraction = ""] = formatAmount(value, quote.decimals, 2).split(".");
  return withUnit(`${whole}.${fraction.padEnd(2, "0")}`, quote);
}

/** Money in stats and labels: whole dollars when it is whole, "$1,600". */
export function moneyShort(value: bigint, quote: TokenMeta): string {
  const [whole = "0", fraction = ""] = formatAmount(value, quote.decimals, 2).split(".");
  return withUnit(fraction ? `${whole}.${fraction.padEnd(2, "0")}` : whole, quote);
}

/** A price: three decimals under one dollar ("$0.016"), two above ("$2.50"), more only when needed. */
export function priceText(price: bigint, quote: TokenMeta): string {
  const [whole = "0", fraction = ""] = formatAmount(price, quote.decimals, 6).split(".");
  return withUnit(`${whole}.${fraction.padEnd(whole === "0" ? 3 : 2, "0")}`, quote);
}

/** Token amounts: thousands separators, "25,000 NCAT". */
export function tokens(amount: bigint, sale: TokenMeta): string {
  return `${formatAmount(amount, sale.decimals, 2)} ${sale.symbol}`;
}

/* ---------- what a bid got ---------- */

export type LootKind = "won" | "fair" | "missed" | "refund" | "burned";
export type Loot = { kind: LootKind; tokens: bigint; asked: bigint; paid: bigint; back: bigint; max: bigint; uncounted: boolean; percent: number };

/** The bidder's outcome, from the bid and the contract's outcome fields (the same rule as `claimable`). */
export function lootOf(auction: AuctionView, bid: BidView): Loot {
  const asked = bid.quantity * auction.lotSize;
  const max = priceAt(auction, bid.step);
  const none = { tokens: 0n, asked, paid: 0n, max, uncounted: false, percent: 0 };
  if (auction.status === STATUS.Cancelled) return { ...none, kind: "refund", back: auction.deposit };
  if (bid.forfeited) return { ...none, kind: "burned", back: 0n };
  const lots = allocationOf({ counted: bid.counted, step: bid.step, quantity: bid.quantity, prefix: bid.prefix }, outcomeOf(auction));
  const paid = lots * auction.clearingPrice;
  const got = { ...none, tokens: lots * auction.lotSize, paid, back: auction.deposit - paid, percent: bid.quantity > 0n ? Number((lots * 100n) / bid.quantity) : 0 };
  if (!bid.counted) return { ...got, kind: "refund", uncounted: true };
  // A bid at the final price whose share rounds down to nothing was crowded out, not priced out.
  if (lots === 0n) return { ...got, kind: bid.step >= auction.clearingStep ? "fair" : "missed" };
  return { ...got, kind: lots < bid.quantity ? "fair" : "won" };
}

/** Opens the Connect picker in the top bar (the screens have no direct handle on it). */

/** A value that counts up from zero after `delay`, then shows its exact text. */
function Rolling({ value, decimals, exact, approx, delay = 1250 }: { value: bigint; decimals: number; exact: string; approx: (shown: number) => string; delay?: number }) {
  const target = Number(formatUnits(value, decimals));
  const [armed, setArmed] = useState(calm);
  useEffect(() => {
    if (armed) return;
    const timer = window.setTimeout(() => setArmed(true), delay);
    return () => window.clearTimeout(timer);
  }, [armed, delay]);
  const shown = useCountUp(armed ? target : 0, 900);
  return <>{Math.abs(shown - target) <= Math.abs(target) * 1e-12 ? exact : approx(shown)}</>;
}

const groupedNumber = (fraction: number) => (shown: number) => shown.toLocaleString("en-US", { minimumFractionDigits: fraction, maximumFractionDigits: fraction });

function RollMoney({ value, quote, delay, short = false }: { value: bigint; quote: TokenMeta; delay?: number; short?: boolean }) {
  const exact = short ? moneyShort(value, quote) : money(value, quote);
  const fraction = short && !exact.includes(".") ? 0 : 2;
  return <Rolling value={value} decimals={quote.decimals} exact={exact} approx={(shown) => withUnit(groupedNumber(fraction)(shown), quote)} delay={delay} />;
}

function RollTokens({ value, sale, delay }: { value: bigint; sale: TokenMeta; delay?: number }) {
  return <Rolling value={value} decimals={sale.decimals} exact={tokens(value, sale)} approx={(shown) => `${groupedNumber(0)(shown)} ${sale.symbol}`} delay={delay} />;
}

/* ---------- the page ---------- */

export function ResultPage() {
  const { id } = useParams();
  if (!id || !/^\d+$/.test(id)) return <NotFound />;
  if (!reads) return <NotFound message={`Blindlaunch is not deployed on ${network.label} yet.`} />;
  return <ResultScreen id={BigInt(id)} />;
}

type Position = Awaited<ReturnType<NonNullable<typeof reads>["position"]>>;

function ResultScreen({ id }: { id: bigint }) {
  const { signer } = useSession();
  const account = signer?.address ?? null;
  const now = useNow();
  const { data, loading, reload } = usePolling(async () => {
    const auction = await reads!.auction(id);
    if (!auction) return null;
    const [bids, position, slot] = await Promise.all([
      reads!.bids(id, auction.bidCount),
      reads!.position(id),
      account ? reads!.slotOf(id, account) : Promise.resolve(null),
    ]);
    const claimable = account && slot !== null && auction.status >= 2 ? await reads!.claimable(id, account) : null;
    return { auction, bids, position, slot, claimable };
  }, [id, account]);

  if (loading && !data) {
    return (
      <div className="mx-auto max-w-[1360px] px-4 pb-24 sm:px-6 lg:px-8">
        <div className="res-grid">
          <div className="grid gap-5"><div className="shimmer h-12" /><div className="shimmer h-36" /><div className="shimmer h-24" /></div>
          <div className="shimmer h-[420px]" />
        </div>
      </div>
    );
  }
  if (!data) return <NotFound message={`Launch ${id} does not exist.`} />;
  const { auction, bids, position, slot, claimable } = data;
  const phase = phaseOf(auction, now);
  if (phase !== "settled" && phase !== "cancelled") {
    return <NotFound message="This launch has not finished yet. Follow it on the launch page." />;
  }
  const settled = phase === "settled";
  const isAuthority = account !== null && account.toLowerCase() === auction.authority.toLowerCase();
  const market = position.seeded ? explorerUrl("address", position.market) : null;
  const bid = slot !== null ? bids[slot] ?? null : null;
  const loot = bid && claimable ? lootOf(auction, bid) : null;
  const trading = position.seeded && !position.unwound;
  const soldPercent = auction.supplyLots > 0n ? (auction.totalSold * 100n) / auction.supplyLots : 0n;

  return (
    <div className="mx-auto max-w-[1360px] px-4 pb-24 sm:px-6 lg:px-8">
      <div className="res-grid">
        <section aria-labelledby="res-title" className="min-w-0">
          <Tracker className="res-track" now={trading || position.unwound ? "trading" : "result"} bad={!settled} done={position.unwound} />
          <PriceHero auction={auction} settled={settled} loot={loot} />
          <div className="res-stats mt-7 grid grid-cols-3 gap-3">
            <Stat label="Sold" tone="cyan" value={<Rolling value={soldPercent} decimals={0} exact={`${soldPercent}%`} approx={(shown) => `${Math.round(shown)}%`} delay={500} />} />
            <Stat label="Bids" value={<Rolling value={BigInt(auction.bidCount)} decimals={0} exact={auction.bidCount.toLocaleString("en-US")} approx={(shown) => groupedNumber(0)(shown)} delay={500} />} />
            <Stat label="Raised" value={<RollMoney value={auction.totalSold * auction.clearingPrice} quote={auction.quote} delay={500} short />} />
          </div>
          {settled && auction.seedState !== SEED.None ? <KuruCard auction={auction} position={position} now={now} onDone={reload} /> : null}
          {settled && auction.forfeitedTotal > 0n && !auction.forfeitsBurned ? <ForfeitCard auction={auction} onDone={reload} /> : null}
        </section>

        <section aria-label="Your result" className="min-w-0">
          {isAuthority ? (
            <CreatorCard auction={auction} onDone={reload} />
          ) : loot && claimable ? (
            <LootCard auction={auction} loot={loot} claimable={claimable} trading={trading} onDone={reload} />
          ) : (
            <VisitorCard auction={auction} signedIn={account !== null} trading={trading} />
          )}
        </section>
      </div>

      <div className="mt-14 grid gap-3">
        {settled && bids.length > 0 ? (
          <Panel className="res-fold">
            <Fold title={<span className="inline-flex items-center gap-3"><Icon name="unlock" size={20} className="text-cyan" />See all bids ({bids.length})</span>}>
              <BidsTable auction={auction} bids={bids} account={account} />
            </Fold>
          </Panel>
        ) : null}
        <VerifyLinks auction={auction} extra={market ? [["Kuru market", market]] : []} />
      </div>
    </div>
  );
}

/* ---------- left: the final price ---------- */

function PriceHero({ auction, settled, loot }: { auction: AuctionView; settled: boolean; loot: Loot | null }) {
  const { sale, quote } = auction;
  const sold = auction.totalSold > 0n;
  const price = priceText(auction.clearingPrice, quote);
  const shown = useDecode(settled && sold ? price : "", 250);
  const oneToken = auction.lotSize === 10n ** BigInt(sale.decimals);
  const name = sale.name.toUpperCase();
  const people = auction.bidCount === 1 ? "1 person bid" : `${auction.bidCount.toLocaleString("en-US")} people bid`;

  if (!settled || !sold) {
    return (
      <div className="mt-8">
        <div className="flex items-center gap-3">
          <TokenArt address={sale.address} size={44} />
          <h1 id="res-title" className="label !text-[15px]">{name} · {settled ? "no sale" : "called off"}</h1>
        </div>
        <div className="res-price is-off mt-4">{settled ? "No sale" : "Called off"}</div>
        <p className="res-say">
          {settled
            ? auction.bidCount === 0
              ? <>Nobody bid, so nothing sold. <b>Nobody pays anything.</b></>
              : <>{people}, but no bid counted, so nothing sold. <b>Nobody pays anything.</b> Bid money comes back.</>
            : <>The unlock keys never came, so <b>nobody pays anything.</b> Every cent of bid money comes back.</>}
        </p>
      </div>
    );
  }

  const startingPrice = auction.clearingStep === 0 && auction.totalSold < auction.supplyLots;
  const yours = loot && (loot.kind === "won" || loot.kind === "fair")
    ? <> You bid up to <b>{priceText(loot.max, quote)}</b>, so you pay <b>{price}</b> like everyone else.</>
    : loot && loot.kind === "missed"
      ? <> You bid up to <b>{priceText(loot.max, quote)}</b>, below the final price.</>
      : null;
  return (
    <div className="mt-8">
      <div className="flex items-center gap-3">
        <TokenArt address={sale.address} size={44} />
        <h1 id="res-title" className="label !text-[15px]">{name} final price · everyone pays</h1>
      </div>
      <div className="res-price mt-3" aria-hidden="true">{shown}</div>
      <p className="sr-only" aria-live="polite">Final price: {price} per {oneToken ? "token" : lotLabel(auction, sale)}</p>
      {!oneToken ? <div className="res-per">per {lotLabel(auction, sale)}</div> : null}
      <p className="res-say res-everyone">
        Bids unlocked. {people}. <b>{formatAmount(auction.totalSold * auction.lotSize, sale.decimals, 2)} of {tokens(auction.supply, sale)}</b> sold.
        {startingPrice ? " Not every token sold, so everyone pays the lowest price." : ""}
        {yours}
      </p>
    </div>
  );
}

/* ---------- left: Kuru and forfeits ---------- */

function KuruCard({ auction, position, now, onDone }: { auction: AuctionView; position: Position; now: bigint; onDone: () => void }) {
  const { run, busy } = useRunner();
  const { sale, quote } = auction;
  const locked = now < auction.seedLockUntil;
  const reserved = auction.seedState === SEED.Reserved;
  const waiting = auction.seedState === SEED.HandedOff && position.accepted && !position.seeded && !position.unwound;
  const live = position.seeded && !position.unwound;
  const canUnwind = position.accepted && !position.unwound && !locked;
  const price = priceText(auction.clearingPrice, quote);
  const setAside = `${tokens(auction.seedSale, sale)} and ${money(auction.seedQuote, quote)}`;
  const notStarted = reserved || waiting;
  /** Mainnet: only Kuru creates markets, so the launch seeds the market Kuru lists. Elsewhere anyone can start one. */
  const kuruOnly = network.onlyKuruCreatesMarkets;
  const [marketInput, setMarketInput] = useState("");
  const [marketTried, setMarketTried] = useState(false);
  const marketText = marketInput.trim();
  const marketError = marketTried && !isAddress(marketText) ? "That isn't a market address. It starts with 0x and has 40 more letters and numbers." : null;

  let tone = "var(--color-green)";
  let icon: Parameters<typeof Icon>[0]["name"] = "arrow-up-right";
  let title: string;
  let body: ReactNode;
  let note: ReactNode = null;
  if (position.unwound) {
    tone = "var(--color-violet)"; icon = "check";
    title = "Trading on Kuru closed";
    body = "The market was unwound after the lock. What was left went back to the creator.";
  } else if (live && canUnwind) {
    title = "The lock is over";
    body = <>{sale.symbol} still trades on Kuru from {price}. Anyone can now close the market; what is left goes back to the creator.</>;
  } else if (live) {
    title = "Trading is live";
    body = <>{sale.symbol} trades on Kuru from <span className="num font-bold">{price}</span></>;
    note = `The starting pool stays on Kuru until ${new Date(Number(auction.seedLockUntil) * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })}. Nobody can pull it out before then.`;
  } else if (reserved || waiting) {
    tone = "var(--color-cyan)"; icon = "play";
    title = reserved && !locked ? "Trading never started" : "Start trading on Kuru";
    body = <>{setAside} are set aside to open trading at {price}.{kuruOnly ? "" : " Anyone can press this."}</>;
    if (reserved && !locked) note = "The lock is over, so they can also go back to the creator.";
  } else if (auction.seedState === SEED.Released) {
    tone = "var(--color-violet)"; icon = "return";
    title = "Trading never started";
    body = "What was set aside for Kuru went back to the creator.";
  } else {
    tone = "var(--color-violet)"; icon = "clock";
    title = "Trading on Kuru";
    body = <>{setAside} went to Kuru to open trading at {price}.</>;
  }

  const action = (label: string, done: string, fn: Parameters<typeof run>[1]) => () => void run(label, fn, done).then(onDone);
  const submitMarket = (event: FormEvent) => {
    event.preventDefault();
    setMarketTried(true);
    if (!isAddress(marketText)) return;
    const market: Address = marketText;
    action("Use this Kuru market", `Trading is live on Kuru at ${price}.`, (w) => seedIntoMarket(w, auction.id, market))();
  };
  return (
    <Panel className="res-strip mt-5">
      <span className="res-ic" style={{ "--ic": tone } as CSSProperties}><Icon name={icon} size={24} /></span>
      <div className="min-w-0">
        <div className="label" style={{ color: tone }}>{title}</div>
        <p>{body}</p>
        {note ? <small>{note}</small> : null}
      </div>
      <div className="acts">
        {live && network.kuruApp ? <a className="res-go" href={network.kuruApp} target="_blank" rel="noreferrer">Trade on Kuru <span className="arrow">→</span></a> : null}
        {live && network.kuruApp ? <span className="flex items-center gap-1 text-sm text-muted">Find it with {shortAddress(sale.address)}<CopyButton value={sale.address} /></span> : null}
        {live && !network.kuruApp ? <span className="flex items-center gap-1 text-sm text-muted">Test market {shortAddress(position.market)}<CopyButton value={position.market} /></span> : null}
        {notStarted && !kuruOnly ? (
          <SecondaryButton icon="play" disabled={busy !== null} onClick={action("Start trading", `Trading is live on Kuru at ${price}.`, (w) => openMarket(w, auction.id))}>
            {busy === "Start trading" ? "Starting trading…" : "Start trading"}
          </SecondaryButton>
        ) : null}
        {reserved && !locked ? (
          <SecondaryButton icon="return" disabled={busy !== null} onClick={action("Return the reserved tokens", `Returned. ${setAside} went back to the creator.`, (w) => callAuction(w, "releaseSeed", auction.id))}>
            {busy === "Return the reserved tokens" ? "Returning…" : "Return the reserved tokens"}
          </SecondaryButton>
        ) : null}
        {canUnwind ? (
          <SecondaryButton icon="return" disabled={busy !== null} onClick={action("Unwind the market", "Market unwound. What was left went back to the creator.", (w) => seedCall(w, "unwind", auction.id))}>
            {busy === "Unwind the market" ? "Unwinding…" : "Unwind the market"}
          </SecondaryButton>
        ) : null}
      </div>
      {notStarted ? (
        <form className="col-span-full grid gap-2" noValidate onSubmit={submitMarket}>
          <label htmlFor="kuru-market" className="label !text-[13px]">Kuru market address</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="kuru-market"
              className="field num"
              placeholder="0x…"
              autoComplete="off"
              spellCheck={false}
              value={marketInput}
              onChange={(event) => setMarketInput(event.target.value)}
              onBlur={() => { if (marketText !== "") setMarketTried(true); }}
              aria-invalid={marketError ? true : undefined}
              aria-describedby="kuru-market-help"
            />
            <button type="submit" className="btn-2 shrink-0" disabled={busy !== null}>
              <Icon name="arrow-up-right" size={18} />
              <span>{busy === "Use this Kuru market" ? "Using this market…" : "Use this Kuru market"}</span>
            </button>
          </div>
          {marketError ? <div className="cr-error" role="alert"><Icon name="alert" size={16} className="mt-0.5" />{marketError}</div> : null}
          <small id="kuru-market-help">
            {kuruOnly
              ? `On Monad mainnet only Kuru can create a new market. Once Kuru lists ${sale.symbol}, paste its market address here.`
              : `Kuru already lists ${sale.symbol}? Paste its market address here instead.`}
          </small>
        </form>
      ) : null}
    </Panel>
  );
}

function ForfeitCard({ auction, onDone }: { auction: AuctionView; onDone: () => void }) {
  const { run, busy } = useRunner();
  return (
    <Panel className="res-strip mt-4">
      <span className="res-ic" style={{ "--ic": "var(--color-coral)" } as CSSProperties}><Icon name="alert" size={24} /></span>
      <div className="min-w-0">
        <div className="label !text-coral">A bid cheated</div>
        <p>A bid that cheated lost its money (<span className="num font-bold">{money(auction.forfeitedTotal, auction.quote)}</span>). It gets burned; nobody gets it.</p>
        <small>Anyone can press this.</small>
      </div>
      <div className="acts">
        <SecondaryButton icon="x" disabled={busy !== null} onClick={() => void run("Burn it", (w) => callAuction(w, "burnForfeits", auction.id), "Burned. Nobody gets that money.").then(onDone)}>
          {busy === "Burn it" ? "Burning…" : "Burn it"}
        </SecondaryButton>
      </div>
    </Panel>
  );
}

/* ---------- right: the loot card ---------- */

const lootStyle: Record<LootKind, { word: string; fill: string; pop: string; pose: Parameters<typeof Hush>[0]["pose"]; soft: boolean }> = {
  won: { word: "You won", fill: "var(--color-yellow)", pop: "var(--color-magenta)", pose: "win", soft: false },
  fair: { word: "Fair share", fill: "var(--color-cyan)", pop: "var(--color-magenta)", pose: "fair", soft: false },
  missed: { word: "Missed", fill: "var(--color-coral)", pop: "var(--color-cyan)", pose: "missed", soft: true },
  refund: { word: "Money back", fill: "var(--color-green)", pop: "var(--color-magenta)", pose: "refund", soft: true },
  burned: { word: "Burned", fill: "var(--color-coral)", pop: "var(--color-cyan)", pose: "error", soft: true },
};

function LootCard({ auction, loot, claimable, trading, onDone }: { auction: AuctionView; loot: Loot; claimable: readonly [bigint, bigint]; trading: boolean; onDone: () => void }) {
  const { run, busy } = useRunner();
  const card = useRef<HTMLDivElement>(null);
  const { sale, quote } = auction;
  const style = lootStyle[loot.kind];
  const [tokensLeft, moneyLeft] = claimable;
  const nothing = tokensLeft === 0n && moneyLeft === 0n;
  const collected = nothing && (loot.tokens > 0n || loot.back > 0n);
  const price = priceText(auction.clearingPrice, quote);
  const celebrate = (loot.kind === "won" || loot.kind === "fair") && loot.tokens > 0n;

  useEffect(() => {
    if (!celebrate) return;
    const timer = window.setTimeout(() => confetti(card.current, loot.kind === "won" ? 160 : 70), 1150);
    return () => window.clearTimeout(timer);
  }, [celebrate, loot.kind]);

  const both = [tokensLeft > 0n ? tokens(tokensLeft, sale) : null, moneyLeft > 0n ? money(moneyLeft, quote) : null].filter(Boolean).join(" and ");
  const collectedToast = tokensLeft > 0n ? `Collected. ${both} are in your wallet.` : `Collected. ${both} is back in your wallet.`;

  const headline = {
    won: <>You got all {tokens(loot.tokens, sale)} at {price} each.</>,
    fair: loot.tokens === 0n ? <>Crowded! Your share rounded down to zero tokens.</> : <>Crowded! You got {loot.percent}% of what you asked for.</>,
    missed: <>The final price, {price}, was above your {priceText(loot.max, quote)} max.</>,
    refund: loot.uncounted ? <>Your bid did not count, so every cent comes back.</> : <>Called off. Every cent comes back.</>,
    burned: <>Your bid did not match what you locked, so its money was burned.</>,
  }[loot.kind];

  const footnote = {
    won: loot.max > auction.clearingPrice ? <>Your max was {priceText(loot.max, quote)}. You paid less: {price} a token.</> : <>Your max was exactly the final price.</>,
    fair: loot.tokens === 0n
      ? <>Lots of bids landed exactly on {price}. Shares round down, and yours came to less than one. All your money comes back.</>
      : <>Lots of bids landed exactly on {price}, so each got the same slice of what it asked for.</>,
    missed: <>All your money comes back.{trading ? ` You can still buy ${sale.symbol} on Kuru.` : ""}</>,
    refund: null,
    burned: <>It gets burned; nobody gets it.</>,
  }[loot.kind];

  const bubble = collected
    ? <>All collected. <b>{[loot.tokens > 0n ? tokens(loot.tokens, sale) : null, loot.back > 0n ? money(loot.back, quote) : null].filter(Boolean).join(" and ")}</b> went to your wallet.</>
    : {
      won: <>GG. Your <b>{tokens(loot.tokens, sale)}</b> and <b>{money(loot.back, quote)}</b> back, in one tap.</>,
      fair: loot.tokens === 0n
        ? <>So crowded that your slice rounded down to nothing. All <b>{money(loot.back, quote)}</b> comes back.</>
        : <>It was crowded at the final price, so every bid there got the same slice of what it asked for. Yours: <b>{tokens(loot.tokens, sale)}.</b></>,
      missed: <>The final price ended above your max. All <b>{money(loot.back, quote)}</b> comes back.</>,
      refund: <>Nobody pays anything. All <b>{money(loot.back, quote)}</b> comes back, in one tap.</>,
      burned: <>That bid did not match what was locked, so there is nothing to collect.</>,
    }[loot.kind];

  return (
    <div>
      <div className={`res-pop res-drop ${style.soft ? "is-soft" : ""}`} style={{ "--loot-pop": style.pop } as CSSProperties}>
        <div ref={card} className="loot res-loot" style={{ "--loot": style.fill } as CSSProperties}>
          {collected ? <span className="res-stamp" aria-hidden="true">Collected</span> : null}
          <div className="label">Your result</div>
          <h2 className="loot-word shout res-slap m-0 uppercase">{style.word}</h2>
          <p className="res-head">{headline}</p>
          <div className="mt-4 grid gap-2.5">
            <div className="loot-line">
              <span>Tokens you get{loot.kind === "fair" ? <small>of {tokens(loot.asked, sale)} asked</small> : null}</span>
              <b><RollTokens value={loot.tokens} sale={sale} /></b>
            </div>
            <div className="loot-line"><span>You paid</span><b><RollMoney value={loot.paid} quote={quote} /></b></div>
            <div className="loot-line">
              <span className={loot.kind === "missed" ? "res-underline" : ""}>Money back</span>
              <b><RollMoney value={loot.back} quote={quote} /></b>
            </div>
          </div>
          {footnote ? <p className="res-foot">{footnote}</p> : null}
          <div className="mt-5 pr-2">
            <PrimaryButton
              tone={loot.kind === "refund" ? "cyan" : "green"}
              icon={nothing ? "check" : "bag"}
              disabled={busy !== null || nothing}
              onClick={() => void run("Collect", (w) => callAuction(w, "claim", auction.id), collectedToast).then(onDone)}
            >
              {nothing ? "Nothing left to collect" : busy === "Collect" ? "Collecting…" : "Collect it all"}
            </PrimaryButton>
          </div>
        </div>
      </div>
      {tokensLeft > 0n && moneyLeft > 0n ? (
        <Fold className="res-after mt-4 px-1" title={<span className="text-[15px] text-muted">Trouble collecting?</span>}>
          <p className="m-0 text-[15px] text-muted">If one token is paused or blocks your address, collect the other on its own.</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <SecondaryButton icon="coin" disabled={busy !== null} onClick={() => void run("Tokens only", (w) => claimLeg(w, "claimTokens", auction.id), `Collected. ${tokens(tokensLeft, sale)} are in your wallet.`).then(onDone)}>
              {busy === "Tokens only" ? "Collecting…" : "Tokens only"}
            </SecondaryButton>
            <SecondaryButton icon="dollar" disabled={busy !== null} onClick={() => void run("Money only", (w) => claimLeg(w, "claimRefund", auction.id), `Collected. ${money(moneyLeft, quote)} is back in your wallet.`).then(onDone)}>
              {busy === "Money only" ? "Collecting…" : "Money only"}
            </SecondaryButton>
          </div>
        </Fold>
      ) : null}
      <div className="res-hushrow">
        <span className="res-hush"><Hush pose={style.pose} size={120} className="bob" /></span>
        <Bubble className="res-after">{bubble}</Bubble>
      </div>
    </div>
  );
}

/* ---------- right: the creator's card ---------- */

function CreatorCard({ auction, onDone }: { auction: AuctionView; onDone: () => void }) {
  const { run, busy } = useRunner();
  const { sale, quote } = auction;
  const settled = auction.status === STATUS.Settled;
  const raised = settled ? auction.clearingPrice * auction.totalSold : 0n;
  const yourMoney = settled ? raised - auction.seedQuote : 0n;
  const unsold = settled ? (auction.supplyLots - auction.totalSold) * auction.lotSize - auction.seedSale : auction.supply;
  const done = auction.unsoldReclaimed && auction.proceedsReclaimed;
  const percent = auction.supplyLots > 0n ? Number((auction.totalSold * 100n) / auction.supplyLots) : 0;
  const pending = [
    !auction.proceedsReclaimed && yourMoney > 0n ? money(yourMoney, quote) : null,
    !auction.unsoldReclaimed && unsold > 0n ? tokens(unsold, sale) : null,
  ].filter(Boolean).join(" and ");

  return (
    <div>
      <div className="res-pop res-drop" style={{ "--loot-pop": "var(--color-cyan)" } as CSSProperties}>
        <div className="loot res-loot res-creator" style={{ "--loot": "var(--color-magenta)" } as CSSProperties}>
          {done ? <span className="res-stamp" aria-hidden="true">Collected</span> : null}
          <div className="label">Your launch</div>
          {settled ? (
            <>
              <h2 className="res-head !mt-3 !text-[18px]">You raised</h2>
              <div className="res-raised res-slap"><RollMoney value={raised} quote={quote} /></div>
              <p className="res-head !text-[17px]">{percent}% sold: {formatAmount(auction.totalSold * auction.lotSize, sale.decimals, 2)} of {tokens(auction.supply, sale)}</p>
              <div className="mt-2"><Meter value={percent} max={100} label={`${percent}% sold`} /></div>
            </>
          ) : (
            <>
              <h2 className="loot-word shout res-slap m-0 uppercase">Called off</h2>
              <p className="res-head">The unlock keys never came, so nobody paid anything. Your tokens come back.</p>
            </>
          )}
          <div className="mt-4 grid gap-2.5">
            {settled ? <div className="loot-line"><span>Your money</span><b><RollMoney value={yourMoney} quote={quote} /></b></div> : null}
            <div className="loot-line"><span>{settled ? "Unsold tokens" : "Your tokens back"}</span><b><RollTokens value={unsold} sale={sale} /></b></div>
            {settled && auction.seedState !== SEED.None ? (
              <div className="loot-line"><span>Set aside for Kuru</span><b className="!text-[22px]">{money(auction.seedQuote, quote)} + {tokens(auction.seedSale, sale)}</b></div>
            ) : null}
          </div>
        </div>
      </div>
      <div className="mt-6 pr-2">
        <PrimaryButton
          className="w-full !text-[19px]"
          icon={done ? "check" : "bag"}
          disabled={busy !== null || done}
          onClick={() => void run("Collect", (w) => callAuction(w, "reclaim", auction.id), pending ? `Collected. ${pending} ${pending.includes(" and ") ? "are" : "is"} in your wallet.` : "Collected.").then(onDone)}
        >
          {done ? "Nothing left to collect" : busy === "Collect" ? "Collecting…" : settled ? "Collect your money and unsold tokens" : "Collect your tokens"}
        </PrimaryButton>
      </div>
      {!auction.proceedsReclaimed && !auction.unsoldReclaimed ? (
        <Fold className="mt-4 px-1" title={<span className="text-[15px] text-muted">Trouble collecting?</span>}>
          <p className="m-0 text-[15px] text-muted">If one token is paused or blocks your address, collect the other on its own.</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <SecondaryButton icon="dollar" disabled={busy !== null} onClick={() => void run("Money only", (w) => claimLeg(w, "reclaimProceeds", auction.id), `Collected. ${money(yourMoney, quote)} is in your wallet.`).then(onDone)}>
              {busy === "Money only" ? "Collecting…" : "Money only"}
            </SecondaryButton>
            <SecondaryButton icon="coin" disabled={busy !== null} onClick={() => void run("Unsold tokens only", (w) => claimLeg(w, "reclaimUnsold", auction.id), `Collected. ${tokens(unsold, sale)} are in your wallet.`).then(onDone)}>
              {busy === "Unsold tokens only" ? "Collecting…" : "Unsold tokens only"}
            </SecondaryButton>
          </div>
        </Fold>
      ) : null}
      <div className="res-hushrow">
        <span className="res-hush"><Hush pose={done ? "idle" : "excited"} size={120} className="bob" /></span>
        <Bubble className="res-after">
          {done ? <>All collected. It is in your wallet.</> : pending ? <>Nice launch. <b>{pending}</b> {pending.includes(" and ") ? "are" : "is"} yours, in one tap.</> : <>Nothing to collect yet.</>}
        </Bubble>
      </div>
    </div>
  );
}

/* ---------- right: someone who did not bid ---------- */

function VisitorCard({ auction, signedIn, trading }: { auction: AuctionView; signedIn: boolean; trading: boolean }) {
  const { sale, quote } = auction;
  return (
    <div>
      <div className="res-drop is-soft">
        <Panel large accent className="res-neutral">
          <div className="label">Your result</div>
          <h2 className="loot-word m-0 uppercase">{signedIn ? "Just watching" : "Did you win?"}</h2>
          <p className="mt-4 mb-0 max-w-[30em] text-[18px] text-muted">
            {signedIn ? "This account did not bid in this launch, so there is nothing to collect here." : "Sign in to see if you won and to collect what is yours."}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {signedIn ? <SecondaryButton to="/" icon="grid">See live launches</SecondaryButton> : <PrimaryButton className="w-auto" icon="fingerprint" onClick={openConnect}>Sign in to check</PrimaryButton>}
            {signedIn ? <SecondaryButton to="/bids" icon="lock">My bids</SecondaryButton> : null}
          </div>
        </Panel>
      </div>
      <div className="res-hushrow">
        <span className="res-hush"><Hush pose={signedIn ? "idle" : "waiting"} size={120} className="bob" /></span>
        <Bubble className="res-after">
          {trading
            ? <>Didn't bid? <b>{sale.symbol}</b> trades on Kuru from <b>{priceText(auction.clearingPrice, quote)}.</b></>
            : <>Next time, lock a secret bid before bidding closes. Everyone who wins pays one price.</>}
        </Bubble>
      </div>
    </div>
  );
}

/* ---------- bottom: every bid ---------- */

function BidsTable({ auction, bids, account }: { auction: AuctionView; bids: readonly BidView[]; account: Address | null }) {
  const [shown, setShown] = useState(10);
  const outcome = outcomeOf(auction);
  const { sale, quote } = auction;
  const mineFirst = [...bids].sort((a, b) => Number(isMine(b, account)) - Number(isMine(a, account)));
  return (
    <div className="pb-4">
      <div className="overflow-x-auto">
        <table className="res-table">
          <thead>
            <tr><th>Who</th><th>Asked</th><th>Max price</th><th>Got</th><th>Paid</th></tr>
          </thead>
          <tbody>
            {mineFirst.slice(0, shown).map((bid) => {
              const mine = isMine(bid, account);
              const lots = allocationOf({ counted: bid.counted, step: bid.step, quantity: bid.quantity, prefix: bid.prefix }, outcome);
              return (
                <tr key={bid.slot} className={mine ? "is-you" : ""}>
                  <td className="addr">{shortAddress(bid.bidder)}{mine ? <span className="you">you</span> : null}</td>
                  {bid.forfeited ? (
                    <td colSpan={4} className="!text-coral">Cheating bid: money burned</td>
                  ) : !bid.counted ? (
                    <td colSpan={4} className="!text-muted">Did not count: full money back</td>
                  ) : (
                    <>
                      <td className="n">{tokens(bid.quantity * auction.lotSize, sale)}</td>
                      <td className="n">{priceText(priceAt(auction, bid.step), quote)}</td>
                      <td className={`n ${lots > 0n ? "!text-green" : "!text-muted"}`}>{lots > 0n ? tokens(lots * auction.lotSize, sale) : "None"}</td>
                      <td className="n">{money(lots * auction.clearingPrice, quote)}</td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {bids.length > shown ? (
        <div className="mt-4"><SecondaryButton icon="chevron-down" onClick={() => setShown((value) => value + 10)}>Show 10 more</SecondaryButton></div>
      ) : null}
    </div>
  );
}

function isMine(bid: BidView, account: Address | null): boolean {
  return account !== null && bid.bidder.toLowerCase() === account.toLowerCase();
}
