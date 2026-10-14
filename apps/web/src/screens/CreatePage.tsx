import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { getAddress, isAddress, type Address } from "viem";
import { useSession } from "../auth/session";
import { publicClient, reads } from "../chain/clients";
import { network } from "../chain/config";
import { defaultForm, planAuction, toCreateParams, type CreateErrors, type CreateForm } from "../chain/create";
import { formatAmount, parseAmount, shortAddress } from "../chain/format";
import type { TokenMeta } from "../chain/model";
import type { HushPose, IconName } from "../components/art";
import { CopyButton, Hush, Icon, Panel, PrimaryButton, Receipt, ReceiptRow, SecondaryButton, Sticker, TokenArt } from "../components/ui";
import { WalletPicker } from "../components/wallet";
import { createAuction, createToken, ensureAllowance } from "../state/actions";
import { usePolling, useRunner } from "../state/hooks";
import { calm, confetti } from "../state/motion";
import { NotFound } from "./NotFound";

type Mode = "new" | "existing";
type NewToken = { name: string; symbol: string; decimals: string; totalSupply: string };
type Step = 1 | 2 | 3;

export function CreatePage() {
  if (!reads || !network.deployment) return <NotFound message={`Blindlaunch is not deployed on ${network.label} yet.`} />;
  return <CreateScreen />;
}

/* ---------- plain words and number formats ---------- */

/** planAuction speaks contract; the screen speaks people. Unknown messages pass through unchanged. */
const PLAIN: Record<string, string> = {
  "Use 1 to 64 price levels.": "Pick 1 to 64 price options.",
  "With more than one level, the step must be above zero.": "With more than one option, the step must be above zero.",
  "The top price is too large.": "The highest price is too large.",
  "Enter a deposit above zero.": "Enter the bid money, above zero.",
  "The deposit is too large.": "That bid money is too large.",
  "The deposit must cover at least one token at the lowest price.": "Bid money must cover at least 1 token at the lowest price.",
  "Keepers get 10 minutes to 30 days to open the bids.": "Use 10 minutes to 30 days.",
  "You cannot seed more tokens than you sell.": "You can't list more tokens than you sell.",
  "Seed some tokens or some proceeds, or turn seeding off.": "List some tokens or some money, or turn trading off.",
  "Choose one of the listed payment tokens.": "Pick one of the listed payment tokens.",
  "The token for sale and the payment token must differ.": "You can't sell the payment token itself. Pick another token.",
  "A ladder price cannot be expressed exactly on Kuru. Use fewer decimals.": "Kuru can't list one of your prices exactly. Use a rounder lowest price or step.",
  "A ladder price falls between Kuru ticks.": "Kuru can't list one of your prices exactly. Use a rounder lowest price or step.",
  "The lowest price must be at least two Kuru ticks.": "The lowest price is too small for Kuru. Raise it, or turn trading off.",
  "The top price is too high for a Kuru market.": "The highest price is too high for Kuru. Lower it, or turn trading off.",
};
const plain = (message: string | undefined) => (message === undefined ? undefined : PLAIN[message] ?? message);

const dollars = (symbol: string) => /usd/i.test(symbol);
const withUnit = (amount: string, symbol: string) => (dollars(symbol) ? `$${amount}` : `${amount} ${symbol}`.trim());
const group = (text: string) => (/^\d+$/.test(text.trim()) ? BigInt(text.trim()).toLocaleString("en-US") : text.trim() || "–");

/** Prices: at least 3 decimals under 1 ($0.010), at least 2 above ($2.50), up to 6 when needed. */
function priceText(value: bigint, decimals: number, symbol: string): string {
  const [whole = "0", fraction = ""] = formatAmount(value, decimals, 6).split(".");
  const min = value < 10n ** BigInt(decimals) ? 3 : 2;
  return withUnit(`${whole}.${fraction.padEnd(min, "0")}`, symbol);
}

/** Money: whole amounts without cents ($1,000), otherwise 2 decimals; `cents` forces them ($3,000.00). */
function moneyText(value: bigint, decimals: number, symbol: string, cents = false): string {
  const [whole = "0", fraction = ""] = formatAmount(value, decimals, 2).split(".");
  return withUnit(cents || fraction ? `${whole}.${fraction.padEnd(2, "0")}` : whole, symbol);
}

