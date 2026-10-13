import { useState, type ReactNode } from "react";
import { priceAt, type Auction, type Bid } from "../auction";
import { allocate, demandByStep, findClearingStep } from "../clearing";
import { auctionAddress, monadTestnet } from "../config";
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
  ["01", "Seal your bid", "Pick the most you will pay and how many tokens you want. Only a scrambled commitment goes on chain, with a fixed deposit."],
  ["02", "Bidding closes", "The window ends for everyone at once. Sending first earns nothing, so there is no race."],
  ["03", "Reveal and settle", "Bidders reveal. The contract finds the highest price where demand covers the supply."],
  ["04", "Claim", "Winners claim tokens at that one price. Unused deposit comes back. The team collects proceeds."],
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
  const demand = demandByStep(bids, SIM_STEPS);
  const clearing = findClearingStep(demand, supply);
  const fills = allocate(bids, demand, supply, clearing);
  const price = SIM_MIN + clearing * SIM_STEP;
  const sold = fills.reduce((sum, fill) => sum + fill, 0);

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
                    <span className={`font-mono text-xs ${fills[index] > 0 ? "text-teal" : "text-lilac"}`}>
                      {fills[index] > 0 ? `gets ${fills[index]}, pays ${fills[index] * price}` : "not filled"}
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
              {demand[0] < supply
                ? "Demand is below the supply, so every bid fills at the lowest price."
                : "Bids above the price fill fully. Bids exactly at the price share what is left."}
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
  ["Bids before close", "Visible in the mempool", "Scrambled commitments"],
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
  const facts: [string, ReactNode][] = [
    ["Network", `${monadTestnet.name}, chain ${monadTestnet.id}`],
    ["Gas token", "MON, from the faucet"],
    ["Bid tokens", "Test tokens mint from this page"],
  ];
  return (
    <section className="mt-24">
      <Reveal>
        <SectionHeading eyebrow="Built on Monad" title="Every step is a real transaction." copy="Commit, reveal, settle and claim all run on the deployed contract. Anyone can check them on the explorer." />
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
            <div className="mt-1 flex items-center justify-between gap-2">
              <a className="break-all font-mono text-sm text-amber" href={`https://testnet.monadscan.com/address/${auctionAddress}`} target="_blank" rel="noreferrer">
                {auctionAddress.slice(0, 10)}…{auctionAddress.slice(-6)}
              </a>
              <CopyButton value={auctionAddress} />
            </div>
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
              <p className="mt-3 text-mist">Set the supply, the lowest price and the close time. The contract handles the rest.</p>
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
  ["Can anyone see my bid before bidding closes?", "No. Only a hash of your price, quantity and a secret salt is stored on chain. The salt comes from a free signature by your wallet, so only you can recreate it, and it stays private until you reveal."],
  ["What if I forget to reveal?", "An unrevealed bid is not filled. Your deposit is not lost: after settlement you can claim it back."],
  ["Why does everyone pay the same price?", "The contract finds the highest price where total demand covers the supply. Every winner pays that price, even if they bid higher."],
  ["What happens if the auction is cancelled?", "If nobody settles before the cancel time, anyone can cancel. Every bidder can then claim the full deposit back."],
  ["How do deposits and refunds work?", "Every bidder locks the same fixed deposit. After settlement you get your tokens plus the deposit minus what you paid. If you won nothing, the whole deposit comes back."],
  ["What are the timeouts?", "Three deadlines: bidding closes, then a reveal window, then a settle window. If nobody settles by the last one, the auction can be cancelled and every deposit refunded."],
  ["Are there any fees?", "The contract takes no fee. You only pay gas in MON for your own transactions."],
  ["Do I need real money?", "No. This runs on Monad testnet. Get MON from the faucet for gas. The bid tokens are test tokens the page mints for you."],
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

export function auctionPhase(auction: Auction, now: number): number {
  if (auction.status === 2) return 3;
  if (now < auction.commitDeadline) return 0;
  if (now < auction.revealDeadline) return 1;
  return 2;
}

export function AuctionChart({ auction, bids }: { auction: Auction; bids: Bid[] }) {
  const prices = Array.from({ length: auction.stepCount }, (_, step) => priceAt(auction, step).toString());
  const counted = bids
    .filter((bid) => bid.revealed && bid.counted)
    .map((bid) => ({ step: bid.priceStep, quantity: Number(bid.quantity) }));
  const demand = demandByStep(counted, auction.stepCount);
  const supply = Number(auction.supply);
  const clearingIndex = auction.status === 2
    ? auction.clearingStep
    : counted.length > 0 ? findClearingStep(demand, supply) : null;
  return (
    <StepChart
      prices={prices}
      demand={demand}
      supply={supply}
      clearingIndex={clearingIndex}
      priceLabel={auction.status === 2 ? "One price" : "If settled now"}
      empty="The curve appears when bids are revealed."
    />
  );
}

export function PhaseTimeline({ phase }: { phase: number }) {
  const labels = ["Bidding", "Reveal", "Settle", "Claim"];
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="Auction phase">
      {labels.map((label, index) => (
        <li key={label} className="min-w-0">
          <div className={`h-1.5 rounded-full transition-colors ${index < phase ? "bg-teal" : index === phase ? "bg-amber" : "bg-white/10"}`} />
          <div className={`mt-2 truncate text-xs ${index === phase ? "font-semibold text-amber" : index < phase ? "text-teal" : "text-lilac"}`}>
            {label}
            {index === phase ? <span className="sr-only"> (current)</span> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}