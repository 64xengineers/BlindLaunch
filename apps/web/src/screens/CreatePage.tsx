import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAddress, isAddress, type Address } from "viem";
import { useSession } from "../auth/session";
import { publicClient, reads } from "../chain/clients";
import { network } from "../chain/config";
import { defaultForm, planAuction, toCreateParams, type CreateErrors, type CreateForm } from "../chain/create";
import { formatAmount, parseAmount } from "../chain/format";
import type { TokenMeta } from "../chain/model";
import { GlassCard, PrimaryButton } from "../components/ui";
import { createAuction, createToken, ensureAllowance } from "../state/actions";
import { usePolling, useRunner } from "../state/hooks";
import { NotFound } from "./NotFound";

type Mode = "new" | "existing";
type NewToken = { name: string; symbol: string; decimals: string; totalSupply: string };

export function CreatePage() {
  if (!reads || !network.deployment) return <NotFound message={`Blindlaunch is not deployed on ${network.label} yet.`} />;
  return <CreateScreen />;
}

function Input({ label, value, onChange, error, hint, inputMode }: { label: string; value: string; onChange: (value: string) => void; error?: string | undefined; hint?: string; inputMode?: "numeric" | "decimal" | "text" }) {
  return (
    <label className="grid content-start gap-1.5 text-sm text-mist">
      {label}
      <input className={`field ${error ? "border-amber" : ""}`} inputMode={inputMode} value={value} onChange={(event) => onChange(event.target.value)} />
      {error ? <span className="text-xs text-amber" role="alert">{error}</span> : hint ? <span className="text-xs text-lilac">{hint}</span> : null}
    </label>
  );
}

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
  const [step, setStep] = useState<string>("");
  const [attempted, setAttempted] = useState(false);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const touch = (key: string) => setTouched((current) => (current.has(key) ? current : new Set(current).add(key)));
  /** Errors appear once a field has been edited or a launch was attempted, never on a fresh form. */
  const shown = (key: string, error: string | undefined) => (attempted || touched.has(key) ? error : undefined);

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
    if (!token.name.trim() || token.name.length > 64) tokenErrors.name = "1 to 64 characters.";
    if (!token.symbol.trim() || token.symbol.length > 16) tokenErrors.symbol = "1 to 16 characters.";
    if (!Number.isInteger(newDecimals) || newDecimals > 36) tokenErrors.decimals = "0 to 36.";
    const total = Number.isInteger(newDecimals) ? parseAmount(token.totalSupply, newDecimals) : null;
    if (total === null || total === 0n) tokenErrors.totalSupply = "Enter the total supply to mint to your wallet.";
    else if (/^\d+$/.test(form.supplyTokens) && total < BigInt(form.supplyTokens) * 10n ** BigInt(newDecimals)) tokenErrors.totalSupply = "Mint at least as many as you sell.";
  }
  if (mode === "existing" && !existingAddress) tokenErrors.existing = "Paste the token's contract address.";
  if (mode === "existing" && existingAddress && saleError) tokenErrors.existing = "That address is not an ERC-20 token on this network.";

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
  const ready = account !== null && busy === null;
  const set = (key: keyof CreateForm) => (value: string) => {
    touch(key);
    setForm((current) => ({ ...current, [key]: value }));
  };

  async function launch() {
    setAttempted(true);
    if (!plan || !quoteMeta) return;
    const id = await run("Launch", async (w) => {
      let sale = saleAddress;
      if (!sale) {
        setStep("Creating your token…");
        const decimals = Number(token.decimals);
        sale = await createToken(w, { name: token.name.trim(), symbol: token.symbol.trim(), decimals, supply: parseAmount(token.totalSupply, decimals)! });
        setCreatedToken(sale);
      }
      setStep("Approving the exact supply…");
      await ensureAllowance(w, sale, plan.supply);
      setStep("Creating the auction…");
      const chainTime = (await publicClient.getBlock()).timestamp;
      return createAuction(w, toCreateParams(plan, sale, quote, chainTime));
    }, "Auction created.");
    setStep("");
    if (id !== undefined) navigate(`/auction/${id}`);
  }

  const prices = plan ? Array.from({ length: plan.stepCount }, (_, index) => plan.minPrice + BigInt(index) * plan.stepSize) : [];
  const symbol = mode === "new" ? token.symbol || "TOKEN" : saleInfo?.meta.symbol ?? "TOKEN";

  return (
    <div className="mx-auto max-w-6xl px-4 pb-20">
      <h1 className="text-5xl font-bold leading-[0.95] tracking-[-0.04em]">Launch a token at one fair price.</h1>
      <p className="mt-4 max-w-2xl text-lg text-mist">Set the supply, a price ladder and a window. Bids are sealed, open themselves after the deadline, and everyone who wins pays the same price. Optionally the token starts trading on Kuru at that price.</p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
        <div className="grid gap-6">
          <GlassCard>
            <h2 className="text-lg font-bold">1. Token</h2>
            <div className="mt-3 flex rounded-full border border-white/15 bg-white/5 p-1 text-sm" role="tablist">
              {(["new", "existing"] as Mode[]).map((value) => (
                <button key={value} type="button" role="tab" aria-selected={mode === value} disabled={createdToken !== null}
                  className={`min-h-9 flex-1 rounded-full px-4 transition-colors ${mode === value ? "bg-amber font-semibold text-ink" : "text-mist hover:text-paper"}`}
                  onClick={() => setMode(value)}>
                  {value === "new" ? "Create a new token" : "Use a token I hold"}
                </button>
              ))}
            </div>
            {mode === "new" ? (
              createdToken ? (
                <p className="mt-4 text-sm text-teal">Token created at <span className="font-mono">{createdToken}</span>. Continue below.</p>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Input label="Name" value={token.name} onChange={(name) => { touch("name"); setToken({ ...token, name }); }} error={shown("name", tokenErrors.name)} />
                  <Input label="Symbol" value={token.symbol} onChange={(value) => { touch("symbol"); setToken({ ...token, symbol: value.toUpperCase() }); }} error={shown("symbol", tokenErrors.symbol)} />
                  <Input label="Decimals" inputMode="numeric" value={token.decimals} onChange={(decimals) => { touch("decimals"); setToken({ ...token, decimals }); }} error={shown("decimals", tokenErrors.decimals)} />
                  <Input label="Total supply minted to you" inputMode="decimal" value={token.totalSupply} onChange={(totalSupply) => { touch("totalSupply"); setToken({ ...token, totalSupply }); }} error={tokenErrors.totalSupply} />
                </div>
              )
            ) : (
              <div className="mt-4 grid gap-2">
                <Input label="Token contract address" value={existing} onChange={(value) => { touch("existing"); setExisting(value); }} error={shown("existing", tokenErrors.existing)} />
                {saleInfo ? <p className="text-sm text-teal">{saleInfo.meta.name} ({saleInfo.meta.symbol}), {saleInfo.meta.decimals} decimals. You hold {saleInfo.balance !== undefined ? formatAmount(saleInfo.balance, saleInfo.meta.decimals) : "…"}.</p> : null}
                {errors.balance ? <p className="text-xs text-amber" role="alert">{errors.balance}</p> : null}
                {errors.saleToken ? <p className="text-xs text-amber" role="alert">{errors.saleToken}</p> : null}
              </div>
            )}
          </GlassCard>

          <GlassCard>
            <h2 className="text-lg font-bold">2. Sale and price ladder</h2>
            <label className="mt-4 grid gap-1.5 text-sm text-mist">
              Payment token
              <select className="field" value={quote} onChange={(event) => setQuote(event.target.value as Address)}>
                {network.quoteTokens.map((address, index) => <option key={address} value={address}>{quoteMetas?.[index]?.symbol ?? address}</option>)}
              </select>
              <span className="text-xs text-lilac">Only listed payment tokens: one the creator controls could withhold refunds.</span>
            </label>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Input label={`Tokens for sale (${symbol})`} inputMode="numeric" value={form.supplyTokens} onChange={set("supplyTokens")} error={errors.supplyTokens} />
              <Input label={`Lowest price (${quoteMeta?.symbol ?? ""} per token)`} inputMode="decimal" value={form.floorPrice} onChange={set("floorPrice")} error={errors.floorPrice} />
              <Input label="Price step" inputMode="decimal" value={form.stepPrice} onChange={set("stepPrice")} error={errors.stepPrice} />
              <Input label="Price levels" inputMode="numeric" value={form.stepCount} onChange={set("stepCount")} error={errors.stepCount} />
              <Input label={`Deposit per bidder (${quoteMeta?.symbol ?? ""})`} inputMode="decimal" value={form.deposit} onChange={set("deposit")} error={errors.deposit} hint="Every bidder locks the same amount; it caps one bid's spend." />
              <Input label="Most bids" inputMode="numeric" value={form.maxBids} onChange={set("maxBids")} error={errors.maxBids} />
            </div>
          </GlassCard>

          <GlassCard>
            <h2 className="text-lg font-bold">3. Timing</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Input label="Start in (minutes)" inputMode="numeric" value={form.startMinutes} onChange={set("startMinutes")} error={errors.startMinutes} />
              <Input label="Bidding lasts (minutes)" inputMode="numeric" value={form.biddingMinutes} onChange={set("biddingMinutes")} error={errors.biddingMinutes} />
              <Input label="Keeper window (minutes)" inputMode="numeric" value={form.cancelGapMinutes} onChange={set("cancelGapMinutes")} error={errors.cancelGapMinutes} hint="If keys are not out by then, everyone is refunded." />
            </div>
          </GlassCard>

          <GlassCard>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold">4. Open a market at the price</h2>
              <label className="flex items-center gap-2 text-sm text-mist">
                <input type="checkbox" checked={form.seed} onChange={(event) => setForm({ ...form, seed: event.target.checked })} /> Kuru
              </label>
            </div>
            {form.seed ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Input label="Unsold tokens to list" inputMode="numeric" value={form.seedTokens} onChange={set("seedTokens")} error={errors.seedTokens} />
                <Input label="Share of proceeds (%)" inputMode="decimal" value={form.seedQuotePercent} onChange={set("seedQuotePercent")} error={errors.seedQuotePercent} />
                <Input label="Locked for (days)" inputMode="numeric" value={form.lockDays} onChange={set("lockDays")} error={errors.lockDays} />
              </div>
            ) : <p className="mt-2 text-sm text-lilac">The auction ends at the claims. No market is opened.</p>}
            {errors.kuru ? <p className="mt-2 text-xs text-amber" role="alert">{errors.kuru}</p> : null}
          </GlassCard>
        </div>

        <GlassCard className="lg:sticky lg:top-28">
          <h2 className="text-lg font-bold">Preview</h2>
          {plan && quoteMeta ? (
            <dl className="mt-4 grid gap-2 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-lilac">Selling</dt><dd className="font-mono text-paper">{form.supplyTokens} {symbol}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-lilac">Ladder</dt><dd className="text-right font-mono text-paper">{prices.map((price) => formatAmount(price, quoteMeta.decimals, 6)).join(" · ")} {quoteMeta.symbol}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-lilac">Deposit</dt><dd className="font-mono text-paper">{formatAmount(plan.deposit, quoteMeta.decimals)} {quoteMeta.symbol}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-lilac">Bidding</dt><dd className="text-paper">{form.biddingMinutes} min, starting {form.startMinutes === "0" ? "about 30 s after creation" : `in ${form.startMinutes} min`}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-lilac">Kuru tick</dt><dd className="font-mono text-paper">{plan.kuru ? `${formatAmount(BigInt(plan.kuru.tickSize) * 10n ** BigInt(quoteMeta.decimals) / BigInt(plan.kuru.pricePrecision), quoteMeta.decimals, 9)} ${quoteMeta.symbol}` : "no market"}</dd></div>
            </dl>
          ) : <p className="mt-3 text-sm text-lilac">Fill in the form to see what the contract will receive.</p>}
          {errors.quoteToken ? <p className="mt-3 text-xs text-amber" role="alert">{errors.quoteToken}</p> : null}
          {attempted && !valid ? <p className="mt-3 text-xs text-amber" role="alert">Fix the highlighted fields first.</p> : null}
          <div className="mt-5">
            <PrimaryButton disabled={!ready || (attempted && !valid)} onClick={() => (valid ? void launch() : setAttempted(true))}>
              {busy ? step || "Working…" : account ? (createdToken || mode === "existing" ? "Approve and create the auction" : "Create token and auction") : "Connect to create"}
            </PrimaryButton>
          </div>
          <p className="mt-3 text-xs text-lilac">
            {mode === "new" && !createdToken ? "Three wallet steps: create the token, approve the exact supply, create the auction." : "Two wallet steps: approve the exact supply, create the auction."} If you reject one, press again to continue where you stopped.
          </p>
        </GlassCard>
      </div>
    </div>
  );
}
