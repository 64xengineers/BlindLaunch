import type { ReactNode } from "react";
import { useSession } from "../auth/session";
import { reads } from "../chain/clients";
import { phaseOf, type AuctionView, type Phase } from "../chain/model";
import { PrimaryButton, PrimaryLink, SecondaryButton, timeLeft, type StickerTone } from "../components/ui";
import { useNow, usePolling } from "../state/hooks";
import { Empty, launchPath, ListFrame, ListLoading, MissionRow, SCAN_PAGES } from "./MyBids";
import { openConnect } from "../state/connect";
import { money } from "./ResultPage";

type Row = { sticker: string; tone: StickerTone; live?: boolean; line: ReactNode; action: string };

function rowFor(auction: AuctionView, phase: Phase, now: bigint): Row {
  const left = (target: bigint) => <b className="num">{timeLeft(Number(target), Number(now))}</b>;
  const bids = <><b className="num">{auction.bidCount}</b> secret {auction.bidCount === 1 ? "bid" : "bids"}</>;
  const collected = auction.unsoldReclaimed && auction.proceedsReclaimed;
  switch (phase) {
    case "scheduled":
      return { sticker: "Starts soon", tone: "violet", line: <>Bidding opens in {left(auction.commitStart)}.</>, action: "See launch" };
    case "bidding":
      return { sticker: "Live", tone: "yellow", live: true, line: <>{bids} so far. Closes in {left(auction.commitDeadline)}.</>, action: "See launch" };
    case "awaitingKeys":
      return { sticker: "Unlocking", tone: "violet", line: <>Bidding closed with {bids}. The bids unlock by themselves.</>, action: "Watch it unlock" };
    case "opening":
      return { sticker: "Unlocking", tone: "violet", line: <><b className="num">{auction.openedCount}</b> of <b className="num">{auction.bidCount}</b> bids unlocked.</>, action: "Watch it unlock" };
    case "ready":
      return { sticker: "Ready", tone: "yellow", line: "Every bid is unlocked. Anyone can reveal the result.", action: "Reveal the result" };
    case "cancellable":
      return { sticker: "Stuck", tone: "coral", line: "The unlock keys never came. Anyone can refund everyone.", action: "Refund everyone" };
    case "settled":
      if (auction.totalSold === 0n) {
        return { sticker: "No sale", tone: "paper", line: collected ? "Nothing sold. Your tokens are back." : "Nothing sold. Take your tokens back.", action: collected ? "See result" : "Collect" };
      }
      return {
        sticker: collected ? "Collected" : "Done",
        tone: "green",
        line: <>Raised <b className="num">{money(auction.totalSold * auction.clearingPrice, auction.quote)}</b>. {collected ? "All collected." : "Ready to collect."}</>,
        action: collected ? "See result" : "Collect",
      };
    case "cancelled":
      return { sticker: "Called off", tone: "coral", line: collected ? "Called off. Your tokens are back." : "Called off. Nobody paid. Take your tokens back.", action: collected ? "See result" : "Collect" };
  }
}

/** My launches: every launch this account created, newest first. */
export function TeamPage() {
  const { signer } = useSession();
  const account = signer?.address ?? null;
  const now = useNow();
  const { data, loading } = usePolling(
    reads && account ? async () => {
      const next = await reads!.nextAuctionId();
      const ids = (await Promise.all(Array.from({ length: SCAN_PAGES }, (_, page) => reads!.pageIds(page, next)))).flat();
      const auctions = await Promise.all(ids.map((id) => reads!.auction(id)));
      return auctions.filter((a): a is AuctionView => a !== null && a.authority.toLowerCase() === account.toLowerCase());
    } : null,
    [account],
    10_000,
  );
  const some = data !== undefined && data.length > 0;
  return (
    <ListFrame title="My launches" aside={some ? <PrimaryLink to="/create" icon="plus">Create a launch</PrimaryLink> : null}>
      {!account ? (
        <Empty pose="idle" say={<>Sign in with the wallet or passkey that <b>creates your launches</b>.</>}>
          <PrimaryButton className="w-auto" icon="fingerprint" onClick={openConnect}>Sign in</PrimaryButton>
        </Empty>
      ) : null}
      {account && loading && !data ? <ListLoading /> : null}
      {data && data.length === 0 ? (
        <Empty pose="excited" say={<>You haven't launched anything yet. One token, one price for everyone, <b>no bots</b>.</>}>
          <PrimaryLink to="/create" icon="plus">Create a launch</PrimaryLink>
        </Empty>
      ) : null}
      {some ? (
        <ul className="mylist">
          {data.map((auction) => {
            const phase = phaseOf(auction, now);
            const row = rowFor(auction, phase, now);
            const to = launchPath(auction, phase);
            return (
              <MissionRow
                key={auction.id.toString()}
                auction={auction}
                to={to}
                sticker={row.sticker}
                tone={row.tone}
                live={row.live}
                line={row.line}
                action={<SecondaryButton to={to} icon={row.action === "Collect" ? "bag" : "chevron-right"}>{row.action}</SecondaryButton>}
              />
            );
          })}
        </ul>
      ) : null}
    </ListFrame>
  );
}
