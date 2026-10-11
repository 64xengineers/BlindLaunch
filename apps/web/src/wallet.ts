import {
  createPublicClient,
  createWalletClient,
  custom,
  encodeAbiParameters,
  http,
  keccak256,
  type Address,
  type Hash,
  type PublicClient,
  type WalletClient,
} from "viem";
import { auctionAbi, erc20Abi } from "./abi";
import { auctionAddress, chainIdHex, monadTestnet } from "./config";

export const publicClient: PublicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(monadTestnet.rpcUrls.default.http[0]),
});

export function hashBid(
  auctionId: bigint,
  bidder: Address,
  priceStep: number,
  quantity: bigint,
  salt: `0x${string}`,
): Hash {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "uint256" },
        { type: "address" },
        { type: "uint32" },
        { type: "uint256" },
        { type: "bytes32" },
      ],
      [auctionId, bidder, priceStep, quantity, salt],
    ),
  );
}

export function randomSalt(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${[...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function saltKey(auctionId: string, account: string): string {
  return `blindlaunch:salt:${auctionId}:${account.toLowerCase()}`;
}

async function ensureMonad(): Promise<void> {
  const ethereum = window.ethereum;
  if (!ethereum) {
    throw new Error("Install MetaMask, then refresh this page.");
  }
  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex }],
    });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? error.code : undefined;
    if (code !== 4902) {
      throw error;
    }
    await ethereum.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: chainIdHex,
          chainName: "Monad Testnet",
          nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
          rpcUrls: ["https://testnet-rpc.monad.xyz"],
          blockExplorerUrls: ["https://testnet.monadscan.com"],
        },
      ],
    });
  }
}

export async function connectWallet(): Promise<Address> {
  const ethereum = window.ethereum;
  if (!ethereum) {
    throw new Error("Install MetaMask, then refresh this page.");
  }
  try {
    await ethereum.request({
      method: "wallet_requestPermissions",
      params: [{ eth_accounts: {} }],
    });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? error.code : undefined;
    if (code === 4001) {
      throw new Error("Account selection was cancelled.");
    }
  }
  const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
  const account = accounts[0];
  if (!account) {
    throw new Error("No wallet account was selected.");
  }
  await ensureMonad();
  return account as Address;
}

export async function currentChainId(): Promise<number | null> {
  const ethereum = window.ethereum;
  if (!ethereum) {
    return null;
  }
  const chainId = (await ethereum.request({ method: "eth_chainId" })) as string;
  return Number(chainId);
}

function walletClient(account: Address): WalletClient {
  const ethereum = window.ethereum;
  if (!ethereum) {
    throw new Error("Install MetaMask, then refresh this page.");
  }
  return createWalletClient({
    account,
    chain: monadTestnet,
    transport: custom(ethereum),
  });
}

export async function writeContract(
  account: Address,
  args: {
    address: Address;
    abi: typeof auctionAbi | typeof erc20Abi;
    functionName: string;
    args: readonly unknown[];
  },
): Promise<Hash> {
  const hash = await walletClient(account).writeContract({
    ...args,
    account,
    chain: monadTestnet,
  } as never);
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function ensureTokenBalance(
  account: Address,
  token: Address,
  amount: bigint,
): Promise<void> {
  const balance = await publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account],
  });
  if (balance >= amount) {
    return;
  }
  await writeContract(account, {
    address: token,
    abi: erc20Abi,
    functionName: "mint",
    args: [account, amount - balance],
  });
}

export async function ensureAllowance(
  account: Address,
  token: Address,
  amount: bigint,
): Promise<void> {
  const allowed = await publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [account, auctionAddress],
  });
  if (allowed >= amount) {
    return;
  }
  await writeContract(account, {
    address: token,
    abi: erc20Abi,
    functionName: "approve",
    args: [auctionAddress, amount],
  });
}

export { auctionAbi };
