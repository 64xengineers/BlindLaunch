import { blindAuctionV2Abi, keeperRegistryAbi, marketSeederAbi, parseDeployment } from "@blindlaunch/abi";
import { ContractFunctionRevertedError, encodeErrorResult, UserRejectedRequestError } from "viem";
import { describe, expect, it } from "vitest";
import { createReads } from "../src/chain/reads";
import { errorMessages, friendlyError } from "../src/state/errors";

describe("errors (X3)", () => {
  it("has a sentence for every custom error the contracts can raise", () => {
    const names = [blindAuctionV2Abi, marketSeederAbi, keeperRegistryAbi]
      .flatMap((abi) => abi.filter((item) => item.type === "error").map((item) => item.name));
    expect(names.length).toBeGreaterThan(40);
    for (const name of names) expect(errorMessages[name], name).toBeTruthy();
  });

  it("explains a wallet rejection and a contract revert", () => {
    expect(friendlyError(new UserRejectedRequestError(new Error("denied")))).toMatch(/cancelled/);
    const revert = new ContractFunctionRevertedError({
      abi: blindAuctionV2Abi,
      functionName: "commit",
      data: encodeErrorResult({ abi: blindAuctionV2Abi, errorName: "TooLate" }),
    });
    expect(friendlyError(revert)).toBe(errorMessages.TooLate);
  });
});

describe("reads (C1)", () => {
  const deployment = parseDeployment({
    chainId: 31337,
    deployBlock: 0,
    registry: "0x00000000000000000000000000000000000000a1",
    auction: "0x00000000000000000000000000000000000000a2",
    seeder: "0x00000000000000000000000000000000000000a3",
    factory: "0x00000000000000000000000000000000000000a4",
    quote: "0x00000000000000000000000000000000000000a5",
  });
  const client = { readContract: async () => 46n } as never;

  it("pages auction ids newest first with no cap", async () => {
    const reads = createReads(client, deployment);
    expect(await reads.pageIds(0)).toEqual(Array.from({ length: 20 }, (_, i) => 45n - BigInt(i)));
    expect(await reads.pageIds(2)).toEqual([5n, 4n, 3n, 2n, 1n]);
    expect(await reads.pageIds(3)).toEqual([]);
  });
});
