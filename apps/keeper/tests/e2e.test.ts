import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  blindAuctionV2Abi,
  keeperRegistryAbi,
  marketSeederAbi,
  parseDeployment,
  testTokenAbi,
  tokenFactoryAbi,
  type Deployment,
} from "@blindlaunch/abi";
import { allocationOf, seal, settleOutcome, withPrefixes } from "@blindlaunch/sealed-bid";
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  defineChain,
  encodeAbiParameters,
  http,
  parseEventLogs,
  toHex,
  type Abi,
  type Address,
} from "viem";
import { mnemonicToAccount, type HDAccount } from "viem/accounts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createChainContext } from "../src/chain";
import { PUBLISH_STAGGER } from "../src/decide";
import { runPass, type Keeper } from "../src/keeper";
import { KeyStore } from "../src/keystore";

const here = fileURLToPath(new URL(".", import.meta.url));
const contractsDir = resolve(here, "../../../contracts");
const port = 18_545 + Math.floor(Math.random() * 1_000);
const rpc = `http://127.0.0.1:${port}`;
const accounts: HDAccount[] = Array.from({ length: 10 }, (_, addressIndex) =>
  mnemonicToAccount("test test test test test test test test test test test junk", { addressIndex }),
);
const keyOf = (account: HDAccount) => toHex(account.getHdKey().privateKey!);
const hasFoundry = (() => {
  try {
    execFileSync("anvil", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

const TOKEN = 10n ** 18n;
const USD = 10n ** 6n;
const chain = defineChain({
  id: 31337,
  name: "anvil",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
});
const publicClient = createPublicClient({ chain, transport: http(rpc) });
const testClient = createTestClient({ chain, mode: "anvil", transport: http(rpc) });

let anvil: ChildProcess | undefined;
let deployment: Deployment;
let keepers: Keeper[];
/** The keepers' host clock. Anvil time is warped, so the test keeps this at the latest block's time. */
let hostNow = 0n;

async function write(from: HDAccount, address: Address, abi: Abi, functionName: string, args: readonly unknown[]) {
  const wallet = createWalletClient({ account: from, chain, transport: http(rpc) });
  const hash = await wallet.writeContract({ address, abi, functionName, args } as never);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  expect(receipt.status, `${functionName} should succeed`).toBe("success");
  return receipt;
}

/** Anvil runs with one slot per epoch, so its finalized block is the one two blocks before latest. */
const FINALITY_LAG = 2;

async function mine(blocks: number) {
  await testClient.mine({ blocks });
  hostNow = (await publicClient.getBlock()).timestamp;
}

/** Moves chain time forward far enough that the finalized block, which keepers gate on, sees it. */
async function warp(seconds: number) {
  await testClient.increaseTime({ seconds });
  await mine(1 + FINALITY_LAG);
}

function auction(id: bigint) {
  return publicClient.readContract({ address: deployment.auction, abi: blindAuctionV2Abi, functionName: "getAuction", args: [id] });
}

const kuruParams = encodeAbiParameters(
  [
    { type: "uint96" }, { type: "uint32" }, { type: "uint32" }, { type: "uint96" },
    { type: "uint96" }, { type: "uint256" }, { type: "uint256" }, { type: "uint96" },
  ],
  [100_000_000n, 10_000, 10, 1_000_000n, 10_000_000_000_000_000n, 0n, 0n, 100n],
);

/** Creates a token and a seeded auction for it; returns the auction id. */
async function createAuction(supplyTokens: bigint) {
  const authority = accounts[4]!;
  const created = await write(authority, deployment.factory, tokenFactoryAbi as Abi, "createToken", [
    "E2E Moon", "EMOON", 18, supplyTokens * TOKEN, authority.address,
  ]);
  const [tokenCreated] = parseEventLogs({ abi: tokenFactoryAbi, logs: created.logs, eventName: "TokenCreated" });
  const token = tokenCreated!.args.token;
  await write(authority, token, testTokenAbi as Abi, "approve", [deployment.auction, supplyTokens * TOKEN]);

  const now = (await publicClient.getBlock()).timestamp;
  const commitStart = now + 10n;
  const commitDeadline = commitStart + 120n;
  const cancelAfter = commitDeadline + 3_600n;
  const receipt = await write(authority, deployment.auction, blindAuctionV2Abi as Abi, "createAuction", [{
    saleToken: token,
    quoteToken: deployment.quote,
    supply: supplyTokens * TOKEN,
    lotSize: TOKEN,
    minPrice: 2_500_000n,
    stepSize: 100_000n,
    stepCount: 6,
    deposit: 10_000n * USD,
    maxNotional: 10_000n * USD,
    maxBids: 10_000,
    commitStart,
    commitDeadline,
    cancelAfter,
    seedSaleLots: 100n,
    seedQuoteBps: 2_000,
    seedLockUntil: cancelAfter + 86_400n,
    kuruParams,
  }]);
  const [event] = parseEventLogs({ abi: blindAuctionV2Abi, logs: receipt.logs, eventName: "AuctionCreated" });
  await warp(10);
  return event!.args.auctionId;
}

async function bid(id: bigint, bidder: HDAccount, step: number, quantity: bigint) {
  const keeperKeys = await publicClient.readContract({
    address: deployment.auction, abi: blindAuctionV2Abi, functionName: "keeperKeysOf", args: [id],
  });
  const sealed = seal({
    chainId: 31337n, contract: deployment.auction, auctionId: id, bidder: bidder.address, step, quantity, keeperKeys,
  });
  await write(bidder, deployment.quote, testTokenAbi as Abi, "mint", [bidder.address, 10_000n * USD]);
  await write(bidder, deployment.quote, testTokenAbi as Abi, "approve", [deployment.auction, 10_000n * USD]);
  await write(bidder, deployment.auction, blindAuctionV2Abi as Abi, "commit", [id, sealed.R, sealed.c, sealed.h]);
}

describe.skipIf(!hasFoundry)("keeper end to end on anvil", () => {
  beforeAll(async () => {
    anvil = spawn("anvil", ["--port", String(port), "--chain-id", "31337", "--slots-in-an-epoch", "1", "--silent"], {
      stdio: "ignore",
    });
    for (let attempt = 0; ; attempt += 1) {
      try {
        await publicClient.getChainId();
        break;
      } catch (error) {
        if (attempt > 100) throw error;
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    execFileSync(
      "forge",
      ["script", "script/LocalStack.s.sol:LocalStack", "--sig", "runLocal()", "--rpc-url", rpc, "--broadcast", "--slow"],
      {
        cwd: contractsDir,
        stdio: "ignore",
        env: {
          ...process.env,
          MONAD_PRIVATE_KEY: keyOf(accounts[0]!),
          KEEPER0_OWNER: accounts[1]!.address,
          KEEPER1_OWNER: accounts[2]!.address,
          KEEPER2_OWNER: accounts[3]!.address,
        },
      },
    );
    deployment = parseDeployment(JSON.parse(readFileSync(resolve(contractsDir, "../deployments/31337.json"), "utf8")));
    const dir = mkdtempSync(join(tmpdir(), "keeper-e2e-"));
    keepers = ([0, 1, 2] as const).map((index) => ({
      chain: createChainContext({ rpcUrl: rpc, privateKey: keyOf(accounts[index + 1]!), deployment }),
      store: new KeyStore(join(dir, `keeper${index}.json`)),
      index,
      queueTarget: 3,
      log: () => {},
      clock: () => hostNow,
    }));
  }, 180_000);

  afterAll(() => {
    anvil?.kill();
  });

  it("fills each keeper's key queue once (K2)", async () => {
    for (const keeper of keepers) {
      expect((await runPass(keeper)).sent).toEqual(["enqueue"]);
      expect((await runPass(keeper)).sent).toEqual([]);
      const available = await publicClient.readContract({
        address: deployment.registry, abi: keeperRegistryAbi, functionName: "available", args: [keeper.index],
      });
      expect(available).toBe(3n);
      expect(keeper.store.size()).toBe(3);
    }
  }, 60_000);

  it("settles, seeds the market and matches the TypeScript clearing without manual calls (K3, K5, K7, K8)", async () => {
    const id = await createAuction(1_200n);
    const book: [number, bigint][] = [[5, 300n], [3, 250n], [1, 300n], [0, 200n], [2, 100n]];
    for (const [i, [step, quantity]] of book.entries()) await bid(id, accounts[5 + i]!, step, quantity);

    // Before the deadline by chain time, nobody publishes.
    expect((await runPass(keepers[0]!)).sent).not.toContain("publishKey");
    expect((await auction(id)).publishedCount).toBe(0);

    // Past the deadline only in the latest (on Monad, speculative) block: still nobody publishes.
    await testClient.increaseTime({ seconds: 121 });
    await mine(1);
    const finalized = await publicClient.getBlock({ blockTag: "finalized" });
    expect(finalized.timestamp).toBeLessThan((await auction(id)).commitDeadline);
    expect((await runPass(keepers[0]!)).sent).not.toContain("publishKey");

    await mine(FINALITY_LAG);
    expect((await runPass(keepers[0]!)).sent).toContain("publishKey");
    await warp(Number(PUBLISH_STAGGER) * 2); // keeper 2 publishes last
    const second = await runPass(keepers[2]!);
    expect(second.sent).toEqual(expect.arrayContaining(["publishKey", "openMany", "settle", "handOffSeed"]));

    const a = await auction(id);
    expect(a.status).toBe(2);
    expect([a.pairA, a.pairB]).toEqual([0, 2]);
    expect(a.seedState).toBe(2);
    const position = await publicClient.readContract({
      address: deployment.seeder, abi: marketSeederAbi, functionName: "positionOf", args: [id],
    });
    expect(position.seeded).toBe(true);

    const counted = withPrefixes(book.map(([step, quantity]) => ({ counted: true, step, quantity })));
    const demand = Array.from({ length: 6 }, () => 0n);
    for (const b of counted) demand[b.step] = (demand[b.step] ?? 0n) + b.quantity;
    const outcome = settleOutcome(demand, 1_200n, { minPrice: 2_500_000n, stepSize: 100_000n, stepCount: 6 });
    expect(a.clearingPrice).toBe(outcome.clearingPrice);
    expect(a.totalSold).toBe(outcome.totalSold);
    for (const [i, b] of counted.entries()) {
      const onChain = await publicClient.readContract({
        address: deployment.auction, abi: blindAuctionV2Abi, functionName: "allocationOf", args: [id, accounts[5 + i]!.address],
      });
      expect(onChain).toBe(allocationOf(b, outcome));
    }
  }, 120_000);

  it("a second pass by every keeper sends nothing (K4, K9)", async () => {
    for (const keeper of keepers) await runPass(keeper); // keeper 1 refills the key its auction used
    for (const keeper of keepers) expect((await runPass(keeper)).sent).toEqual([]);
  }, 60_000);

  it("cancels and refunds in full when only one keeper publishes before cancelAfter (K10)", async () => {
    const id = await createAuction(1_000n);
    const bidder = accounts[5]!;
    await bid(id, bidder, 2, 50n);
    await warp(121 + Number(PUBLISH_STAGGER)); // keeper 1 publishes one stagger after the deadline
    expect((await runPass(keepers[1]!)).sent).toContain("publishKey");
    await warp(3_600);
    expect((await runPass(keepers[1]!)).sent).toContain("cancel");
    expect((await auction(id)).status).toBe(3);

    const before = await publicClient.readContract({
      address: deployment.quote, abi: testTokenAbi, functionName: "balanceOf", args: [bidder.address],
    });
    await write(bidder, deployment.auction, blindAuctionV2Abi as Abi, "claimRefund", [id, bidder.address]);
    const after = await publicClient.readContract({
      address: deployment.quote, abi: testTokenAbi, functionName: "balanceOf", args: [bidder.address],
    });
    expect(after - before).toBe(10_000n * USD);
  }, 120_000);

  it("recovers from a transaction that was broadcast but never mined, instead of leaving a nonce gap", async () => {
    const keeper = keepers[0]!;
    const address = keeper.chain.account.address;
    const nonce = await publicClient.getTransactionCount({ address });
    // As if the keeper's last transaction had been dropped: the chain is one nonce behind what it used.
    await testClient.setNonce({ address, nonce: nonce - 1 });
    await keeper.chain.send({ address: deployment.registry, abi: keeperRegistryAbi as Abi, functionName: "skip", args: [0, 0n] });
    await keeper.chain.send({ address: deployment.registry, abi: keeperRegistryAbi as Abi, functionName: "skip", args: [0, 0n] });
    expect(await publicClient.getTransactionCount({ address })).toBe(nonce + 1);
  }, 30_000);
});
