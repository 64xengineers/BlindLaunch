import type { CSSProperties } from "react";
import type { IconName } from "../components/art";
import { ComicStrip, SectionTitle } from "../components/sections";
import { FinePrint } from "../components/trust";
import { Hush, Icon, PrimaryLink, Receipt, ReceiptRow } from "../components/ui";

const outcomes: [IconName, string, string, string][] = [
  ["star", "You won", "You pay the final price for your tokens. Everything else comes back.", "var(--color-yellow)"],
  ["half", "It was crowded", "Bids above the final price got everything. Bids right at it each got the same slice of what they asked for. Unused money comes back.", "var(--color-cyan)"],
  ["x", "You missed", "Your max was below the final price. All of your bid money comes back.", "var(--color-coral)"],
  ["shield", "Something broke", "If bids can't unlock in time, anyone can refund everyone. Every cent comes back.", "var(--color-green)"],
];

export function HowItWorks() {
  return (
    <div className="hm-wrap is-narrow">
      <header className="hm-page-head rise">
        <div>
          <span className="label !text-cyan">The rules</span>
          <h1 className="hm-h1 mt-2">How it works</h1>
          <p className="hm-sub">Four panels. Thirty seconds. Then you know more than most traders in the room.</p>
        </div>
        <Hush pose="excited" size={150} className="hm-hop hidden sm:inline-block" />
      </header>

      <ComicStrip big />

      <section className="hm-section" aria-labelledby="money-title">
        <SectionTitle id="money-title">What happens to my money</SectionTitle>
        <div className="hm-money">
          <div className="hm-receipt-wrap">
            <span className="hm-stamp shout" aria-hidden="true">Example</span>
            <Receipt title="You bid up to $0.020 for 25,000" aside="Final price $0.016">
              <ReceiptRow icon="lock" tone="violet" label="You lock (same for everyone)" value="$1,000.00" />
              <ReceiptRow icon="coin" tone="cyan" label="You get" value={<>25,000 <small>NCAT</small></>} />
              <ReceiptRow icon="dollar" tone="yellow" label="You pay (25,000 × $0.016)" value="$400.00" />
              <ReceiptRow icon="return" tone="green" label="Comes back" value="$600.00" />
              <p className="hm-receipt-foot">You bid up to $0.020, but everyone pays the final price, so you pay less. One tap collects your tokens and the $600 together.</p>
            </Receipt>
            <div className="panel hm-why">
              <span className="ic"><Icon name="lock" size={22} /></span>
              <div>
                <b>Why lock $1,000 to spend $400?</b>
                <p>Everyone in a launch locks the same bid money, so nobody can guess your bid from it. Whatever you don't spend comes back.</p>
              </div>
            </div>
          </div>
          <div className="panel">
            <ul className="hm-outcomes">
              {outcomes.map(([icon, title, line, colour]) => (
                <li key={title} style={{ "--c": colour } as CSSProperties}>
                  <span className="ic"><Icon name={icon} size={22} /></span>
                  <div><b>{title}</b><span>{line}</span></div>
                </li>
              ))}
              <li style={{ "--c": "var(--color-paper)" } as CSSProperties}>
                <span className="ic"><Icon name="dollar" size={22} /></span>
                <div><b>Fees</b><span>No platform fee. You only pay the network fee for your own taps: one to bid, one to collect.</span></div>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="hm-section" aria-labelledby="fine-title">
        <SectionTitle id="fine-title">The fine print, in plain words</SectionTitle>
        <FinePrint />
      </section>

      <div className="mt-16 flex justify-center">
        <PrimaryLink to="/" icon="chevron-right" className="min-w-[340px]">See live launches</PrimaryLink>
      </div>
    </div>
  );
}
