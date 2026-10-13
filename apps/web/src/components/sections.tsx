import { allocationOf, settleOutcome, withPrefixes } from "@blindlaunch/sealed-bid";
import { useState, type ReactNode } from "react";
import { explorerUrl, network } from "../chain/config";
import { CopyButton, GlassCard, Reveal, SecondaryButton, StepChart } from "./ui";

export function SectionHeading({ eyebrow, title, copy }: { eyebrow: string; title: string; copy?: string }) {
  return (
    <div className="max-w-2xl">
      <p className="text-sm font-medium text-teal">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-bold tracking-[-0.03em] sm:text-4xl">{title}</h2>
      {copy ? <p className="mt-3 text-mist">{copy}</p> : null}
    </div>
  );
}

const steps = [
  ["01", "Seal your bid", "Pick the most you will pay and how many you want. Your bid is encrypted on your device to three independent keepers and sent in one transaction with a fixed deposit."],
  ["02", "Bidding closes", "The window ends for everyone at once. Sending first earns nothing, so there is no race."],
  ["03", "Bids open themselves", "Two keepers publish their keys and the contract opens every bid on chain, then finds the highest price where demand covers the supply. You do nothing."],
  ["04", "Claim and trade", "Winners claim tokens at that one price and unused deposit comes back. The token's Kuru market opens at the same price."],
];

