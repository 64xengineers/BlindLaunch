import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useSession } from "../auth/session";
import { reads } from "../chain/clients";
import { phaseOf, type AuctionView, type BidView, type Phase } from "../chain/model";
import { HushSays, Panel, PrimaryButton, PrimaryLink, SecondaryButton, Sticker, timeLeft, TokenArt, type StickerTone } from "../components/ui";
import { callAuction } from "../state/actions";
import { useNow, usePolling, useRunner } from "../state/hooks";
import { openConnect } from "../state/connect";
import { lootOf, money, tokens } from "./ResultPage";

/** How many recent auctions the bid and team lists scan. */
export const SCAN_PAGES = 5;

/** Where a launch's row goes: the result once it is over, the launch page before. */
export function launchPath(auction: AuctionView, phase: Phase): string {
  return phase === "settled" || phase === "cancelled" ? `/auction/${auction.id}/result` : `/auction/${auction.id}`;
}

/** One mission row: token art, name, status sticker, one plain line and one action. */
export function MissionRow({ auction, to, sticker, tone, live = false, line, action }: {
  auction: AuctionView; to: string; sticker: string; tone: StickerTone; live?: boolean; line: ReactNode; action: ReactNode;
}) {
  return (
    <li className="mylist-item">
      <Panel className="mylist-row">
        <TokenArt address={auction.sale.address} size={56} className="art" />
        <div className="min-w-0">
          <h2 className="truncate"><Link className="mylist-link" to={to}>{auction.sale.name}</Link><span className="tk">${auction.sale.symbol}</span></h2>
          <p>{line}</p>
        </div>
        <span className="stk"><Sticker tone={tone} live={live}>{sticker}</Sticker></span>
        <div className="act">{action}</div>
      </Panel>
    </li>
  );
}

/** Page frame shared by My bids and My launches: an 880px list under a title. */
export function ListFrame({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-[880px] px-4 pb-24 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="m-0 text-[44px] font-bold leading-[1.05]">{title}</h1>
        {aside}
      </div>
      <div className="mt-8">{children}</div>
    </div>
  );
}

export function ListLoading() {
  return (
    <div className="grid gap-3.5" aria-label="Loading">
      {[0, 1, 2].map((row) => <div key={row} className="shimmer h-[86px]" />)}
    </div>
  );
}

type Row = { sticker: string; tone: StickerTone; live?: boolean; line: ReactNode };

function rowFor(auction: AuctionView, bid: BidView | undefined, claimable: readonly [bigint, bigint] | null, now: bigint): Row {
  const phase = phaseOf(auction, now);
  const { sale, quote } = auction;
  switch (phase) {
    case "scheduled":
    case "bidding":
      return { sticker: "Locked", tone: "cyan", line: <>Secret bid locked. Bidding closes in <b className="num">{timeLeft(Number(auction.commitDeadline), Number(now))}</b>.</> };
    case "awaitingKeys":
      return { sticker: "Unlocking", tone: "violet", line: "Bidding closed. The bids unlock by themselves. Nothing to do." };
    case "opening":
      return { sticker: "Unlocking", tone: "violet", line: <><b className="num">{auction.openedCount}</b> of <b className="num">{auction.bidCount}</b> bids unlocked.</> };
    case "ready":
      return { sticker: "Ready", tone: "yellow", line: "Every bid is unlocked. Anyone can reveal the result." };
    case "cancellable":
      return { sticker: "Stuck", tone: "coral", line: "The unlock keys never came. Anyone can refund everyone." };
    case "settled":
    case "cancelled": {
      if (!bid || !claimable) return { sticker: "Done", tone: "green", line: "Finished." };
      const loot = lootOf(auction, bid);
      const [tokensLeft, moneyLeft] = claimable;
      const left = [tokensLeft > 0n ? tokens(tokensLeft, sale) : null, moneyLeft > 0n ? money(moneyLeft, quote) : null].filter(Boolean).join(" and ");
      if (!left && (loot.tokens > 0n || loot.back > 0n)) return { sticker: "Collected", tone: "green", line: "All collected. It is in your wallet." };
      const toCollect = <><b>{left}</b> to collect.</>;
      switch (loot.kind) {
        case "won": return { sticker: "Won", tone: "yellow", line: toCollect };
        case "fair": return { sticker: "Fair share", tone: "cyan", line: <>Crowded, so you got {loot.percent}%. {toCollect}</> };
        case "missed": return { sticker: "Missed", tone: "coral", line: <>The final price ended above your max. {toCollect}</> };
        case "refund": return { sticker: "Money back", tone: "green", line: <>{phase === "cancelled" ? "Called off. " : "Your bid did not count. "}{toCollect}</> };
        case "burned": return { sticker: "Burned", tone: "coral", line: "This bid did not match what was locked. Its money was burned." };
      }
    }
  }
}

