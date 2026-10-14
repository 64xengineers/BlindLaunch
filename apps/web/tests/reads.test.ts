import { blindAuctionV2Abi, parseDeployment } from "@blindlaunch/abi";
import {
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  HttpRequestError,
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionResult,
  erc20Abi,
  getAddress,
  multicall3Abi,
  toFunctionSelector,
  type Address,
  type Hex,
} from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createReadClient, RPC_BATCH_SIZE } from "../src/chain/clients";
import { networkFor } from "../src/chain/config";
import { shortAddress } from "../src/chain/format";
import { STATUS, type AuctionView } from "../src/chain/model";
import { BID_PAGE, contractRefused, createReads } from "../src/chain/reads";

const quote = getAddress("0x00000000000000000000000000000000000000a5");
const deployment = parseDeployment({
  chainId: 31337,
  deployBlock: 0,
  registry: "0x00000000000000000000000000000000000000a1",
  auction: "0x00000000000000000000000000000000000000a2",
  seeder: "0x00000000000000000000000000000000000000a3",
  factory: "0x00000000000000000000000000000000000000a4",
  quote,
});
const MULTICALL3 = "0xca11bde05977b3631167028862be2a173976ca11";
const account = (n: number) => getAddress(`0x${n.toString(16).padStart(40, "0")}`);

type RpcCall = { id: number; method: string; params: [{ to: Address; data: Hex }, ...unknown[]] };
type Answer = { result: Hex } | { error: { code: number; message: string; data?: Hex } };

/** A fake JSON-RPC endpoint behind `fetch` that records how many calls each HTTP request carried. */
function fakeRpc(answerCall: (to: Address, data: Hex) => Answer) {
  const batches: number[] = [];
  let ethCalls = 0;
  const answer = ({ id, method, params }: RpcCall) => {
    if (method !== "eth_call") return { jsonrpc: "2.0", id, error: { code: -32601, message: `unexpected ${method}` } };
    ethCalls += 1;
    const { to, data } = params[0];
    if (to.toLowerCase() !== MULTICALL3) return { jsonrpc: "2.0", id, ...answerCall(to, data) };
    const { args } = decodeFunctionData({ abi: multicall3Abi, data });
    const calls = args[0] as readonly { target: Address; callData: Hex }[];
    const results = calls.map(({ target, callData }) => {
      const one = answerCall(target, callData);
      return "result" in one ? { success: true, returnData: one.result } : { success: false, returnData: one.error.data ?? "0x" };
    });
    return { jsonrpc: "2.0", id, result: encodeFunctionResult({ abi: multicall3Abi, functionName: "aggregate3", result: results }) };
  };
  const fetch = vi.fn(async (_url: unknown, init: { body: string }) => {
    const body = JSON.parse(init.body) as RpcCall | RpcCall[];
    const calls = Array.isArray(body) ? body : [body];
    batches.push(calls.length);
    const out = Array.isArray(body) ? calls.map(answer) : answer(body);
    return new Response(JSON.stringify(out), { headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetch);
  return { batches, ethCalls: () => ethCalls };
}

/** balanceOf(account) answers the account read as a number, so every result is checkable. */
const balances = (_to: Address, data: Hex): Answer => {
  const { args } = decodeFunctionData({ abi: erc20Abi, data });
  return { result: encodeFunctionResult({ abi: erc20Abi, functionName: "balanceOf", result: BigInt(args[0] as Address) }) };
};

afterEach(() => vi.unstubAllGlobals());

describe("read client batching", () => {
  it("keeps each JSON-RPC batch within the public RPC's 50 calls and folds testnet reads into Multicall3", async () => {
    const rpc = fakeRpc(balances);
    const client = createReadClient(networkFor("testnet", {}).chain, "http://rpc.test");
    const owners = Array.from({ length: 1000 }, (_, i) => account(i + 1));
    const got = await Promise.all(owners.map((owner) => client.readContract({ address: quote, abi: erc20Abi, functionName: "balanceOf", args: [owner] })));
    expect(got).toEqual(owners.map((_, i) => BigInt(i + 1)));
    expect(Math.max(...rpc.batches)).toBeLessThanOrEqual(RPC_BATCH_SIZE);
    // 1,000 reads cost fewer calls than the public RPC allows in a second.
    expect(rpc.ethCalls()).toBeLessThanOrEqual(RPC_BATCH_SIZE);
  });

  it("splits batches on the local chain, which has no Multicall3", async () => {
    const rpc = fakeRpc(balances);
    const client = createReadClient(networkFor("local", {}).chain, "http://rpc.test");
    const owners = Array.from({ length: 120 }, (_, i) => account(i + 1));
    const got = await Promise.all(owners.map((owner) => client.readContract({ address: quote, abi: erc20Abi, functionName: "balanceOf", args: [owner] })));
    expect(got).toEqual(owners.map((_, i) => BigInt(i + 1)));
    expect(rpc.ethCalls()).toBe(120);
    expect(Math.max(...rpc.batches)).toBeLessThanOrEqual(RPC_BATCH_SIZE);
  });
});

describe("reads.bids", () => {
  it("reads every slot in order, a page at a time", async () => {
    let inFlight = 0;
    let peak = 0;
    const client = {
      readContract: async ({ args }: { args: readonly [bigint, number] }) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 0));
        inFlight -= 1;
        return { bidder: account(args[1] + 1) };
      },
    };
    const reads = createReads(client as never, deployment);
    const count = BID_PAGE * 2 + 7;
    const all = await reads.bids(1n, count);
    expect(all.map((bid) => bid.slot)).toEqual(Array.from({ length: count }, (_, slot) => slot));
    expect(all.every((bid) => bid.bidder === account(bid.slot + 1))).toBe(true);
    expect(peak).toBe(BID_PAGE);
  });
});

