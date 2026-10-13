import type { Deployment } from "@blindlaunch/abi";
import { mulBase } from "@blindlaunch/sealed-bid";
import {
  createPublicClient,
  custom,
  defineChain,
  encodeAbiParameters,
  getAddress,
  toFunctionSelector,
  toHex,
  type Address,
  type Hash,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
  type WalletClient,
} from "viem";
import { describe, expect, it, vi } from "vitest";
import { START_BUFFER, type CreateParams } from "../src/chain/create";
import { callAuction, createAuction, ensureAllowance, OPEN_BATCH, openRemaining, READ_CHUNK, type Writer } from "../src/state/actions";
import { errorMessages, friendlyError } from "../src/state/errors";

const chain = defineChain({ id: 31337, name: "anvil", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: ["http://127.0.0.1:1"] } } });
const me = getAddress("0x00000000000000000000000000000000000000a1");
const deployment = {
  auction: getAddress("0x00000000000000000000000000000000000000b1"),
  seeder: getAddress("0x00000000000000000000000000000000000000b2"),
  quote: getAddress("0x00000000000000000000000000000000000000b3"),
  factory: getAddress("0x00000000000000000000000000000000000000b4"),
  registry: getAddress("0x00000000000000000000000000000000000000b5"),
} as unknown as Deployment;
const token = getAddress("0x00000000000000000000000000000000000000c1");
const HASH = `0x${"11".repeat(32)}` as Hash;
const REPLACEMENT = `0x${"22".repeat(32)}` as Hash;
const BLOCK = 16n;

const wallet = () => {
  const writeContract = vi.fn(async (_request: unknown) => HASH);
  return { walletClient: { account: { address: me, type: "json-rpc" }, writeContract } as unknown as WalletClient, writeContract };
};

const receipt = (status: "success" | "reverted", hash: Hash = HASH) =>
  ({ status, transactionHash: hash, blockNumber: BLOCK, logs: [] }) as unknown as TransactionReceipt;

const receiptJson = (status: "0x1" | "0x0") => ({
  blockHash: `0x${"ab".repeat(32)}`,
  blockNumber: toHex(BLOCK),
  contractAddress: null,
  cumulativeGasUsed: "0x5208",
  effectiveGasPrice: "0x1",
  from: me,
  gasUsed: "0x5208",
  logs: [],
  logsBloom: `0x${"00".repeat(256)}`,
  status,
  to: deployment.auction,
  transactionHash: HASH,
  transactionIndex: "0x0",
  type: "0x2",
});

const revert = (signature: string) => Object.assign(new Error("execution reverted"), { code: 3, data: toFunctionSelector(signature) });

type Call = { to: Address; data: Hex };
/** A real viem client over a fake node: `onCall` answers eth_call (block tag given), receipts come back with `status`. */
function rpcWriter(onCall: (call: Call, block: string) => Hex, status: "0x1" | "0x0" = "0x1") {
  const publicClient = createPublicClient({
    chain,
    transport: custom({
      async request({ method, params }) {
        const list = params as unknown[];
        if (method === "eth_call") return onCall(list[0] as Call, String(list[1]));
        if (method === "eth_getTransactionReceipt") return receiptJson(status);
        if (method === "eth_chainId") return toHex(chain.id);
        if (method === "eth_blockNumber") return toHex(BLOCK);
        throw new Error(`unexpected ${method}`);
      },
    }, { retryCount: 0 }),
  }) as PublicClient;
  const { walletClient, writeContract } = wallet();
  const w: Writer = { publicClient, walletClient, chain, deployment };
  return { w, writeContract };
}

const failure = (promise: Promise<unknown>) => promise.then(() => "no error", friendlyError);

describe("execute: replaced transactions (finding 1)", () => {
  const mocked = (reason?: "cancelled" | "replaced" | "repriced") => {
    const { walletClient, writeContract } = wallet();
    const publicClient = {
      simulateContract: async (args: unknown) => ({ request: args }),
      waitForTransactionReceipt: async ({ onReplaced }: { onReplaced?: (r: { reason: string }) => void }) => {
        if (reason) onReplaced?.({ reason });
        return receipt("success", reason ? REPLACEMENT : HASH);
      },
    } as unknown as PublicClient;
    return { w: { publicClient, walletClient, chain, deployment } satisfies Writer, writeContract };
  };

  it("fails when the wallet cancelled the transaction, even though the cancel itself succeeded", async () => {
    const { w, writeContract } = mocked("cancelled");
    expect(await failure(callAuction(w, "settle", 1n))).toMatch(/cancelled in your wallet/);
    expect(writeContract).toHaveBeenCalledOnce();
  });

  it("fails when the wallet swapped in a different transaction", async () => {
    expect(await failure(callAuction(mocked("replaced").w, "settle", 1n))).toMatch(/replaced the transaction/);
  });

  it("accepts a speed-up of the same call and returns its receipt", async () => {
    expect((await callAuction(mocked("repriced").w, "settle", 1n)).transactionHash).toBe(REPLACEMENT);
    expect((await callAuction(mocked().w, "settle", 1n)).transactionHash).toBe(HASH);
  });
});

describe("execute: reverted receipts keep their reason (finding 4)", () => {
  it("replays the call at the receipt's block and maps the revert", async () => {
    const blocks: string[] = [];
    const { w } = rpcWriter((_call, block) => {
      blocks.push(block);
      if (block === "latest") return "0x";
      throw revert("TooLate()");
    }, "0x0");
    expect(await failure(callAuction(w, "settle", 1n))).toBe(errorMessages.TooLate);
    expect(blocks).toEqual(["latest", toHex(BLOCK)]);
  });

  it("falls back to the hash when the replay does not revert", async () => {
    const { w } = rpcWriter(() => "0x", "0x0");
    expect(await failure(callAuction(w, "settle", 1n))).toBe(`The transaction reverted: ${HASH}`);
  });
});

