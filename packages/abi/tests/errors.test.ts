import { decodeErrorResult, encodeErrorResult } from "viem";
import { describe, expect, it } from "vitest";
import { blindAuctionV2Abi, keeperRegistryAbi } from "../src/generated";

describe("errors a BlindAuctionV2 call bubbles up", () => {
  // createAuction takes a key from each keeper queue; an empty queue reverts inside KeeperRegistry and the
  // revert reaches the caller unchanged. Clients decode it with the auction's ABI alone.
  it("decodes KeeperRegistry's NoKeeperKeys with the auction ABI", () => {
    const data = encodeErrorResult({ abi: keeperRegistryAbi, errorName: "NoKeeperKeys" });
    expect(decodeErrorResult({ abi: blindAuctionV2Abi, data }).errorName).toBe("NoKeeperKeys");
  });
});
