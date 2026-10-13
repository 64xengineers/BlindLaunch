import { blindAuctionV2Abi, marketSeederAbi, type Deployment } from "@blindlaunch/abi";
import { BaseError, erc20Abi, type Address, type PublicClient } from "viem";
import { shortAddress } from "./format";
import { STATUS, type AuctionView, type BidView, type TokenMeta } from "./model";

export const PAGE_SIZE = 20;
/** Bids are read this many at a time, so a launch with thousands of bids does not hit the RPC all at once. */
export const BID_PAGE = 500;

/** Errors that mean the contract answered, but uselessly: it reverted, returned nothing, or returned data that does not decode. */
const REFUSALS = new Set([
  "ContractFunctionRevertedError",
  "ContractFunctionZeroDataError",
  "ExecutionRevertedError",
  "AbiDecodingZeroDataError",
  "AbiDecodingDataSizeTooSmallError",
  "AbiDecodingDataSizeInvalidError",
  "PositionOutOfBoundsError",
  "IntegerOutOfRangeError",
  "NegativeOffsetError",
  "RecursiveReadLimitExceededError",
]);

/** True when asking again will not help. Network trouble is false, so callers retry instead of keeping a stand-in. */
export function contractRefused(error: unknown): boolean {
  return error instanceof BaseError && error.walk((cause) => cause instanceof Error && REFUSALS.has(cause.name)) !== null;
}

type Reader = Pick<PublicClient, "readContract">;

export function createReads(client: Reader, deployment: Deployment) {
  const tokens = new Map<string, Promise<TokenMeta>>();
  const at = deployment.auction;

  function token(address: Address): Promise<TokenMeta> {
    const key = address.toLowerCase();
    let meta = tokens.get(key);
    if (!meta) {
      // Name and symbol are optional in ERC-20: a token that cannot give them shows its short address instead.
      const label = (functionName: "name" | "symbol") =>
        client.readContract({ address, abi: erc20Abi, functionName }).catch((error: unknown) => {
          if (contractRefused(error)) return shortAddress(address);
          throw error;
        });
      meta = Promise.all([
        label("name"),
        label("symbol"),
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
    try {
      const [sale, quote] = await Promise.all([token(raw.saleToken), token(raw.quoteToken)]);
      return { ...raw, id, sale, quote };
    } catch (error) {
      // No amount can be shown without decimals, so a launch whose token cannot give them is skipped instead of breaking every list.
      if (contractRefused(error)) return null;
      throw error;
    }
  }

  async function bids(id: bigint, bidCount: number): Promise<BidView[]> {
    const all: BidView[] = [];
    for (let start = 0; start < bidCount; start += BID_PAGE) {
      const count = Math.min(BID_PAGE, bidCount - start);
      all.push(...(await Promise.all(Array.from({ length: count }, (_, i) => bid(id, start + i)))));
    }
    return all;
  }

  async function bid(id: bigint, slot: number): Promise<BidView> {
    const raw = await client.readContract({ address: at, abi: blindAuctionV2Abi, functionName: "getBid", args: [id, slot] });
    return { ...raw, slot };
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

  return { token, nextAuctionId, pageIds, auction, bids, bid, slotOf, claimable, allocationOf, demand, keeperKeys, publishedKeys, position, balanceOf };
}

export type Reads = ReturnType<typeof createReads>;
