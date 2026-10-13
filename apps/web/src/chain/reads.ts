import { blindAuctionV2Abi, marketSeederAbi, type Deployment } from "@blindlaunch/abi";
import { erc20Abi, type Address, type PublicClient } from "viem";
import { STATUS, type AuctionView, type BidView, type TokenMeta } from "./model";

export const PAGE_SIZE = 20;

type Reader = Pick<PublicClient, "readContract">;

export function createReads(client: Reader, deployment: Deployment) {
  const tokens = new Map<string, Promise<TokenMeta>>();
  const at = deployment.auction;

  function token(address: Address): Promise<TokenMeta> {
    const key = address.toLowerCase();
    let meta = tokens.get(key);
    if (!meta) {
      meta = Promise.all([
        client.readContract({ address, abi: erc20Abi, functionName: "name" }),
        client.readContract({ address, abi: erc20Abi, functionName: "symbol" }),
        client.readContract({ address, abi: erc20Abi, functionName: "decimals" }),
      ]).then(([name, symbol, decimals]) => ({ address, name, symbol, decimals }));
      meta.catch(() => tokens.delete(key));
      tokens.set(key, meta);
    }
    return meta;
  }

  function nextAuctionId(): Promise<bigint> {
    return client.readContract({ address: at, abi: blindAuctionV2Abi, functionName: "nextAuctionId" });
  }

  /** Auction ids for page `page` (0 = newest), with no upper limit on how many auctions exist. */
  async function pageIds(page: number, next?: bigint): Promise<bigint[]> {
    const top = (next ?? (await nextAuctionId())) - 1n - BigInt(page * PAGE_SIZE);
    const ids: bigint[] = [];
    for (let id = top; id >= 1n && ids.length < PAGE_SIZE; id -= 1n) ids.push(id);
    return ids;
  }

  async function auction(id: bigint): Promise<AuctionView | null> {
    const raw = await client.readContract({ address: at, abi: blindAuctionV2Abi, functionName: "getAuction", args: [id] });
    if (raw.status === STATUS.None) return null;
    const [sale, quote] = await Promise.all([token(raw.saleToken), token(raw.quoteToken)]);
    return { ...raw, id, sale, quote };
  }

  async function bids(id: bigint, bidCount: number): Promise<BidView[]> {
    return Promise.all(
      Array.from({ length: bidCount }, (_, slot) =>
        client
          .readContract({ address: at, abi: blindAuctionV2Abi, functionName: "getBid", args: [id, slot] })
          .then((bid) => ({ ...bid, slot })),
      ),
    );
  }

  async function slotOf(id: bigint, account: Address): Promise<number | null> {
    const slotPlusOne = await client.readContract({ address: at, abi: blindAuctionV2Abi, functionName: "bidderSlot", args: [id, account] });
    return slotPlusOne === 0 ? null : slotPlusOne - 1;
  }

  function claimable(id: bigint, account: Address) {
    return client.readContract({ address: at, abi: blindAuctionV2Abi, functionName: "claimable", args: [id, account] });
  }

  function allocationOf(id: bigint, account: Address) {
    return client.readContract({ address: at, abi: blindAuctionV2Abi, functionName: "allocationOf", args: [id, account] });
  }

  function demand(id: bigint) {
    return client.readContract({ address: at, abi: blindAuctionV2Abi, functionName: "qtyAtStepOf", args: [id] });
  }

  function keeperKeys(id: bigint) {
    return client.readContract({ address: at, abi: blindAuctionV2Abi, functionName: "keeperKeysOf", args: [id] });
  }

  function publishedKeys(id: bigint) {
    return client.readContract({ address: at, abi: blindAuctionV2Abi, functionName: "publishedKeysOf", args: [id] });
  }

  function position(id: bigint) {
    return client.readContract({ address: deployment.seeder, abi: marketSeederAbi, functionName: "positionOf", args: [id] });
  }

  function balanceOf(tokenAddress: Address, account: Address) {
    return client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: "balanceOf", args: [account] });
  }

  return { token, nextAuctionId, pageIds, auction, bids, slotOf, claimable, allocationOf, demand, keeperKeys, publishedKeys, position, balanceOf };
}

export type Reads = ReturnType<typeof createReads>;
