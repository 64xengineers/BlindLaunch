import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { blindAuctionV2Abi, keeperRegistryAbi, parseDeployment, type Deployment } from "@blindlaunch/abi";
import { mulBase } from "@blindlaunch/sealed-bid";
import { createPublicClient, createTestClient, createWalletClient, defineChain, erc20Abi, http, toHex, type Abi, type Address } from "viem";
import { mnemonicToAccount, type HDAccount } from "viem/accounts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultForm, planAuction, START_BUFFER, toCreateParams } from "../src/chain/create";
import { bidProblem, phaseOf, publicActions } from "../src/chain/model";
import {
  callAuction,
  createAuction,
  createToken,
  ensureAllowance,
  mintTestQuote,
  openRemaining,
  placeBid,
  seedCall,
  type Writer,
} from "../src/state/actions";
import { friendlyError } from "../src/state/errors";

const here = fileURLToPath(new URL(".", import.meta.url));
const contractsDir = resolve(here, "../../../contracts");
const port = 19_545 + Math.floor(Math.random() * 1_000);
const rpc = `http://127.0.0.1:${port}`;
const accounts: HDAccount[] = Array.from({ length: 10 }, (_, addressIndex) =>
  mnemonicToAccount("test test test test test test test test test test test junk", { addressIndex }),
);
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
const chain = defineChain({ id: 31337, name: "anvil", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
const publicClient = createPublicClient({ chain, transport: http(rpc) });
const testClient = createTestClient({ chain, mode: "anvil", transport: http(rpc) });
const keeperSecrets = [101n, 202n, 303n];

let anvil: ChildProcess | undefined;
let deployment: Deployment;

function writer(account: HDAccount): Writer {
  return { publicClient, walletClient: createWalletClient({ account, chain, transport: http(rpc) }), chain, deployment };
}

async function warp(seconds: bigint) {
  await testClient.increaseTime({ seconds: Number(seconds) });
  await testClient.mine({ blocks: 1 });
}

async function raw(account: HDAccount, address: Address, abi: Abi, functionName: string, args: readonly unknown[]) {
  const hash = await writer(account).walletClient.writeContract({ address, abi, functionName, args } as never);
  expect((await publicClient.waitForTransactionReceipt({ hash })).status).toBe("success");
}

const balance = (token: Address, owner: Address) =>
  publicClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner] });
const auctionOf = (id: bigint) =>
  publicClient.readContract({ address: deployment.auction, abi: blindAuctionV2Abi, functionName: "getAuction", args: [id] });
const chainTime = async () => (await publicClient.getBlock()).timestamp;