const actionLabel: Record<Phase, string> = {
  scheduled: "See launch", bidding: "See launch", awaitingKeys: "Watch it unlock", opening: "Watch it unlock",
  ready: "Reveal the result", cancellable: "Refund everyone", settled: "See result", cancelled: "See result",
};

export function MyBids() {
  const { signer } = useSession();
  const account = signer?.address ?? null;
  const now = useNow();
  const { run, busy } = useRunner();
  const { data, loading, reload } = usePolling(
    reads && account ? async () => {
      const next = await reads!.nextAuctionId();
      const ids = (await Promise.all(Array.from({ length: SCAN_PAGES }, (_, page) => reads!.pageIds(page, next)))).flat();
      const slots = await Promise.all(ids.map((id) => reads!.slotOf(id, account)));
      const mine = ids.flatMap((id, index) => (slots[index] === null || slots[index] === undefined ? [] : [{ id, slot: slots[index] }]));
      return Promise.all(mine.map(async ({ id, slot }) => {
        const [auction, bid] = await Promise.all([reads!.auction(id), reads!.bid(id, slot)]);
        const claimable = auction && auction.status >= 2 ? await reads!.claimable(id, account) : null;
        return { auction: auction as AuctionView, bid, claimable };
      }));
    } : null,
    [account],
    10_000,
  );

  return (
    <ListFrame title="My bids">
      {!account ? (
        <Empty pose="idle" say={<>Sign in to see your bids and <b>collect what you won.</b></>}>
          <PrimaryButton className="w-auto" icon="fingerprint" onClick={openConnect}>Sign in</PrimaryButton>
        </Empty>
      ) : null}
      {account && loading && !data ? <ListLoading /> : null}
      {data && data.length === 0 ? (
        <Empty pose="waiting" say={<>No bids yet. Your secret bids show up here, from the last {SCAN_PAGES * 20} launches.</>}>
          <PrimaryLink to="/" icon="grid">See live launches</PrimaryLink>
        </Empty>
      ) : null}
      {data && data.length > 0 ? (
        <ul className="mylist">
          {data.map(({ auction, bid, claimable }) => {
            const phase = phaseOf(auction, now);
            const row = rowFor(auction, bid, claimable, now);
            const owed = claimable ? claimable[0] + claimable[1] : 0n;
            const to = launchPath(auction, phase);
            return (
              <MissionRow
                key={auction.id.toString()}
                auction={auction}
                to={to}
                {...row}
                action={owed > 0n ? (
                  <SecondaryButton icon="bag" disabled={busy !== null} onClick={() => void run(`Collect ${auction.id}`, (w) => callAuction(w, "claim", auction.id), "Collected. It is in your wallet.").then(reload)}>
                    {busy === `Collect ${auction.id}` ? "Collecting…" : "Collect"}
                  </SecondaryButton>
                ) : (
                  <SecondaryButton to={to} icon="chevron-right">{actionLabel[phase]}</SecondaryButton>
                )}
              />
            );
          })}
        </ul>
      ) : null}
    </ListFrame>
  );
}

/** Hush-led empty state with one primary action. */
export function Empty({ pose, say, children }: { pose: "idle" | "waiting" | "excited"; say: ReactNode; children: ReactNode }) {
  return (
    <Panel large accent className="rise grid justify-items-start gap-7 px-8 py-9">
      <HushSays pose={pose} size={140} className="max-w-[640px]">{say}</HushSays>
      {children}
    </Panel>
  );
}