describe("launch start buffer (finding 4)", () => {
  it("leaves two minutes for a slow wallet confirmation before bidding opens", () => {
    expect(START_BUFFER).toBeGreaterThanOrEqual(120n);
  });
});

describe("registry and seeder errors decode (finding 3)", () => {
  const params: CreateParams = {
    saleToken: token,
    quoteToken: deployment.quote,
    supply: 10n ** 21n,
    lotSize: 10n ** 18n,
    minPrice: 1n,
    stepSize: 1n,
    stepCount: 2,
    deposit: 10n,
    maxNotional: 10n,
    maxBids: 10,
    commitStart: 1n,
    commitDeadline: 2n,
    cancelAfter: 3n,
    seedSaleLots: 0n,
    seedQuoteBps: 0,
    seedLockUntil: 0n,
    kuruParams: "0x",
  };

  it("names NoKeeperKeys and the seeder's checks on createAuction", async () => {
    for (const name of ["NoKeeperKeys", "OffTick", "PriceTooLow"]) {
      const { w, writeContract } = rpcWriter(() => {
        throw revert(`${name}()`);
      });
      expect(await failure(createAuction(w, params))).toBe(errorMessages[name]);
      expect(writeContract).not.toHaveBeenCalled();
    }
  });

  it("names the seeder's errors on handOffSeed", async () => {
    const { w } = rpcWriter(() => {
      throw revert("AlreadyAccepted()");
    });
    expect(await failure(callAuction(w, "handOffSeed", 1n))).toBe(errorMessages.AlreadyAccepted);
  });
});

describe("approve on tokens that return nothing (finding 5)", () => {
  it("approves a sale token whose approve returns no data", async () => {
    const allowance = toFunctionSelector("allowance(address,address)");
    const approve = toFunctionSelector("approve(address,uint256)");
    const { w, writeContract } = rpcWriter((call) => {
      if (call.data.startsWith(allowance)) return encodeAbiParameters([{ type: "uint256" }], [0n]);
      if (call.data.startsWith(approve)) return "0x";
      throw new Error("unexpected call");
    });
    expect(await ensureAllowance(w, token, 5n)).toBe(true);
    expect(writeContract).toHaveBeenCalledOnce();
    expect(writeContract.mock.calls[0]![0]).toMatchObject({ address: token, functionName: "approve", args: [deployment.auction, 5n] });
  });

  it("still approves a standard token that returns true", async () => {
    const approve = toFunctionSelector("approve(address,uint256)");
    const { w } = rpcWriter((call) => encodeAbiParameters([{ type: call.data.startsWith(approve) ? "bool" : "uint256" }], [call.data.startsWith(approve) ? (true as never) : (0n as never)]));
    expect(await ensureAllowance(w, token, 5n)).toBe(true);
  });
});

describe("openRemaining reads and opens in chunks (finding 2)", () => {
  it("keeps every RPC batch at or under the chunk size and opens each sealed bid once", async () => {
    const bidCount = 173;
    const isOpened = (slot: number) => slot % 3 === 0 || (slot >= 60 && slot < 110);
    let inFlight = 0;
    let peak = 0;
    const batches: number[][] = [];
    const publicClient = {
      readContract: async ({ functionName, args }: { functionName: string; args: [bigint, number?] }) => {
        if (functionName === "getAuction") return { bidCount, pairA: 0, pairB: 2 };
        if (functionName === "publishedKeysOf") return [7n, 0n, 11n] as const;
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 0));
        inFlight -= 1;
        const slot = args[1]!;
        return { ephemeral: mulBase(BigInt(slot) + 1n), opened: isOpened(slot) };
      },
      simulateContract: async (args: { functionName: string; args: [bigint, number[], unknown[], unknown[]] }) => {
        expect(args.functionName).toBe("openMany");
        expect(args.args[2]).toHaveLength(args.args[1].length);
        batches.push(args.args[1]);
        return { request: args };
      },
      waitForTransactionReceipt: async () => receipt("success"),
    } as unknown as PublicClient;
    const { walletClient } = wallet();

    const sent = await openRemaining({ publicClient, walletClient, chain, deployment }, 1n);

    const sealedSlots = Array.from({ length: bidCount }, (_, slot) => slot).filter((slot) => !isOpened(slot));
    expect(peak).toBeLessThanOrEqual(READ_CHUNK);
    expect(batches.flat()).toEqual(sealedSlots);
    expect(batches.every((batch) => batch.length > 0 && batch.length <= OPEN_BATCH)).toBe(true);
    expect(sent).toBe(Math.ceil(sealedSlots.length / OPEN_BATCH));
    expect(batches).toHaveLength(sent);
  });

  it("sends nothing when every bid is already open", async () => {
    const publicClient = {
      readContract: async ({ functionName }: { functionName: string }) => {
        if (functionName === "getAuction") return { bidCount: 3, pairA: 0, pairB: 1 };
        if (functionName === "publishedKeysOf") return [7n, 11n, 0n] as const;
        return { ephemeral: mulBase(1n), opened: true };
      },
      simulateContract: vi.fn(),
    } as unknown as PublicClient;
    expect(await openRemaining({ publicClient, walletClient: wallet().walletClient, chain, deployment }, 1n)).toBe(0);
  });
});
