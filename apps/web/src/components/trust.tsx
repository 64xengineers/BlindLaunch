import { allocationOf, settleOutcome, withPrefixes } from "@blindlaunch/sealed-bid";
import { useEffect, useRef, useState } from "react";
import { SectionHeading } from "./sections";
import { GlassCard, Reveal } from "./ui";

type Racer = { name: string; bot?: boolean; arrive: number; want: number; maxPrice: number };

const RACE_SUPPLY = 1000;
const CLOSE_AT = 3.6;
const END_AT = 4.6;
const racers: Racer[] = [
  { name: "Bot", bot: true, arrive: 0.05, want: 600, maxPrice: 60 },
  { name: "Cara", arrive: 1.0, want: 250, maxPrice: 80 },
  { name: "Dan", arrive: 1.7, want: 150, maxPrice: 90 },
  { name: "Alice", arrive: 2.3, want: 200, maxPrice: 70 },
  { name: "Bob", arrive: 3.0, want: 300, maxPrice: 60 },
];

function openLaunch() {
  let sold = 0;
  return racers.map((racer) => {
    let got = 0;
    let paid = 0;
    while (got < racer.want && sold < RACE_SUPPLY) {
      const price = 50 + 10 * Math.floor(sold / 200);
      if (!racer.bot && price > racer.maxPrice) break;
      got += 1;
      sold += 1;
      paid += price;
    }
    return { got, paid };
  });
}

function blindLaunch() {
  const bids = withPrefixes(racers.map((racer) => ({ counted: true, step: (racer.maxPrice - 50) / 10, quantity: BigInt(racer.want) })));
  const perStep = Array.from({ length: 6 }, () => 0n);
  for (const bid of bids) perStep[bid.step] = (perStep[bid.step] ?? 0n) + bid.quantity;
  const outcome = settleOutcome(perStep, BigInt(RACE_SUPPLY), { minPrice: 50n, stepSize: 10n, stepCount: 6 });
  const price = Number(outcome.clearingPrice);
  return { price, results: bids.map((bid) => { const got = Number(allocationOf(bid, outcome)); return { got, paid: got * price }; }) };
}

const openResults = openLaunch();
const blind = blindLaunch();

function share(results: { got: number }[]) {
  return Math.round(((results[0]?.got ?? 0) / RACE_SUPPLY) * 100);
}

function peopleAverage(results: { got: number; paid: number }[]) {
  const people = results.slice(1);
  const got = people.reduce((sum, row) => sum + row.got, 0);
  const paid = people.reduce((sum, row) => sum + row.paid, 0);
  return got === 0 ? 0 : Math.round(paid / got);
}

export function BotRaceDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const [time, setTime] = useState(0);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setRunning(true);
        observer.disconnect();
      }
    }, { threshold: 0.35 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      setTime((value) => {
        if (value >= END_AT) {
          setRunning(false);
          return END_AT;
        }
        return Math.round((value + 0.1) * 10) / 10;
      });
    }, 100);
    return () => window.clearInterval(timer);
  }, [running]);

  const closed = time >= CLOSE_AT;

  return (
    <section className="mt-24" ref={ref}>
      <Reveal>
        <SectionHeading
          eyebrow="The proof"
          title="Same buyers. Same bot. Two launches."
          copy="An example with 1,000 tokens and five buyers. The bot sends its order first. Watch what that buys it in each launch."
        />
      </Reveal>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn-primary min-h-11 px-5 text-sm"
          onClick={() => { setTime(0); setRunning(true); }}
        >
          <span className="relative z-10">{time === 0 && !running ? "Run the launch" : "Replay"}</span>
        </button>
        <div className="h-2 min-w-40 flex-1 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
          <div className="h-full rounded-full bg-gradient-to-r from-lavender to-amber" style={{ width: `${(Math.min(time, END_AT) / END_AT) * 100}%` }} />
        </div>
        <span className="font-mono text-xs text-lilac" aria-live="polite">{closed ? "Window closed" : `t = ${time.toFixed(1)}s`}</span>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <GlassCard>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-lg font-bold">Open launch</h3>
            <span className="text-xs text-lilac">First come, price rises as it sells</span>
          </div>
          <ul className="mt-4 grid gap-3">
            {racers.map((racer, index) => {
              const arrived = time >= racer.arrive;
              const result = openResults[index]!;
              return (
                <li key={racer.name} className={`transition-opacity duration-300 ${arrived ? "opacity-100" : "opacity-30"}`}>
                  <div className="flex justify-between text-sm">
                    <span className={racer.bot ? "font-bold text-amber" : "text-paper"}>{racer.bot ? "⚡ Bot" : racer.name}</span>
                    <span className="font-mono text-xs text-mist">
                      {arrived ? (result.got > 0 ? `${result.got} tokens · avg ${Math.round(result.paid / result.got)}` : `priced out above ${racer.maxPrice}`) : "waiting"}
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10">
                    <div className={`h-full rounded-full transition-all duration-500 ${racer.bot ? "bg-amber" : "bg-lavender"}`} style={{ width: arrived ? `${(result.got / RACE_SUPPLY) * 100}%` : "0%" }} />
                  </div>
                </li>
              );
            })}
          </ul>
          <dl className={`mt-5 grid grid-cols-2 gap-3 border-t border-white/10 pt-4 transition-opacity ${closed ? "opacity-100" : "opacity-40"}`}>
            <div><dt className="text-xs text-lilac">Bot share of supply</dt><dd className="text-2xl font-bold text-amber">{share(openResults)}%</dd></div>
            <div><dt className="text-xs text-lilac">Avg price people paid</dt><dd className="text-2xl font-bold text-paper">{peopleAverage(openResults)}</dd></div>
          </dl>
        </GlassCard>

        <GlassCard>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-lg font-bold">Blindlaunch</h3>
            <span className="text-xs text-teal">Sealed bids, one price</span>
          </div>
          <ul className="mt-4 grid gap-3">
            {racers.map((racer, index) => {
              const arrived = time >= racer.arrive;
              const result = blind.results[index]!;
              return (
                <li key={racer.name} className={`transition-opacity duration-300 ${arrived ? "opacity-100" : "opacity-30"}`}>
                  <div className="flex justify-between text-sm">
                    <span className={racer.bot ? "font-bold text-amber" : "text-paper"}>{racer.bot ? "⚡ Bot" : racer.name}</span>
                    <span className="font-mono text-xs text-mist">
                      {!arrived ? "waiting" : !closed ? "🔒 sealed" : result.got > 0 ? `${result.got} tokens · pays ${blind.price}` : `bid ${racer.maxPrice}, below price`}
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10">
                    {arrived && !closed ? <div className="shimmer h-full w-full" /> : null}
                    {closed ? <div className={`h-full rounded-full transition-all duration-700 ${racer.bot ? "bg-amber" : "bg-teal"}`} style={{ width: `${(result.got / RACE_SUPPLY) * 100}%` }} /> : null}
                  </div>
                </li>
              );
            })}
          </ul>
          <dl className={`mt-5 grid grid-cols-2 gap-3 border-t border-white/10 pt-4 transition-opacity ${closed ? "opacity-100" : "opacity-40"}`}>
            <div><dt className="text-xs text-lilac">Bot share of supply</dt><dd className="text-2xl font-bold text-teal">{share(blind.results)}%</dd></div>
            <div><dt className="text-xs text-lilac">Price everyone paid</dt><dd className="text-2xl font-bold text-paper">{blind.price}</dd></div>
          </dl>
        </GlassCard>
      </div>
      <p className="mt-4 text-sm text-lilac">
        Illustration with made-up buyers. In the open launch the bot lands first and buys while the price is low. In Blindlaunch arriving first changes nothing: the bot is filled only for what its sealed bid deserves, at the same price as everyone.
      </p>
    </section>
  );
}

