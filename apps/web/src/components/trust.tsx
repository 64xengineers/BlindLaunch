import { useEffect, useRef, useState } from "react";
import { priceAt, readStoredBid, shortAddress, type Auction } from "../auction";
import { allocate, demandByStep, findClearingStep } from "../clearing";
import { auctionAddress, quoteTokenAddress, saleTokenAddress } from "../config";
import { SectionHeading } from "./sections";
import { GlassCard, Reveal, formatLeft } from "./ui";

const explorer = "https://testnet.monadscan.com";

export function formatDate(seconds: number) {
  return new Date(seconds * 1000).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

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
  const bids = racers.map((racer) => ({ step: (racer.maxPrice - 50) / 10, quantity: racer.want }));
  const demand = demandByStep(bids, 6);
  const clearing = findClearingStep(demand, RACE_SUPPLY);
  const price = 50 + clearing * 10;
  const fills = allocate(bids, demand, RACE_SUPPLY, clearing);
  return { price, results: fills.map((got) => ({ got, paid: got * price })) };
}

const openResults = openLaunch();
const blind = blindLaunch();

function share(results: { got: number }[]) {
  return Math.round((results[0].got / RACE_SUPPLY) * 100);
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
              const result = openResults[index];
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
              const result = blind.results[index];
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
  "Your price and quantity, until you reveal",
  "How much you would pay at most",
];
const visible = [
  "Your wallet address and when you bid",
  "The fixed deposit you lock",
  "Your price and quantity, after you reveal",
  "The clearing price and every allocation",
];
const trusted = [
  "The BlindAuction contract. It is open source and tested, but not audited.",
  "Your wallet, whose free signature recreates the secret salt you need to reveal.",
  "Monad testnet staying up through the reveal window.",
  "You, to come back and reveal before the deadline.",
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
          copy="Blindlaunch uses commit and reveal. It hides bids during the window, not forever. Here is exactly what that means."
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
            <li>This is a hackathon build running on Monad testnet. Use test tokens only.</li>
            <li>The contract is not audited. Do not send real assets to it.</li>
            <li>To reveal from another browser you need the same wallet and the number of tokens you bid. If you cannot reveal, your bid is not filled, and the deposit comes back after settlement.</li>
            <li>Bids are hidden only until reveal. Wallet addresses and deposits are always public.</li>
            <li>Nothing here is financial, legal or investment advice, or an offer to sell any asset.</li>
            <li>Software can have bugs. You use it at your own risk.</li>
          </ul>
        </div>
      </Reveal>
    </section>
  );
}

export function CostsPanel({ auction, maxSpend }: { auction?: Auction; maxSpend?: bigint }) {
  const rows: [string, string][] = [
    ["Deposit locked", auction ? `${auction.deposit.toString()} test tokens, returned minus what you pay` : "Fixed per auction, returned minus what you pay"],
    ["Most you could pay", maxSpend !== undefined ? `${maxSpend.toString()} (price × tokens)` : "Your price × your tokens, often less"],
    ["Platform fee", "None. The contract takes no fee."],
    ["Gas", "Paid in MON from the faucet: mint and approve test tokens once, then seal, reveal and claim."],
    ["If you never reveal", "Not filled. The full deposit comes back."],
  ];
  return (
    <GlassCard>
      <h2 className="text-lg font-bold">Costs, before you bid</h2>
      <dl className="mt-4 grid gap-3 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="grid gap-1 border-b border-white/5 pb-3 last:border-0 sm:grid-cols-[10rem_1fr]">
            <dt className="text-lilac">{label}</dt>
            <dd className="text-paper">{value}</dd>
          </div>
        ))}
      </dl>
    </GlassCard>
  );
}

