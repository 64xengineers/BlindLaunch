import type { CSSProperties } from "react";
import { Icon, type IconName } from "./art";
import { Fold } from "./ui";

const promises: [IconName, string, string, string][] = [
  ["eye-off", "Nobody sees your bid", "var(--color-cyan)", "-2deg"],
  ["equals", "One price for everyone", "var(--color-yellow)", "1.5deg"],
  ["arrow-up-right", "Trading opens at that price", "var(--color-green)", "-1deg"],
  ["shield", "Full refund if anything breaks", "var(--color-magenta)", "2deg"],
];

/** The four promises, as tilted stickers. They are facts, not buttons. */
export function TrustStickers({ className = "" }: { className?: string }) {
  return (
    <ul className={`hm-trust ${className}`} aria-label="What you can count on">
      {promises.map(([icon, text, colour, tilt]) => (
        <li key={text} style={{ "--c": colour, "--r": tilt } as CSSProperties}>
          <Icon name={icon} size={18} />
          {text}
        </li>
      ))}
    </ul>
  );
}

const questions: [string, string][] = [
  ["Can anyone see my bid?", "No. It locks on your device before it leaves, and unlocks only after bidding ends. Not even we can see it."],
  ["What do I pay?", "The final price times the tokens you get. Never more than your max price."],
  ["Do I need to come back?", "Only to collect. Bids unlock by themselves when bidding ends. There is no reveal step."],
  ["What if it's crowded?", "If more people want tokens at the final price than there are tokens, everyone at that price gets the same fair share."],
  ["Why does everyone lock the same bid money?", "So nobody can guess how big your bid is. Whatever you don't spend comes back."],
  ["Who unlocks the bids?", "Three independent keepers each hold part of the key. Any two are enough. Two of them teaming up could peek early, which is why different people run them."],
  ["What if something breaks?", "If bids can't unlock in time, anyone can press Refund everyone. Every cent comes back."],
  ["What happens to a bid that cheats?", "A bid made outside the app that doesn't unlock to what it promised loses its money. It's burned. Nobody gets it."],
  ["Are there fees?", "No platform fee. You only pay the network fee for your own taps."],
  ["Is it safe?", "The code is open and tested, but not audited yet. Use amounts you're fine losing."],
];

const shortList = [0, 1, 2, 6, 9];

/** Plain-word questions, collapsed. `short` is the home page cut. */
export function FinePrint({ short = false }: { short?: boolean }) {
  const list = short ? shortList.map((index) => questions[index]!) : questions;
  return (
    <div className="panel hm-faq">
      {list.map(([question, answer], index) => (
        <Fold key={question} title={question} defaultOpen={!short && index === 0}>
          <p className="m-0 max-w-[40em] pb-2 text-muted">{answer}</p>
        </Fold>
      ))}
    </div>
  );
}