const hidden = [
  "Your price and quantity, until two keepers publish their keys after bidding closes",
  "How much you would pay at most",
];
const visible = [
  "Your wallet address and when you bid",
  "The fixed deposit you lock, the same for everyone",
  "Your price and quantity, once the bids are opened",
  "The clearing price and every allocation",
];
const trusted = [
  "Two of the three keepers not colluding to read bids before bidding closes, and two of them publishing their keys before the refund deadline.",
  "The Blindlaunch contracts. They are open source and tested, but not audited.",
  "The token's creator, for the token itself: a token can be paused by whoever controls it. It cannot hold back your refund.",
  "Monad staying up while the bids are opened.",
];

export function PrivacySection() {
  const columns: [string, string, string[], string][] = [
    ["Hidden", "Until bidding closes", hidden, "text-teal"],
    ["Public", "Anyone can see", visible, "text-lavender"],
    ["What you trust", "Be clear-eyed about this", trusted, "text-amber"],
  ];
  return (
    <section className="mt-24">
      <Reveal>
        <SectionHeading
          eyebrow="Privacy and trust"
          title="What is hidden, what is public, what you trust."
          copy="Bids are hidden during the window, not forever, and no single keeper can read them. Here is exactly what that means."
        />
      </Reveal>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {columns.map(([title, subtitle, items, color]) => (
          <Reveal key={title}>
            <GlassCard className="lift h-full">
              <h3 className={`text-lg font-bold ${color}`}>{title}</h3>
              <p className="text-xs text-lilac">{subtitle}</p>
              <ul className="mt-4 grid gap-3 text-sm text-mist">
                {items.map((item) => (
                  <li key={item} className="flex gap-2"><span className={color} aria-hidden="true">•</span>{item}</li>
                ))}
              </ul>
            </GlassCard>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

export function RiskNotice() {
  return (
    <section className="mt-16">
      <Reveal>
        <div className="rounded-[20px] border border-amber/40 bg-amber/[0.06] p-5 sm:p-6">
          <h2 className="text-lg font-bold text-amber">Risks and disclaimer</h2>
          <ul className="mt-3 grid gap-2 text-sm text-mist sm:grid-cols-2">
            <li>The contracts are not audited. Use small amounts.</li>
            <li>Two keepers colluding could read bids before bidding closes. They cannot change, drop or add bids.</li>
            <li>Bids are hidden only until they are opened. Wallet addresses and deposits are always public.</li>
            <li>A bid that does not decrypt to its own commitment forfeits its deposit. The app checks every bid before sending it.</li>
            <li>Nothing here is financial, legal or investment advice, or an offer to sell any asset.</li>
            <li>Software can have bugs. You use it at your own risk.</li>
          </ul>
        </div>
      </Reveal>
    </section>
  );
}