export function VerifyPanel({ auction, account }: { auction: Auction; account: string | null }) {
  const stored = account ? readStoredBid(auction.id, account) : null;
  const links: [string, string][] = [
    ["Auction contract", `${explorer}/address/${auctionAddress}`],
    ["Sale token", `${explorer}/address/${saleTokenAddress}`],
    ["Bid token", `${explorer}/address/${quoteTokenAddress}`],
    [`Creator ${shortAddress(auction.authority)}`, `${explorer}/address/${auction.authority}`],
  ];
  if (stored?.commitTx) links.push(["Your seal transaction", `${explorer}/tx/${stored.commitTx}`]);
  if (stored?.revealTx) links.push(["Your reveal transaction", `${explorer}/tx/${stored.revealTx}`]);
  return (
    <GlassCard>
      <h2 className="text-lg font-bold">Verify on-chain</h2>
      <p className="mt-2 text-sm text-mist">
        Do not take our word for it. On the explorer, open the contract, choose Read contract, and call <span className="font-mono text-paper">getBid({auction.id.toString()}, slot)</span>. You will see the same scrambled commitments listed here.
      </p>
      <ul className="mt-4 grid gap-2">
        {links.map(([label, href]) => (
          <li key={label}>
            <a className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-white/[0.04] px-3 text-sm text-paper no-underline transition-colors hover:bg-white/[0.08] hover:text-amber" href={href} target="_blank" rel="noreferrer">
              {label}<span aria-hidden="true">↗</span>
            </a>
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}

export function StatusBar({ auction, now }: { auction: Auction; now: number }) {
  const cancelled = auction.status === 3;
  const settled = auction.status === 2;
  const stages = ["Bidding open", "Revealing", "Settling", "Settled"];
  const phase = settled ? 3 : now < auction.commitDeadline ? 0 : now < auction.revealDeadline ? 1 : 2;
  const stalled = !settled && !cancelled && now >= auction.cancelAfter;

  let message: string;
  if (cancelled) message = "Cancelled. Every bidder can claim the full deposit back.";
  else if (settled) message = auction.totalSold > 0n ? `Cleared at ${auction.clearingPrice.toString()}. Winners claim tokens and refunds.` : "Settled with no sale. Every deposit can be claimed back.";
  else if (phase === 0) message = `Bids are sealed. Bidding closes in ${formatLeft(auction.commitDeadline - now)}.`;
  else if (phase === 1) message = `Bidders reveal now. Window ends in ${formatLeft(auction.revealDeadline - now)}.`;
  else if (stalled) message = "Nobody settled in time. Anyone can cancel now, and then every deposit is refunded.";
  else message = `Anyone can settle now. If nobody does in ${formatLeft(auction.cancelAfter - now)}, the auction can be cancelled and every deposit refunded.`;

  return (
    <div className="glass sticky top-[4.5rem] z-30 sm:top-[5.5rem] mb-6 px-4 py-3" role="status" aria-live="polite">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <ol className="flex flex-wrap items-center gap-1.5" aria-label="Auction status">
          {cancelled ? (
            <li className="rounded-full bg-amber/15 px-3 py-1 text-xs font-semibold text-amber">Cancelled · refunds open</li>
          ) : stages.map((stage, index) => (
            <li
              key={stage}
              className={`rounded-full px-3 py-1 text-xs ${index === phase ? "bg-amber font-semibold text-ink" : index < phase ? "bg-teal/15 text-teal" : "bg-white/5 text-lilac"}`}
              aria-current={index === phase ? "step" : undefined}
            >
              {index < phase ? "✓ " : ""}{stage}
            </li>
          ))}
        </ol>
        <p className={`min-w-0 flex-1 text-sm ${stalled ? "text-amber" : "text-mist"}`}>{message}</p>
      </div>
    </div>
  );
}

const REMINDERS = "blindlaunch:reminders";
export type Reminder = { key: string; at: number; title: string; url: string };

export function readReminders(): Reminder[] {
  try {
    return JSON.parse(localStorage.getItem(REMINDERS) ?? "[]") as Reminder[];
  } catch {
    return [];
  }
}

export function writeReminders(list: Reminder[]) {
  localStorage.setItem(REMINDERS, JSON.stringify(list));
}

export function NotifyButton({ auction, now }: { auction: Auction; now: number }) {
  const biddingOpen = now < auction.commitDeadline;
  const at = biddingOpen ? auction.commitDeadline : auction.revealDeadline;
  const key = `${auction.id}:${at}`;
  const [set, setSet] = useState(() => readReminders().some((item) => item.key === key));
  const supported = typeof window !== "undefined" && "Notification" in window;
  if (!supported || auction.status !== 1 || now >= auction.revealDeadline) return null;

  async function toggle() {
    if (set) {
      writeReminders(readReminders().filter((item) => item.key !== key));
      setSet(false);
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;
    writeReminders([
      ...readReminders(),
      {
        key,
        at,
        title: biddingOpen ? `Auction ${auction.id} bidding closed. Time to reveal.` : `Auction ${auction.id} reveal window closed. It can be settled.`,
        url: `/auction/${auction.id}`,
      },
    ]);
    setSet(true);
  }

  return (
    <button
      type="button"
      className={`min-h-11 rounded-full border px-4 text-sm transition-colors ${set ? "border-teal/60 bg-teal/10 text-teal" : "border-white/20 text-mist hover:border-lavender hover:text-paper"}`}
      onClick={() => { void toggle(); }}
      aria-pressed={set}
    >
      {set ? "🔔 Reminder on (keep this tab open)" : biddingOpen ? "🔔 Notify me when bidding closes" : "🔔 Notify me when reveal ends"}
    </button>
  );
}

export function AuctionRules({ auction }: { auction: Auction }) {
  const top = priceAt(auction, auction.stepCount - 1);
  const rules: [string, string][] = [
    ["Tokens for sale", auction.supply.toString()],
    ["Price levels", `${auction.minPrice.toString()} to ${top.toString()}, steps of ${auction.stepSize.toString()}`],
    ["Lowest price accepted", auction.minPrice.toString()],
    ["Deposit per bidder", auction.deposit.toString()],
    ["Most one bid can spend", auction.maxNotional.toString()],
    ["Bid slots used", `${auction.bidCount} of ${auction.maxSlots}`],
    ["Bidding closes", formatDate(auction.commitDeadline)],
    ["Reveal window ends", formatDate(auction.revealDeadline)],
    ["Cancel opens if not settled", formatDate(auction.cancelAfter)],
  ];
  return (
    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      {rules.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-3 border-b border-white/5 pb-2">
          <dt className="text-lilac">{label}</dt>
          <dd className="text-right font-mono text-paper">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
