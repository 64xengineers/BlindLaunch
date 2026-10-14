import type { ReactNode } from "react";
import { ComicArt } from "./ui";

/** A HUD section heading: the title, an optional count, then a hairline to the edge. */
export function SectionTitle({ children, count, id, as: Tag = "h2" }: { children: ReactNode; count?: ReactNode; id?: string; as?: "h2" | "h3" }) {
  return (
    <Tag className={Tag === "h2" ? "hm-sec-title" : "hm-group-title"} id={id}>
      <span>{children}</span>
      {count !== undefined ? <span className="count">{count}</span> : null}
    </Tag>
  );
}

const panels: { n: 1 | 2 | 3 | 4; title: string; line: string; label: string }[] = [
  { n: 1, title: "Bid in secret", line: "Pick a price and an amount. It locks on your device.", label: "Hush slams his lock shut on a bid slip" },
  { n: 2, title: "Bids unlock together", line: "When bidding ends, every bid unlocks at once. No peeking before.", label: "Five padlocks pop open around a clock at zero" },
  { n: 3, title: "Everyone pays one price", line: "The final price is where the tokens sell out. Bid higher, still pay that.", label: "Three bidders all holding the same price tag" },
  { n: 4, title: "Trading starts on Kuru", line: "Trading opens at the final price. Unused bid money comes back.", label: "Coins fly from a market stall back to the bidders" },
];

/** The four-panel comic: the whole product in thirty seconds. `big` is the How it works layout. */
export function ComicStrip({ big = false }: { big?: boolean }) {
  return (
    <ol className={`hm-comics ${big ? "is-big" : ""}`}>
      {panels.map((panel) => (
        <li key={panel.n} className="hm-comic">
          <span className="hm-comic-n" aria-hidden="true">{panel.n}</span>
          <div className="hm-comic-draw"><ComicArt panel={panel.n} label={panel.label} /></div>
          <div>
            <h3><span className="sr-only">Step {panel.n}: </span>{panel.title}</h3>
            <p>{panel.line}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
