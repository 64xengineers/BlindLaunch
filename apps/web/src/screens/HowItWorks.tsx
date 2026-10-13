import { FaqSection, StepsSection } from "../components/sections";
import { PrivacySection, RiskNotice } from "../components/trust";
import { GlassCard } from "../components/ui";

const costs: [string, string][] = [
  ["Deposit", "The same fixed amount for every bidder. What you do not spend comes back after settlement."],
  ["Most you can pay", "Your highest price times how many you want. You usually pay less: the one price is often below your bid."],
  ["Platform fee", "None. The contracts take no fee."],
  ["Gas", "One transaction to bid (plus a one-time approval), one to claim. Opening and settling are done by keepers, or by anyone."],
  ["If your bid does not match its own commitment", "Your deposit is forfeited to a burn address. The app checks every bid before sending it, so this only happens to bids crafted outside the app."],
];

export function HowItWorks() {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-20">
      <h1 className="text-5xl font-bold tracking-[-0.04em]">How Blindlaunch works</h1>
      <p className="mt-4 max-w-2xl text-lg text-mist">
        A sealed-bid, one-price auction where bids open themselves. You act once, when you bid. Everything after that happens on chain.
      </p>
      <StepsSection />
      <section className="mt-16 grid gap-6 lg:grid-cols-2">
        <GlassCard>
          <h2 className="text-lg font-bold">Why bids open themselves</h2>
          <p className="mt-3 text-sm leading-relaxed text-mist">
            Your app splits your bid into three shares and encrypts each to one keeper, so no single keeper can read it. After the deadline two keepers publish their keys. The contract checks every key, decrypts every bid, and only counts a bid that matches the commitment you sent. There is no reveal step, so nobody can wait, look at other bids, and then decide whether theirs counts.
          </p>
        </GlassCard>
        <GlassCard>
          <h2 className="text-lg font-bold">Costs</h2>
          <dl className="mt-3 grid gap-3 text-sm">
            {costs.map(([label, value]) => (
              <div key={label} className="grid gap-1 border-b border-white/5 pb-3 last:border-0 sm:grid-cols-[11rem_1fr]">
                <dt className="text-lilac">{label}</dt>
                <dd className="text-paper">{value}</dd>
              </div>
            ))}
          </dl>
        </GlassCard>
      </section>
      <PrivacySection />
      <FaqSection />
      <RiskNotice />
    </div>
  );
}