describe.skipIf(!hasFoundry)("web actions end to end on anvil (3.9)", () => {
  beforeAll(async () => {
    anvil = spawn("anvil", ["--port", String(port), "--chain-id", "31337", "--silent"], { stdio: "ignore" });
    for (let attempt = 0; ; attempt += 1) {
      try {
        await publicClient.getChainId();
        break;
      } catch (error) {
        if (attempt > 100) throw error;
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    execFileSync("forge", ["script", "script/LocalStack.s.sol:LocalStack", "--sig", "runLocal()", "--rpc-url", rpc, "--broadcast", "--slow"], {
      cwd: contractsDir,
      stdio: "ignore",
      env: {
        ...process.env,
        MONAD_PRIVATE_KEY: toHex(accounts[0]!.getHdKey().privateKey!),
        KEEPER0_OWNER: accounts[1]!.address,
        KEEPER1_OWNER: accounts[2]!.address,
        KEEPER2_OWNER: accounts[3]!.address,
      },
    });
    deployment = parseDeployment(JSON.parse(readFileSync(resolve(contractsDir, "../deployments/31337.json"), "utf8")));
    for (const [index, secret] of keeperSecrets.entries()) {
      await raw(accounts[index + 1]!, deployment.registry, keeperRegistryAbi as Abi, "enqueue", [index, [mulBase(secret)]]);
    }
  }, 180_000);

  afterAll(() => anvil?.kill());

  it("creates, bids, opens, settles, seeds, claims, reclaims and unwinds through the UI's actions", async () => {
    const authority = accounts[4]!;
    const author = writer(authority);
    const token = await createToken(author, { name: "Web Moon", symbol: "WMOON", decimals: 18, supply: 2_000n * TOKEN });

    const { plan, errors } = planAuction(
      { ...defaultForm, supplyTokens: "1000", deposit: "1000", biddingMinutes: "2", cancelGapMinutes: "10" },
      { saleToken: token, saleDecimals: 18, quoteToken: deployment.quote, quoteDecimals: 6, allowedQuotes: [deployment.quote], balance: 2_000n * TOKEN },
    );
    expect(errors).toEqual({});
    expect(await ensureAllowance(author, token, plan!.supply)).toBe(true);
    expect(await ensureAllowance(author, token, plan!.supply)).toBe(false);
    const id = await createAuction(author, toCreateParams(plan!, token, deployment.quote, await chainTime()));
    await warp(START_BUFFER + 1n);

    const opened = await auctionOf(id);
    expect(phaseOf(opened, await chainTime())).toBe("bidding");
    expect(bidProblem(opened, { account: authority.address, alreadyBid: false, now: await chainTime(), step: 0, lots: 1n })).toMatch(/creator/);

    const book: [HDAccount, number, bigint][] = [[accounts[5]!, 5, 300n], [accounts[6]!, 3, 250n], [accounts[7]!, 0, 200n]];
    for (const [bidder, step, lots] of book) {
      await mintTestQuote(writer(bidder), 1_000n * USD);
      const record = await placeBid(writer(bidder), id, step, lots);
      expect(record).toMatchObject({ auctionId: id, step, lots });
    }
    await mintTestQuote(writer(accounts[5]!), 1_000n * USD);
    await expect(placeBid(writer(accounts[5]!), id, 1, 1n).catch((error) => Promise.reject(new Error(friendlyError(error))))).rejects.toThrow(
      /already sealed/,
    );

    await warp(121n);
    expect(phaseOf(await auctionOf(id), await chainTime())).toBe("awaitingKeys");
    await raw(accounts[9]!, deployment.auction, blindAuctionV2Abi as Abi, "publishKey", [id, 0, keeperSecrets[0]]);
    await raw(accounts[9]!, deployment.auction, blindAuctionV2Abi as Abi, "publishKey", [id, 2, keeperSecrets[2]]);
    expect(publicActions(phaseOf(await auctionOf(id), await chainTime()))).toEqual(["openRemaining"]);

    expect(await openRemaining(writer(accounts[5]!), id)).toBe(1);
    expect(publicActions(phaseOf(await auctionOf(id), await chainTime()))).toEqual(["settle"]);
    await callAuction(writer(accounts[6]!), "settle", id);
    await callAuction(writer(accounts[8]!), "handOffSeed", id);

    const settled = await auctionOf(id);
    expect(settled.clearingPrice).toBe(2_500_000n);
    expect(settled.totalSold).toBe(750n);
    expect(settled.seedState).toBe(2);

    for (const [bidder, , lots] of book) {
      const tokensBefore = await balance(token, bidder.address);
      const quoteBefore = await balance(deployment.quote, bidder.address);
      await callAuction(writer(bidder), "claim", id);
      expect((await balance(token, bidder.address)) - tokensBefore).toBe(lots * TOKEN);
      expect((await balance(deployment.quote, bidder.address)) - quoteBefore).toBe(1_000n * USD - 2_500_000n * lots);
    }

    await callAuction(author, "reclaim", id);
    expect(await balance(deployment.quote, authority.address)).toBe(1_500n * USD); // 1,875 proceeds − 375 seeded
    await warp(settled.seedLockUntil - (await chainTime()) + 1n);
    await seedCall(writer(accounts[8]!), "unwind", id);
    expect(await balance(deployment.quote, authority.address)).toBe(1_875n * USD);
    expect(await balance(token, authority.address)).toBe(2_000n * TOKEN - 750n * TOKEN);
    expect(await balance(token, deployment.auction)).toBe(0n);
    expect(await balance(deployment.quote, deployment.auction)).toBe(0n); // the rejected second bid never took a deposit
  }, 240_000);
});