describe("token metadata a launch cannot give", () => {
  const odd = getAddress("0x00000000000000000000000000000000000000b6");
  const selector = (name: string) => toFunctionSelector(`${name}()`);
  const bytes32Name = encodeAbiParameters([{ type: "bytes32" }], ["0x4d4b520000000000000000000000000000000000000000000000000000000000"]);

  it("falls back to the short address when name or symbol reverts or does not decode", async () => {
    fakeRpc((_to, data) => {
      if (data === selector("name")) return { result: bytes32Name };
      if (data === selector("symbol")) return { error: { code: 3, message: "execution reverted", data: "0x" } };
      return { result: encodeFunctionResult({ abi: erc20Abi, functionName: "decimals", result: 18 }) };
    });
    const reads = createReads(createReadClient(networkFor("local", {}).chain, "http://rpc.test"), deployment);
    expect(await reads.token(odd)).toEqual({ address: odd, name: shortAddress(odd), symbol: shortAddress(odd), decimals: 18 });
  });

  it("counts a missing decimals() as the token refusing", async () => {
    fakeRpc(() => ({ result: "0x" }));
    const reads = createReads(createReadClient(networkFor("local", {}).chain, "http://rpc.test"), deployment);
    const error = await reads.token(odd).then(() => null, (e: unknown) => e);
    expect(contractRefused(error)).toBe(true);
  });

  const raw = (saleToken: Address) => ({ status: STATUS.Open, saleToken, quoteToken: quote });
  const refused = (functionName: "name" | "decimals") =>
    new ContractFunctionExecutionError(new ContractFunctionRevertedError({ abi: erc20Abi, functionName, message: "execution reverted" }), { abi: erc20Abi, functionName, contractAddress: odd });
  const sales: Record<string, Address> = { "1": account(0xb1), "2": odd, "3": account(0xb3) };

  it("skips a launch whose token cannot give decimals, so lists keep the others", async () => {
    const client = {
      readContract: async ({ functionName, address, args }: { functionName: string; address: Address; args?: readonly unknown[] }) => {
        if (functionName === "getAuction") return raw(sales[String(args![0])]);
        if (address === odd) throw refused(functionName === "decimals" ? "decimals" : "name");
        return functionName === "decimals" ? 6 : "Token";
      },
    };
    const reads = createReads(client as never, deployment);
    const launches = (await Promise.all([1n, 2n, 3n].map((id) => reads.auction(id)))).filter((a): a is AuctionView => a !== null);
    expect(launches.map((a) => a.id)).toEqual([1n, 3n]);
  });

  it("still throws on network trouble, without keeping a stand-in name", async () => {
    let down = true;
    const client = {
      readContract: async ({ functionName, args }: { functionName: string; args?: readonly unknown[] }) => {
        if (functionName === "getAuction") return raw(sales[String(args![0])]);
        if (down) throw new ContractFunctionExecutionError(new HttpRequestError({ url: "http://rpc.test", status: 429 }), { abi: erc20Abi, functionName, contractAddress: odd });
        return functionName === "decimals" ? 6 : "Real name";
      },
    };
    const reads = createReads(client as never, deployment);
    await expect(reads.auction(2n)).rejects.toThrow();
    down = false;
    expect((await reads.auction(2n))?.sale.name).toBe("Real name");
    expect(blindAuctionV2Abi.length).toBeGreaterThan(0);
  });
});
