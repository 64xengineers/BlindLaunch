import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { reads } from "../chain/clients";
import { formatAmount } from "../chain/format";
import { phaseOf, type AuctionView } from "../chain/model";
import { useNow, usePolling } from "../state/hooks";
import { Icon } from "./art";
import { timeLeft } from "./ui";

function line(auction: AuctionView, now: bigint) {
  const name = auction.sale.name;
  const price = (value: bigint) => {
    const [whole, fraction = ""] = formatAmount(value, auction.quote.decimals, 6).split(".");
    const amount = `${whole}.${fraction.padEnd(2, "0")}`;
    return /usd/i.test(auction.quote.symbol) ? `$${amount}` : `${amount} ${auction.quote.symbol}`;
  };
  switch (phaseOf(auction, now)) {
    case "scheduled": return { icon: "clock" as const, body: <><b>{name}</b> starts in <i>{timeLeft(Number(auction.commitStart), Number(now))}</i></> };
    case "bidding": return { icon: "lock" as const, body: <><b>{name}</b> is live · <i>{auction.bidCount}</i> secret bids · <i>{timeLeft(Number(auction.commitDeadline), Number(now))}</i> left</> };
    case "awaitingKeys":
    case "opening":
    case "ready": return { icon: "unlock" as const, body: <><b>{name}</b> is unlocking bids</> };
    case "cancellable": return { icon: "alert" as const, body: <><b>{name}</b> is stuck · anyone can refund everyone</> };
    case "settled": return auction.totalSold > 0n
      ? { icon: "check" as const, body: <><b>{name}</b> sold at <i>{price(auction.clearingPrice)}</i> for everyone</> }
      : { icon: "return" as const, body: <><b>{name}</b> ended with no sale · money back</> };
    case "cancelled": return { icon: "return" as const, body: <><b>{name}</b> refunded everyone</> };
  }
}

/** Public events only: launches, time left, bid counts, final prices. Never a bid's contents. */
export function LiveTicker() {
  const now = useNow();
  const [paused, setPaused] = useState(false);
  const { data } = usePolling(
    reads ? async () => {
      const ids = await reads!.pageIds(0);
      return (await Promise.all(ids.slice(0, 12).map((id) => reads!.auction(id)))).filter((a): a is AuctionView => a !== null);
    } : null,
    [],
    15_000,
  );
  useEffect(() => {
    try { setPaused(localStorage.getItem("bl.ticker.paused") === "1"); } catch { /* storage blocked */ }
  }, []);
  const toggle = () => {
    setPaused((value) => {
      try { localStorage.setItem("bl.ticker.paused", value ? "0" : "1"); } catch { /* storage blocked */ }
      return !value;
    });
  };
  const items = (data ?? []).map((auction) => ({ id: auction.id, to: `/auction/${auction.id}`, ...line(auction, now) }));
  if (items.length === 0) return <div className="ticker" aria-hidden="true" />;
  const loop = items.length < 6 ? [...items, ...items, ...items] : items;
  return (
    <div className={`ticker ${paused ? "is-paused" : ""}`} aria-label="Live activity">
      <div className="ticker-track">
        {[...loop, ...loop].map((item, index) => (
          <Link key={`${item.id}-${index}`} to={item.to} className="ticker-item" tabIndex={index < loop.length ? 0 : -1} aria-hidden={index >= loop.length}>
            <Icon name={item.icon} size={16} className="text-cyan" />
            <span>{item.body}</span>
          </Link>
        ))}
      </div>
      <button type="button" className="absolute right-0 top-0 grid h-full w-11 place-items-center border-l-2 border-line bg-void text-muted hover:text-cyan" aria-label={paused ? "Play the ticker" : "Pause the ticker"} onClick={toggle}>
        <Icon name={paused ? "play" : "pause"} size={16} />
      </button>
    </div>
  );
}