function minutesWords(text: string): string {
  if (!/^\d+$/.test(text.trim())) return "–";
  const minutes = Number(text);
  if (minutes >= 1440 && minutes % 1440 === 0) return `${minutes / 1440} day${minutes === 1440 ? "" : "s"}`;
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60} hour${minutes === 60 ? "" : "s"}`;
  if (minutes > 60) return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  return `${minutes} min`;
}

function daysWords(text: string): string {
  if (!/^\d+$/.test(text.trim())) return "–";
  const days = Number(text);
  return `${days.toLocaleString("en-US")} day${days === 1 ? "" : "s"}`;
}

function opensWords(text: string): string {
  if (!/^\d+$/.test(text.trim())) return "–";
  return Number(text) === 0 ? "about 2 min after you launch" : `${minutesWords(text)} after you launch`;
}

/** For after the launch exists: "in about 2 minutes", "in 5 min". */
function opensInWords(text: string): string {
  if (!/^\d+$/.test(text.trim())) return "soon";
  return Number(text) === 0 ? "in about 2 minutes" : `in ${minutesWords(text)}`;
}

/* ---------- small pieces ---------- */

function Field({ id, label, value, onChange, error, hint, inputMode = "text", prefix, suffix, placeholder, numeric = false, className = "" }: {
  id: string; label: ReactNode; value: string; onChange: (value: string) => void; error?: string | undefined; hint?: ReactNode;
  inputMode?: "numeric" | "decimal" | "text"; prefix?: string | undefined; suffix?: string | undefined; placeholder?: string; numeric?: boolean; className?: string;
}) {
  const note = error || hint ? `${id}-note` : undefined;
  return (
    <div className={`cr-field ${className}`}>
      <label htmlFor={id} className="cr-label">{label}</label>
      <Affixed id={id} value={value} onChange={onChange} invalid={Boolean(error)} describedBy={note} inputMode={inputMode} prefix={prefix} suffix={suffix} placeholder={placeholder} numeric={numeric} />
      {error ? <p id={note} className="cr-error" role="alert"><Icon name="alert" size={16} className="mt-0.5" />{error}</p> : hint ? <p id={note} className="cr-hint">{hint}</p> : null}
    </div>
  );
}

function Affixed({ id, value, onChange, invalid, describedBy, inputMode, prefix, suffix, placeholder, numeric, label, className = "" }: {
  id?: string; value: string; onChange: (value: string) => void; invalid?: boolean; describedBy?: string | undefined; inputMode: "numeric" | "decimal" | "text";
  prefix?: string | undefined; suffix?: string | undefined; placeholder?: string | undefined; numeric?: boolean; label?: string; className?: string;
}) {
  return (
    <div className={`cr-input ${className}`}>
      {prefix ? <span className="cr-affix cr-prefix" aria-hidden="true">{prefix}</span> : null}
      <input
        id={id}
        className={`field ${numeric ? "field-num" : ""}`}
        style={{ ...(prefix ? { paddingLeft: `calc(18px + ${prefix.length * 0.62}em)` } : {}), ...(suffix ? { paddingRight: `${Math.min(suffix.length, 10) * 0.62 + 1.8}em` } : {}) }}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        aria-label={label}
        inputMode={inputMode}
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {suffix ? <span className="cr-affix cr-suffix" aria-hidden="true">{suffix}</span> : null}
    </div>
  );
}

function Section({ icon, tone = "cyan", title, children, aside }: { icon: IconName; tone?: "cyan" | "yellow" | "green" | "violet"; title: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="cr-sec">
      <h2 className="cr-sec-h">
        <span className="cr-sec-ic" style={{ background: `var(--color-${tone})` }}><Icon name={icon} size={16} /></span>
        <span className="flex-1">{title}</span>
        {aside}
      </h2>
      {children}
    </section>
  );
}

const STEPS: [Step, string][] = [[1, "Token"], [2, "Sale"], [3, "Trading"]];

function Stepper({ step, onGo }: { step: Step; onGo: (step: Step) => void }) {
  return (
    <ol className="cr-stepper" aria-label="Create a launch: steps">
      {STEPS.map(([value, label], index) => (
        <Fragment key={value}>
          {index > 0 ? <li className={`cr-line ${value <= step ? "is-done" : ""}`} aria-hidden="true"><i /></li> : null}
          <li>
            {value < step ? (
              <button type="button" className="cr-node is-done" onClick={() => onGo(value)} aria-label={`Step ${value}, ${label}: done. Go back to it.`}>
                <span className="sq"><Icon name="check" size={20} /></span>{label}
              </button>
            ) : (
              <span className={`cr-node ${value === step ? "is-now" : ""}`} aria-current={value === step ? "step" : undefined}>
                <span className="sq">{value}</span>{label}
              </span>
            )}
          </li>
        </Fragment>
      ))}
    </ol>
  );
}

function Choice({ checked, disabled, icon, title, sub, onPick }: { checked: boolean; disabled: boolean; icon: IconName; title: string; sub: string; onPick: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={checked} disabled={disabled && !checked} className="cr-choice cr-cut" onClick={onPick}>
      <span className="cr-choice-ic"><Icon name={icon} size={30} /></span>
      <span className="min-w-0"><b>{title}</b><small>{sub}</small></span>
      <span className="cr-radio" aria-hidden="true">{checked ? <Icon name="check" size={18} /> : null}</span>
    </button>
  );
}

function Chips({ label, value, options, onPick, children }: { label: string; value: string; options: [string, string][]; onPick: (value: string) => void; children?: ReactNode }) {
  return (
    <div className="cr-chips" role="group" aria-label={label}>
      {options.map(([option, text]) => (
        <button key={option} type="button" className="chip cr-chip" aria-pressed={value.trim() === option} onClick={() => onPick(option)}>{text}</button>
      ))}
      {children}
    </div>
  );
}

/** The short party after a launch is created, then on to its page. */
function Launched({ name, symbol, opens, onDone }: { name: string; symbol: string; opens: string; onDone: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const fired = useRef(false);
  useEffect(() => {
    if (!fired.current) {
      fired.current = true;
      confetti(box.current, 140);
    }
    const timer = window.setTimeout(onDone, calm() ? 900 : 2200);
    return () => window.clearTimeout(timer);
  }, [onDone]);
  return createPortal(
    <div className="cr-party" role="status" aria-live="polite" onClick={onDone}>
      <div className="cr-party-box" ref={box}>
        <span className="cr-burst" aria-hidden="true" />
        <Hush pose="excited" size={190} className="cr-hop" />
        <Sticker tone="green" className="cr-slap">Launch set!</Sticker>
        <div className="panel panel-lg cr-party-text">
          <h2 className="cr-party-title">Your launch is set</h2>
          <p className="cr-party-sub">{name} ({symbol}) opens for bids {opens}. Taking you there…</p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ---------- the wizard ---------- */

const TITLES: Record<Step, [string, string]> = {
  1: ["Which token?", "Make a brand-new token, or sell one you already hold."],
  2: ["Set up the sale", "How many tokens, at which prices, and for how long."],
  3: ["Trading on Kuru", "Let your token trade the moment the sale ends."],
};
const STEP2_KEYS = ["supplyTokens", "floorPrice", "stepPrice", "stepCount", "deposit", "maxBids", "startMinutes", "biddingMinutes", "cancelGapMinutes", "balance", "quoteToken"] as const;
const ADVANCED_KEYS = ["maxBids", "cancelGapMinutes", "quoteToken"] as const;

function CreateScreen() {
  const navigate = useNavigate();
  const { signer } = useSession();
  const { run, busy } = useRunner();
  const account = signer?.address ?? null;
  const [mode, setMode] = useState<Mode>("new");
  const [token, setToken] = useState<NewToken>({ name: "", symbol: "", decimals: "18", totalSupply: "1000000" });
  const [existing, setExisting] = useState("");
  const [quote, setQuote] = useState<Address>(network.quoteTokens[0]!);
  const [form, setForm] = useState<CreateForm>(defaultForm);
  const [createdToken, setCreatedToken] = useState<Address | null>(null);
  const [progress, setProgress] = useState<string>("");
  const [attempted, setAttempted] = useState(false);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<Step>(1);
  const [tried, setTried] = useState<Set<Step>>(new Set());
  const [nudge, setNudge] = useState(0);
  const [signingIn, setSigningIn] = useState(false);
  const [launched, setLaunched] = useState<bigint | null>(null);
  const closeSignIn = useCallback(() => setSigningIn(false), []);
  const formRef = useRef<HTMLDivElement>(null);
  const advancedRef = useRef<HTMLDetailsElement>(null);
  const touch = (key: string) => setTouched((current) => (current.has(key) ? current : new Set(current).add(key)));
  /** Errors appear once a field has been edited, Next was pressed on its step, or a launch was attempted; never on a fresh form. */
  const shown = (key: string, error: string | undefined) => (attempted || touched.has(key) || tried.has(step) ? error : undefined);

  const existingAddress = isAddress(existing) ? getAddress(existing) : null;
  const saleAddress = mode === "existing" ? existingAddress : createdToken;
  const { data: quoteMeta } = usePolling(() => reads!.token(quote), [quote], 60_000);
  const { data: quoteMetas } = usePolling(() => Promise.all(network.quoteTokens.map((address) => reads!.token(address))), [], 60_000);
  const { data: saleInfo, error: saleError } = usePolling(
    saleAddress ? async (): Promise<{ meta: TokenMeta; balance: bigint | undefined }> => {
      const meta = await reads!.token(saleAddress);
      return { meta, balance: account ? await reads!.balanceOf(saleAddress, account) : undefined };
    } : null,
    [saleAddress, account],
    15_000,
  );

  const newDecimals = /^\d+$/.test(token.decimals) ? Number(token.decimals) : NaN;
  const saleDecimals = mode === "new" ? (createdToken && saleInfo ? saleInfo.meta.decimals : newDecimals) : saleInfo?.meta.decimals;
  const tokenErrors: Partial<Record<keyof NewToken | "existing", string>> = {};
  if (mode === "new" && !createdToken) {
    if (!token.name.trim() || token.name.length > 64) tokenErrors.name = "Give your token a name, up to 64 characters.";
    if (!token.symbol.trim() || token.symbol.length > 16) tokenErrors.symbol = "Use 1 to 16 characters.";
    if (!Number.isInteger(newDecimals) || newDecimals > 36) tokenErrors.decimals = "Use 0 to 36.";
    const total = Number.isInteger(newDecimals) ? parseAmount(token.totalSupply, newDecimals) : null;
    if (total === null || total === 0n) tokenErrors.totalSupply = "Enter how many tokens to make.";
    else if (/^\d+$/.test(form.supplyTokens) && total < BigInt(form.supplyTokens) * 10n ** BigInt(newDecimals)) tokenErrors.totalSupply = `Make at least as many as you sell (${group(form.supplyTokens)}).`;
  }
  if (mode === "existing" && !existingAddress) tokenErrors.existing = "Paste the token's address. It starts with 0x.";
  if (mode === "existing" && existingAddress && saleError) tokenErrors.existing = "That address isn't a token on this network. Check it and paste again.";

  const { plan, errors } = useMemo(() => {
    if (saleDecimals === undefined || !Number.isInteger(saleDecimals) || !quoteMeta) return { plan: null, errors: {} as CreateErrors };
    return planAuction(form, {
      saleToken: saleAddress,
      saleDecimals,
      quoteToken: quote,
      quoteDecimals: quoteMeta.decimals,
      allowedQuotes: network.quoteTokens,
      ...(mode === "existing" && saleInfo?.balance !== undefined ? { balance: saleInfo.balance } : {}),
    });
  }, [form, saleDecimals, quoteMeta, quote, saleAddress, mode, saleInfo]);

  const valid = plan !== null && Object.keys(tokenErrors).length === 0;
  const set = (key: keyof CreateForm) => (value: string) => {
    touch(key);
    setForm((current) => ({ ...current, [key]: value }));
  };

  const symbol = mode === "new" ? token.symbol || "TOKEN" : saleInfo?.meta.symbol ?? "TOKEN";
  const tokenName = mode === "new" ? token.name.trim() || "Your token" : saleInfo?.meta.name ?? "Your token";
  const qd = quoteMeta?.decimals;
  const qs = quoteMeta?.symbol ?? "";

  /* Wizard gates. Step 2 needs the plan to have run (token decimals and the payment token known). */
  const planned = saleDecimals !== undefined && Number.isInteger(saleDecimals) && quoteMeta !== undefined;
  const step1Ok = Object.keys(tokenErrors).length === 0 && !errors.saleToken && (mode === "new" || saleInfo !== undefined);
  const step2Ok = step1Ok && planned && STEP2_KEYS.every((key) => !errors[key]);
  const okAt: Record<Step, boolean> = { 1: step1Ok, 2: step2Ok, 3: valid };
  const firstBad: Step | null = !step1Ok ? 1 : !step2Ok ? 2 : !valid ? 3 : null;

  /* After a refused Next or launch: open Advanced if the problem is in there, then focus the first marked field. */
  useEffect(() => {
    if (nudge === 0) return;
    if (ADVANCED_KEYS.some((key) => errors[key]) && advancedRef.current) advancedRef.current.open = true;
    const frame = requestAnimationFrame(() => {
      const bad = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
      if (bad) {
        bad.focus({ preventScroll: true });
        bad.scrollIntoView({ block: "center", behavior: calm() ? "auto" : "smooth" });
      }
    });
    return () => cancelAnimationFrame(frame);
    // Runs once per refused press; the errors it reads are the ones on screen at that moment.
  }, [nudge]);

  const pick = (value: Mode) => {
    setMode(value);
    setTried((current) => {
      const next = new Set(current);
      next.delete(1);
      return next;
    });
  };
  const go = (target: Step) => {
    setStep(target);
    window.scrollTo({ top: 0, behavior: calm() ? "auto" : "smooth" });
  };
  function next() {
    if (!okAt[step]) {
      setTried((current) => new Set(current).add(step));
      setNudge((value) => value + 1);
      return;
    }
    go((step + 1) as Step);
  }

  async function launch() {
    setAttempted(true);
    if (!plan || !quoteMeta) return;
    const total = saleAddress ? 2 : 3;
    let at = 0;
    const say = (text: string) => setProgress(`Step ${++at} of ${total}: ${text}`);
    const id = await run("Launch", async (w) => {
      let sale = saleAddress;
      if (!sale) {
        say("making your token…");
        const decimals = Number(token.decimals);
        sale = await createToken(w, { name: token.name.trim(), symbol: token.symbol.trim(), decimals, supply: parseAmount(token.totalSupply, decimals)! });
        setCreatedToken(sale);
      }
      say(`approving ${group(form.supplyTokens)} ${symbol}…`);
      await ensureAllowance(w, sale, plan.supply);
      say("creating the launch…");
      const chainTime = (await publicClient.getBlock()).timestamp;
      return createAuction(w, toCreateParams(plan, sale, quote, chainTime));
    }, "Launch created.");
    setProgress("");
    if (id !== undefined) setLaunched(id);
  }
  const finish = useCallback(() => {
    if (launched !== null) navigate(`/auction/${launched}`);
  }, [launched, navigate]);

  /* ---------- live numbers for the preview, independent of the full plan ---------- */
  const ladder = useMemo(() => {
    if (qd === undefined) return null;
    const min = parseAmount(form.floorPrice, qd);
    const stepSize = parseAmount(form.stepPrice, qd);
    const count = Number(form.stepCount);
    if (min === null || min === 0n || stepSize === null || !Number.isInteger(count) || count < 1 || count > 64 || (count > 1 && stepSize === 0n)) return null;
    return Array.from({ length: count }, (_, index) => min + BigInt(index) * stepSize);
  }, [form.floorPrice, form.stepPrice, form.stepCount, qd]);
  const lowest = ladder?.[0];
  const highest = ladder?.[ladder.length - 1];
  const deposit = qd === undefined ? null : parseAmount(form.deposit, qd);
  const tokensForSale = /^\d+$/.test(form.supplyTokens.trim()) ? BigInt(form.supplyTokens.trim()) : null;
  const raise = tokensForSale !== null && highest !== undefined ? tokensForSale * highest : null;
  const perBid = deposit && lowest ? deposit / lowest : null;
  const rangeText = ladder && qd !== undefined && lowest !== undefined && highest !== undefined
    ? ladder.length === 1 ? priceText(lowest, qd, qs) : `${priceText(lowest, qd, qs)} to ${priceText(highest, qd, qs)}`
    : "–";
  const seedTokens = /^\d+$/.test(form.seedTokens.trim()) ? Number(form.seedTokens) : null;
  const seedShare = seedTokens !== null && tokensForSale ? Math.round((seedTokens / Number(tokensForSale)) * 1000) / 10 : null;

  const balanceError = errors.balance
    ? saleInfo?.balance !== undefined && saleDecimals !== undefined ? `You only have ${formatAmount(saleInfo.balance, saleDecimals)} ${symbol}.` : plain(errors.balance)
    : undefined;
  const holdings = mode === "new" && !createdToken
    ? tokenErrors.totalSupply ? undefined : `You make ${group(token.totalSupply)} ${symbol} in step 1.`
    : saleInfo?.balance !== undefined ? `You have ${formatAmount(saleInfo.balance, saleInfo.meta.decimals)} ${symbol}.` : undefined;

  const hushPose: HushPose = busy ? "waiting" : (attempted && !valid) || (tried.has(step) && !okAt[step]) ? "error" : step === 3 && valid ? "excited" : "idle";
  const [title, sub] = TITLES[step];
  const steps = saleAddress ? "Two wallet steps: approve the tokens, then create the launch." : "Three wallet steps: make the token, approve it, create the launch.";

  /* ---------- steps ---------- */

  const tokenStep = (
    <>
      <div className="cr-choices" role="radiogroup" aria-label="Which token">
        <Choice checked={mode === "new"} disabled={createdToken !== null} icon="plus" title="Make a new token" sub="We create it and send all of it to your wallet." onPick={() => pick("new")} />
        <Choice checked={mode === "existing"} disabled={createdToken !== null} icon="wallet" title="I already have one" sub="Paste its address. You sell from your wallet." onPick={() => pick("existing")} />
      </div>
      {mode === "new" ? (
        createdToken ? (
          <div className="cr-done-note">
            <span className="cr-sec-ic" style={{ background: "var(--color-green)" }}><Icon name="check" size={16} /></span>
            <p className="m-0 flex-1">Your token is made at <span className="font-mono text-paper">{shortAddress(createdToken)}</span>. Keep going: you won't make it again.</p>
            <CopyButton value={createdToken} />
          </div>
        ) : (
          <div className="grid gap-5">
            <div className="cr-grid2">
              <Field id="cr-name" label="Name" placeholder="Pixel Pigeon" value={token.name} onChange={(name) => { touch("name"); setToken({ ...token, name }); }} error={shown("name", tokenErrors.name)} />
              <Field id="cr-symbol" label="Ticker" placeholder="COO" value={token.symbol} onChange={(value) => { touch("symbol"); setToken({ ...token, symbol: value.toUpperCase() }); }} error={shown("symbol", tokenErrors.symbol)} hint="Short and loud, like COO or GOB." />
            </div>
            <Field id="cr-total" label="How many to make" numeric inputMode="decimal" suffix={token.symbol || "tokens"} value={token.totalSupply} onChange={(totalSupply) => { touch("totalSupply"); setToken({ ...token, totalSupply }); }} error={tokenErrors.totalSupply} hint="All of them go to your wallet. You choose how many to sell next." />
            <details className="fold cr-fold">
              <summary className="font-bold text-paper hover:text-cyan"><span>Advanced</span><Icon name="chevron-down" size={20} className="chev text-cyan" /></summary>
              <div className="cr-grid2 pt-3">
                <Field id="cr-decimals" label="Decimals" numeric inputMode="numeric" value={token.decimals} onChange={(decimals) => { touch("decimals"); setToken({ ...token, decimals }); }} error={shown("decimals", tokenErrors.decimals)} hint="18 is standard. Leave it unless you know why." />
              </div>
            </details>
          </div>
        )
      ) : (
        <div className="grid gap-4">
          <Field id="cr-address" label="Token address" placeholder="0x…" value={existing} onChange={(value) => { touch("existing"); setExisting(value.trim()); }} error={shown("existing", tokenErrors.existing) ?? plain(errors.saleToken)} />
          {existingAddress && !saleInfo && !saleError ? <p className="cr-hint">Checking that token…</p> : null}
          {saleInfo && existingAddress && !tokenErrors.existing ? (
            <div className="cr-found">
              <TokenArt address={existingAddress} size={56} />
              <p className="m-0">
                Found <b>{saleInfo.meta.name}</b> <span className="num text-cyan">({saleInfo.meta.symbol})</span>.{" "}
                {saleInfo.balance !== undefined ? <>You hold <b className="num">{formatAmount(saleInfo.balance, saleInfo.meta.decimals)}</b> {saleInfo.meta.symbol}.</> : "Sign in to see how many you hold."}
              </p>
            </div>
          ) : null}
        </div>
      )}
    </>
  );

  const count = Number(form.stepCount);
  const options = ladder && qd !== undefined
    ? ladder.length <= 10 ? ladder.map((price) => priceText(price, qd, qs)) : [...ladder.slice(0, 4).map((price) => priceText(price, qd, qs)), "…", ...ladder.slice(-2).map((price) => priceText(price, qd, qs))]
    : [];

  const saleStep = (
    <>
      <Section icon="dollar" tone="yellow" title="Tokens and prices">
        <div className="cr-grid2">
          <Field id="cr-supply" label="Tokens for sale" numeric inputMode="numeric" suffix={symbol} value={form.supplyTokens} onChange={set("supplyTokens")} error={plain(errors.supplyTokens) ?? balanceError} hint={holdings} />
          <Field id="cr-floor" label="Lowest price, per token" numeric inputMode="decimal" prefix={dollars(qs) ? "$" : undefined} suffix={dollars(qs) ? undefined : qs} value={form.floorPrice} onChange={set("floorPrice")} error={plain(errors.floorPrice)} hint="Bidding starts here. If not every token sells, this is the final price." />
          <Field id="cr-step" label="Price step" numeric inputMode="decimal" prefix={dollars(qs) ? "+$" : "+"} suffix={dollars(qs) ? undefined : qs} value={form.stepPrice} onChange={set("stepPrice")} error={plain(errors.stepPrice)} hint="The gap between two price options." />
          <div className="cr-field">
            <label htmlFor="cr-count" className="cr-label">Number of price options</label>
            <div className="cr-count">
              <button type="button" className="chip" aria-label="One option fewer" disabled={!Number.isInteger(count) || count <= 1} onClick={() => set("stepCount")(String(Math.max(1, Math.min(64, count - 1))))}><Icon name="minus" size={20} /></button>
              <Affixed id="cr-count" numeric inputMode="numeric" value={form.stepCount} onChange={set("stepCount")} invalid={Boolean(errors.stepCount)} describedBy={errors.stepCount ? "cr-count-note" : undefined} />
              <button type="button" className="chip" aria-label="One option more" disabled={Number.isInteger(count) && count >= 64} onClick={() => set("stepCount")(String(Number.isInteger(count) ? Math.min(64, Math.max(1, count + 1)) : 2))}><Icon name="plus" size={20} /></button>
            </div>
            {errors.stepCount ? <p id="cr-count-note" className="cr-error" role="alert"><Icon name="alert" size={16} className="mt-0.5" />{plain(errors.stepCount)}</p> : <p className="cr-hint">2 to 64 is typical.</p>}
          </div>
        </div>
        <div className="cr-range" aria-live="polite">
          {ladder ? (
            <>
              <p className="cr-range-line"><b>{rangeText}</b> in <b className="n">{ladder.length}</b> option{ladder.length === 1 ? "" : "s"}</p>
              <div className="cr-opts" aria-hidden="true">{options.map((text, index) => <span key={`${text}-${index}`} className={text === "…" ? "gap" : ""}>{text}</span>)}</div>
              <p className="cr-hint">Bidders pick one of these as the most they'd pay. Everyone who wins pays the same final price.</p>
            </>
          ) : <p className="cr-hint">Fill in the prices to see the options bidders get.</p>}
        </div>
      </Section>

      <Section icon="lock" tone="green" title="Bid money per bidder">
        <Chips label="Bid money presets" value={form.deposit} onPick={set("deposit")} options={["100", "250", "500", "1000"].map((value) => [value, withUnit(group(value), qs)])}>
          <Affixed className="cr-mini" label="Bid money per bidder" numeric inputMode="decimal" prefix={dollars(qs) ? "$" : undefined} suffix={dollars(qs) ? undefined : qs} value={form.deposit} onChange={set("deposit")} invalid={Boolean(errors.deposit)} describedBy="cr-deposit-note" />
        </Chips>
        {errors.deposit ? <p id="cr-deposit-note" className="cr-error" role="alert"><Icon name="alert" size={16} className="mt-0.5" />{plain(errors.deposit)}</p> : (
          <p id="cr-deposit-note" className="cr-hint">
            Everyone locks the same amount; unused money comes back.
            {perBid !== null && lowest !== undefined && qd !== undefined ? <> One bid buys at most <b className="num text-paper">{perBid.toLocaleString("en-US")} {symbol}</b> at {priceText(lowest, qd, qs)}.</> : null}
          </p>
        )}
      </Section>

      <Section icon="clock" tone="violet" title="Timing">
        <div className="cr-rows">
          <div className="cr-row">
            <span className="cr-label">Bidding lasts</span>
            <Chips label="Bidding lasts" value={form.biddingMinutes} onPick={set("biddingMinutes")} options={[["15", "15 min"], ["30", "30 min"], ["60", "1 hour"], ["1440", "1 day"]]}>
              <Affixed className="cr-mini" label="Bidding lasts, in minutes" numeric inputMode="numeric" suffix="min" value={form.biddingMinutes} onChange={set("biddingMinutes")} invalid={Boolean(errors.biddingMinutes)} describedBy={errors.biddingMinutes ? "cr-bidding-note" : undefined} />
            </Chips>
            {errors.biddingMinutes ? <p id="cr-bidding-note" className="cr-error cr-row-note" role="alert"><Icon name="alert" size={16} className="mt-0.5" />{plain(errors.biddingMinutes)}</p> : null}
          </div>
          <div className="cr-row">
            <span className="cr-label">Bidding opens</span>
            <Chips label="Bidding opens" value={form.startMinutes} onPick={set("startMinutes")} options={[["0", "Right away"], ["5", "In 5 min"], ["60", "In 1 hour"]]}>
              <Affixed className="cr-mini" label="Bidding opens in, minutes" numeric inputMode="numeric" suffix="min" value={form.startMinutes} onChange={set("startMinutes")} invalid={Boolean(errors.startMinutes)} describedBy={errors.startMinutes ? "cr-start-note" : undefined} />
            </Chips>
            {errors.startMinutes ? <p id="cr-start-note" className="cr-error cr-row-note" role="alert"><Icon name="alert" size={16} className="mt-0.5" />{plain(errors.startMinutes)}</p> : null}
          </div>
        </div>
      </Section>

      <details className="fold cr-fold" ref={advancedRef}>
        <summary className="font-bold text-paper hover:text-cyan"><span>Advanced settings</span><Icon name="chevron-down" size={20} className="chev text-cyan" /></summary>
        <div className="grid gap-5 pt-3">
          <div className="cr-grid2">
            <Field id="cr-maxbids" label="Most bids allowed" numeric inputMode="numeric" value={form.maxBids} onChange={set("maxBids")} error={plain(errors.maxBids)} hint="Up to 65,535." />
            <Field id="cr-gap" label="Refund deadline" numeric inputMode="numeric" suffix="min" value={form.cancelGapMinutes} onChange={set("cancelGapMinutes")} error={plain(errors.cancelGapMinutes)}
              hint={`If bids can't unlock within ${minutesWords(form.cancelGapMinutes)} of closing, anyone can refund everyone.`} />
          </div>
          <div className="cr-grid2">
            <div className="cr-field">
              <label htmlFor="cr-quote" className="cr-label">Paid in</label>
              <select id="cr-quote" className="field" value={quote} onChange={(event) => setQuote(event.target.value as Address)}>
                {network.quoteTokens.map((address, index) => <option key={address} value={address}>{quoteMetas?.[index]?.symbol ?? address}</option>)}
              </select>
              {errors.quoteToken ? <p className="cr-error" role="alert"><Icon name="alert" size={16} className="mt-0.5" />{plain(errors.quoteToken)}</p> : <p className="cr-hint">Only listed tokens: one the creator controls could block refunds.</p>}
            </div>
            <div className="cr-field">
              <span className="cr-label">Sold in steps of</span>
              <p className="cr-static"><b className="num">1</b> {symbol}</p>
              <p className="cr-hint">Bidders ask for whole tokens.</p>
            </div>
          </div>
        </div>
      </details>
    </>
  );

  const tradeStep = (
    <>
      <label className="cr-switch-card cr-cut" data-on={form.seed}>
        <span className="cr-switch">
          <input type="checkbox" checked={form.seed} onChange={(event) => setForm({ ...form, seed: event.target.checked })} />
          <span className="track" aria-hidden="true" />
          <span className="knob" aria-hidden="true" />
        </span>
        <span>
          <b>Start trading on Kuru after the sale</b>
          <small>Trading opens at the final price, so nobody buys the top and dumps at listing.</small>
        </span>
      </label>
      {form.seed ? (
        <>
          <div className="cr-grid3">
            <Field id="cr-seed" label="List up to" numeric inputMode="numeric" suffix={symbol} value={form.seedTokens} onChange={set("seedTokens")} error={plain(errors.seedTokens)}
              hint={seedShare !== null ? `${seedShare}% of the sale. Only unsold tokens go.` : "Only unsold tokens go."} />
            <Field id="cr-share" label="Add money raised" numeric inputMode="decimal" suffix="%" value={form.seedQuotePercent} onChange={set("seedQuotePercent")} error={plain(errors.seedQuotePercent)} hint="A slice of what bidders pay." />
            <Field id="cr-lock" label="Locked for" numeric inputMode="numeric" suffix="days" value={form.lockDays} onChange={set("lockDays")} error={plain(errors.lockDays)} hint="You can't pull the market out before then." />
          </div>
          <div className="cr-say">
            <Icon name="arrow-up-right" size={22} className="text-green" />
            <p className="m-0">
              Kuru gets up to <b className="num">{group(form.seedTokens)} {symbol}</b> and <b className="num">{form.seedQuotePercent.trim() || "0"}%</b> of the money raised, locked <b className="num">{daysWords(form.lockDays)}</b>.
            </p>
          </div>
          {network.onlyKuruCreatesMarkets ? (
            <div className="cr-say">
              <Icon name="alert" size={22} className="text-yellow" />
              <p className="m-0">
                On mainnet Kuru lists markets itself. Ask Kuru to list {symbol}/{qs || "the payment token"} with these settings before the sale ends; if no market exists by the end of the lock, the reserved tokens and money go back to you.
              </p>
            </div>
          ) : null}
        </>
      ) : (
        <div className="cr-say">
          <Icon name="flag" size={22} className="text-muted" />
          <p className="m-0">No market. The launch ends when everyone collects.</p>
        </div>
      )}
      {form.seed && errors.kuru ? (
        <div className="cr-kuru-problem">
          <p className="cr-error m-0" role="alert"><Icon name="alert" size={16} className="mt-0.5" />{plain(errors.kuru)}</p>
          <SecondaryButton icon="chevron-left" onClick={() => go(2)}>Change the prices</SecondaryButton>
        </div>
      ) : null}
    </>
  );

  /* ---------- the one action ---------- */

  let action: ReactNode;
  if (step < 3) {
    action = (
      <PrimaryButton tone="cyan" className="w-full" onClick={next} id={`create-next-${step}`}>
        Next: {step === 1 ? "the sale" : "trading"} <Icon name="chevron-right" size={22} className="cr-chev" />
      </PrimaryButton>
    );
  } else if (!account) {
    action = <PrimaryButton icon="fingerprint" className="w-full" onClick={() => setSigningIn(true)} id="create-signin">Sign in to launch</PrimaryButton>;
  } else {
    action = (
      // While busy the button stays yellow and shows progress; clicks are ignored rather than disabled (spec 5.1).
      <PrimaryButton icon={busy ? undefined : "flag"} className={`w-full ${busy ? "cr-busy" : ""}`} id="create-launch" disabled={busy === null && attempted && !valid}
        onClick={() => { if (busy === null) (valid ? void launch() : setAttempted(true)); }}>
        {busy ? <><span className="cr-stripes" aria-hidden="true" />{progress || "Getting your wallet ready…"}</> : "Launch it"}
      </PrimaryButton>
    );
  }

  return (
    <div className="cr mx-auto max-w-[1360px] px-8 pb-24 max-sm:px-4">
      <div className="cr-layout">
        <div className="min-w-0" ref={formRef}>
          <Stepper step={step} onGo={(target) => busy === null && go(target)} />
          <header className="rise mt-7" key={`head-${step}`}>
            <p className="label m-0 !text-cyan">Create a launch · step {step} of 3</p>
            <h1 className="cr-title">{title}</h1>
            <p className="cr-sub">{sub}</p>
          </header>
          <Panel large className="cr-panel rise d1" key={`step-${step}`}>
            {step === 1 ? tokenStep : step === 2 ? saleStep : tradeStep}
          </Panel>
        </div>

        <aside className="cr-side" aria-label="Your launch, live preview">
          <div className="cr-card-wrap">
            <Hush pose={hushPose} size={104} className={`cr-card-hush ${hushPose === "idle" ? "bob" : ""}`} />
            <Panel large accent className="cr-card">
              <p className="label m-0">Live preview</p>
              <div className="cr-card-head">
                <TokenArt address={saleAddress ?? (token.symbol || token.name || "new-token")} size={64} />
                <div className="min-w-0">
                  <div className="cr-card-name truncate">{tokenName}</div>
                  <div className="num text-[17px] font-bold text-cyan">${symbol}</div>
                </div>
              </div>
              <Receipt title="Your launch" aside={ladder ? `${ladder.length} price option${ladder.length === 1 ? "" : "s"}` : undefined} className="cr-receipt">
                <ReceiptRow icon="coin" tone="cyan" label="For sale" value={tokensForSale !== null ? `${tokensForSale.toLocaleString("en-US")} ${symbol}` : "–"} />
                <ReceiptRow icon="dollar" tone="yellow" label="Prices" value={rangeText} />
                <ReceiptRow icon="lock" tone="green" label="Bid money" value={deposit && qd !== undefined ? moneyText(deposit, qd, qs) : "–"} />
                <ReceiptRow icon="clock" tone="violet" label="Bidding" value={minutesWords(form.biddingMinutes)} />
                <ReceiptRow icon="arrow-up-right" tone="paper" label="Trading on Kuru" value={form.seed ? `On, ${daysWords(form.lockDays)} lock` : "Off"} />
              </Receipt>
              <p className="cr-raise">
                {raise !== null && highest !== undefined && qd !== undefined
                  ? <>If every token sells at <b>{priceText(highest, qd, qs)}</b>, you raise <b>{moneyText(raise, qd, qs, true)}</b>. Bidding opens {opensWords(form.startMinutes)}.</>
                  : <>Bidding opens {opensWords(form.startMinutes)}.</>}
              </p>
              <div aria-busy={busy !== null} className={`cr-actions ${step > 1 ? "has-back" : ""}`}>
                {step > 1 ? <SecondaryButton icon="chevron-left" onClick={() => go((step - 1) as Step)} disabled={busy !== null}>Back</SecondaryButton> : null}
                {action}
              </div>
              {tried.has(step) && !okAt[step] && step < 3 ? <p className="cr-error" role="alert"><Icon name="alert" size={16} className="mt-0.5" />Fix the fields marked in coral to go on.</p> : null}
              {step === 3 && attempted && !valid ? (
                <div className="cr-error flex-wrap" role="alert">
                  <Icon name="alert" size={16} className="mt-0.5" />
                  <span className="flex-1">Fix the fields marked in coral first.</span>
                  {firstBad !== null && firstBad < 3 ? <button type="button" className="cr-textlink" onClick={() => go(firstBad)}>Go to step {firstBad}</button> : null}
                </div>
              ) : null}
              {step === 3 ? <p className="cr-note">{steps} Stopped halfway? Press it again to carry on.</p> : null}
              {step < 3 ? <p className="cr-note">Nothing is sent until you press Launch it in step 3.</p> : null}
            </Panel>
          </div>
        </aside>
      </div>

      {signingIn ? <WalletPicker onClose={closeSignIn} title="Sign in to launch" /> : null}
      {launched !== null ? <Launched name={tokenName} symbol={symbol} opens={opensInWords(form.startMinutes)} onDone={finish} /> : null}
    </div>
  );
}