export function StepsSection() {
  return (
    <section className="mt-24">
      <Reveal>
        <SectionHeading eyebrow="How it works" title="Four steps, one fair price." />
      </Reveal>
      <div className="relative mt-8 grid gap-4 md:grid-cols-4">
        <div className="absolute left-0 right-0 top-9 hidden h-px bg-gradient-to-r from-transparent via-lavender/50 to-transparent md:block" aria-hidden="true" />
        {steps.map(([number, title, copy], index) => (
          <Reveal key={number}>
            <GlassCard className="lift h-full" >
              <div className="grid h-8 w-8 place-items-center rounded-full border border-amber/60 bg-ink font-mono text-xs text-amber">{number}</div>
              <h3 className="mt-4 text-lg font-bold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-mist">{copy}</p>
              <span className="sr-only">Step {index + 1} of 4</span>
            </GlassCard>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

const SIM_MIN = 50;
const SIM_STEP = 10;
const SIM_STEPS = 6;
const simPrices = Array.from({ length: SIM_STEPS }, (_, step) => String(SIM_MIN + step * SIM_STEP));

type SimBid = { id: number; step: number; quantity: number };

export function ClearingSimulator() {
  const [supply, setSupply] = useState(600);
  const [bids, setBids] = useState<SimBid[]>([
    { id: 1, step: 5, quantity: 150 },
    { id: 2, step: 3, quantity: 250 },
    { id: 3, step: 2, quantity: 300 },
    { id: 4, step: 1, quantity: 200 },
  ]);
  const opened = withPrefixes(bids.map((bid) => ({ counted: bid.quantity > 0, step: bid.step, quantity: BigInt(bid.quantity) })));
  const perStep = Array.from({ length: SIM_STEPS }, () => 0n);
  for (const bid of opened) if (bid.counted) perStep[bid.step] = (perStep[bid.step] ?? 0n) + bid.quantity;
  const outcome = settleOutcome(perStep, BigInt(supply), { minPrice: BigInt(SIM_MIN), stepSize: BigInt(SIM_STEP), stepCount: SIM_STEPS });
  const fills = opened.map((bid) => Number(allocationOf(bid, outcome)));
  const clearing = outcome.clearingStep;
  const price = Number(outcome.clearingPrice) || SIM_MIN;
  const sold = Number(outcome.totalSold);
  const demand = perStep.map((_, step) => Number(perStep.slice(step).reduce((sum, lots) => sum + lots, 0n)));

  function update(id: number, patch: Partial<SimBid>) {
    setBids((current) => current.map((bid) => (bid.id === id ? { ...bid, ...patch } : bid)));
  }

  return (
    <section className="mt-24">
      <Reveal>
        <SectionHeading
          eyebrow="Try it"
          title="See how one price is found."
          copy="Move the sliders. These are example bids in your browser only, nothing is sent on chain."
        />
      </Reveal>
      <Reveal className="mt-8">
        <div className="glass grid gap-6 p-5 sm:p-6 lg:grid-cols-[1fr_1.1fr]">
          <div className="min-w-0">
            <label className="grid gap-1 text-sm text-mist">
              <span className="flex justify-between"><span>Tokens for sale</span><span className="font-mono text-amber">{supply}</span></span>
              <input className="range" type="range" min={100} max={1200} step={50} value={supply} onChange={(event) => setSupply(Number(event.target.value))} />
            </label>
            <div className="mt-4 grid gap-3">
              {bids.map((bid, index) => (
                <div key={bid.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-semibold text-paper">Bidder {String.fromCharCode(65 + index)}</span>
                    <span className={`font-mono text-xs ${(fills[index] ?? 0) > 0 ? "text-teal" : "text-lilac"}`}>
                      {(fills[index] ?? 0) > 0 ? `gets ${fills[index]}, pays ${(fills[index] ?? 0) * price}` : "not filled"}
                    </span>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <label className="grid gap-1 text-xs text-lilac">
                      Most per token: <span className="font-mono text-paper">{simPrices[bid.step]}</span>
                      <input className="range" type="range" min={0} max={SIM_STEPS - 1} value={bid.step} onChange={(event) => update(bid.id, { step: Number(event.target.value) })} />
                    </label>
                    <label className="grid gap-1 text-xs text-lilac">
                      <span className="flex items-center justify-between gap-2">
                        Tokens wanted
                        <input
                          className="w-20 rounded-lg border border-lavender/40 bg-ink/70 px-2 py-1 text-right font-mono text-xs text-paper"
                          inputMode="numeric"
                          aria-label={`Bidder ${String.fromCharCode(65 + index)} tokens wanted`}
                          value={bid.quantity}
                          onChange={(event) => update(bid.id, { quantity: Math.min(5000, Number(event.target.value.replace(/[^\d]/g, "")) || 0) })}
                        />
                      </span>
                      <input className="range" type="range" min={0} max={500} step={10} value={Math.min(bid.quantity, 500)} onChange={(event) => update(bid.id, { quantity: Number(event.target.value) })} />
                    </label>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-secondary min-h-11 px-4 py-2 text-sm"
                disabled={bids.length >= 6}
                onClick={() => setBids((current) => [...current, { id: Date.now(), step: 2, quantity: 120 }])}
              >
                Add bidder
              </button>
              <button
                type="button"
                className="btn-secondary min-h-11 px-4 py-2 text-sm"
                disabled={bids.length <= 1}
                onClick={() => setBids((current) => current.slice(0, -1))}
              >
                Remove bidder
              </button>
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-sm text-lilac">Everyone who wins pays</div>
                <div className="text-4xl font-bold text-amber tabular-nums">{price}</div>
              </div>
              <div className="text-right text-sm text-mist">
                <div>Sold <span className="font-mono text-paper">{sold}</span> of {supply}</div>
                <div>Demand at {price}: <span className="font-mono text-paper">{demand[clearing]}</span></div>
              </div>
            </div>
            <div className="mt-4"><StepChart prices={simPrices} demand={demand} supply={supply} clearingIndex={clearing} /></div>
            <p className="mt-3 text-sm text-lilac">
              {(demand[0] ?? 0) < supply
                ? "Demand is below the supply, so every bid fills at the lowest price."
                : "Bids above the price fill fully. Bids exactly at the price share what is left, and every token is sold."}
            </p>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

const rows: [string, string, string][] = [
  ["Who gets in", "Whoever lands first", "Everyone in the window"],
  ["Price paid", "Rises with every buyer", "One price for all winners"],
  ["Bots and snipers", "Front-run the crowd", "Speed earns nothing"],
  ["Bids before close", "Visible in the mempool", "Encrypted to three keepers"],
  ["Unused money", "Spent on gas wars", "Deposit refunded"],
];

export function ComparisonSection() {
  return (
    <section className="mt-24">
      <Reveal>
        <SectionHeading eyebrow="Why sealed bids" title="Open launch vs Blindlaunch." />
      </Reveal>
      <Reveal className="mt-8">
        <div className="glass overflow-hidden">
          <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 border-b border-white/10 px-4 py-3 text-xs font-semibold text-lilac sm:px-6 sm:text-sm">
            <span />
            <span>Open launch</span>
            <span className="text-amber">Blindlaunch</span>
          </div>
          {rows.map(([label, open, blind]) => (
            <div key={label} className="grid grid-cols-[1fr_1fr_1fr] gap-2 border-b border-white/5 px-4 py-4 text-sm transition-colors last:border-0 hover:bg-white/[0.03] sm:px-6">
              <span className="font-semibold text-paper">{label}</span>
              <span className="text-mist"><span className="mr-1 text-lilac" aria-hidden="true">✕</span>{open}</span>
              <span className="text-paper"><span className="mr-1 text-teal" aria-hidden="true">✓</span>{blind}</span>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}

export function MonadSection() {
  const auction = network.deployment?.auction ?? null;
  const facts: [string, ReactNode][] = [
    ["Network", `${network.label}, chain ${network.chain.id}`],
    ["Gas token", network.faucet ? "MON, from the faucet" : "MON"],
    ["Speed", "300 ms blocks and 600 ms finality, so a one-minute auction is practical"],
  ];
  const link = auction ? explorerUrl("address", auction) : null;
  return (
    <section className="mt-24">
      <Reveal>
        <SectionHeading eyebrow="Built on Monad" title="Every step is a real transaction." copy="Bid, open, settle, market and claim all run on the deployed contracts. Anyone can check them on the explorer." />
      </Reveal>
      <div className="mt-8 grid gap-4 md:grid-cols-4">
        {facts.map(([label, value]) => (
          <Reveal key={label}>
            <GlassCard className="lift h-full">
              <div className="text-sm text-lilac">{label}</div>
              <div className="mt-2 font-semibold text-paper">{value}</div>
            </GlassCard>
          </Reveal>
        ))}
        <Reveal>
          <GlassCard className="lift h-full">
            <div className="text-sm text-lilac">Auction contract</div>
            {auction ? (
              <div className="mt-1 flex items-center justify-between gap-2">
                {link ? <a className="break-all font-mono text-sm text-amber" href={link} target="_blank" rel="noreferrer">{auction.slice(0, 10)}…{auction.slice(-6)}</a> : <span className="break-all font-mono text-sm text-amber">{auction.slice(0, 10)}…{auction.slice(-6)}</span>}
                <CopyButton value={auction} />
              </div>
            ) : <div className="mt-2 text-sm text-mist">Not deployed here yet</div>}
          </GlassCard>
        </Reveal>
      </div>
    </section>
  );
}

export function TeamsCta() {
  return (
    <section className="mt-24">
      <Reveal>
        <div className="glass spot relative overflow-hidden p-8 sm:p-12">
          <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-amber/15 blur-3xl" aria-hidden="true" />
          <div className="relative grid items-center gap-6 md:grid-cols-[1.4fr_1fr]">
            <div>
              <p className="text-sm font-medium text-teal">For teams</p>
              <h2 className="mt-2 text-3xl font-bold tracking-[-0.03em] sm:text-4xl">Launch your token at one fair price.</h2>
              <p className="mt-3 text-mist">Create your token or bring one, set a price ladder and a window. Bids open themselves, one price is found, and trading starts on Kuru at that price.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row md:justify-end">
              <SecondaryButton to="/create">Create an auction</SecondaryButton>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

const faqs = [
  ["Can anyone see my bid before bidding closes?", "No. Your bid is split into three shares, each encrypted to a different keeper, and only an encrypted bundle goes on chain. Reading it needs two keepers' keys, which they publish only after bidding closes. Two keepers working together could read bids early: that is the trust this design asks for, and keepers are run by different operators."],
  ["Do I need to come back to reveal?", "No. There is no reveal step. After the deadline the contract opens every bid itself. Come back only to claim."],
  ["Why does everyone pay the same price?", "The contract finds the highest price where total demand covers the supply. Every winner pays that price, even if they bid higher."],
  ["What if the keepers never publish?", "If two keys are not out by the refund deadline, anyone can cancel the auction and every deposit is refunded in full."],
  ["How do deposits and refunds work?", "Every bidder locks the same fixed deposit, so it reveals nothing. After settlement you get your tokens plus the deposit minus what you paid. If you won nothing, the whole deposit comes back."],
  ["What is forfeiting?", "A bid that does not decrypt to the commitment its bidder sent loses its deposit to a burn address. This only happens to bids crafted outside the app; the app proves every bid opens correctly before sending it."],
  ["What happens after the auction?", "If the team turned it on, a Kuru order book opens at the clearing price with some unsold tokens and part of the proceeds, so trading starts at the price the auction found."],
  ["Are there any fees?", "The contracts take no fee. You only pay gas in MON for your own transactions."],
];

export function FaqSection() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="mt-24">
      <Reveal>
        <SectionHeading eyebrow="Questions" title="Frequently asked." />
      </Reveal>
      <Reveal className="mt-8">
        <div className="glass divide-y divide-white/10">
          {faqs.map(([question, answer], index) => {
            const expanded = open === index;
            return (
              <div key={question}>
                <button
                  type="button"
                  className="flex min-h-14 w-full items-center justify-between gap-4 px-5 py-4 text-left font-semibold text-paper hover:text-amber sm:px-6"
                  aria-expanded={expanded}
                  onClick={() => setOpen(expanded ? null : index)}
                >
                  {question}
                  <span className={`text-xl text-lilac transition-transform duration-300 ${expanded ? "rotate-45" : ""}`} aria-hidden="true">+</span>
                </button>
                <div className={`accordion ${expanded ? "open" : ""}`}>
                  <div><p className="px-5 pb-5 text-mist sm:px-6">{answer}</p></div>
                </div>
              </div>
            );
          })}
        </div>
      </Reveal>
    </section>
  );
}
