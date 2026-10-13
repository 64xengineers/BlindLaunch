import { parseDeployment, type Deployment } from "@blindlaunch/abi";
import { defineChain, getAddress, type Address, type Chain } from "viem";

export type NetworkName = "local" | "testnet" | "mainnet";

export type Network = {
  name: NetworkName;
  label: string;
  chain: Chain;
  rpcUrl: string;
  explorer: string | null;
  faucet: string | null;
  /** Kuru's trading app, where launched tokens trade. None on a local chain. */
  kuruApp: string | null;
  /** On Monad mainnet only Kuru may create a market, so a launch seeds into the market Kuru lists (`seedInto`). */
  onlyKuruCreatesMarkets: boolean;
  deployment: Deployment | null;
  /** Quote tokens the Create page offers. A quote token the authority controls could withhold refunds. */
  quoteTokens: Address[];
};

const MAINNET_USDC = getAddress("0x754704Bc059F8C67012fEd69BC8A327a5aafb603");

const files = import.meta.glob<unknown>("../../../../deployments/*.json", { eager: true, import: "default" });

export function deploymentFor(chainId: number, available: Record<string, unknown> = files): Deployment | null {
  const entry = Object.entries(available).find(([path]) => path.endsWith(`/${chainId}.json`));
  return entry ? parseDeployment(entry[1]) : null;
}

const definitions = {
  local: { id: 31337, label: "Local anvil", rpcUrl: "http://127.0.0.1:8545", explorer: null, faucet: null },
  testnet: {
    id: 10143,
    label: "Monad testnet",
    rpcUrl: "https://testnet-rpc.monad.xyz",
    explorer: "https://testnet.monadscan.com",
    faucet: "https://faucet.monad.xyz",
  },
  mainnet: { id: 143, label: "Monad", rpcUrl: "https://rpc.monad.xyz", explorer: "https://monadscan.com", faucet: null },
} as const;

export function networkFor(name: NetworkName, available: Record<string, unknown> = files, rpcOverride?: string): Network {
  const definition = definitions[name];
  const rpcUrl = rpcOverride ?? definition.rpcUrl;
  const chain = defineChain({
    id: definition.id,
    name: definition.label,
    nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
    contracts: name === "local" ? undefined : { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
    ...(definition.explorer ? { blockExplorers: { default: { name: "Monadscan", url: definition.explorer } } } : {}),
  });
  const deployment = deploymentFor(definition.id, available);
  const quoteTokens = name === "mainnet" ? [MAINNET_USDC] : deployment ? [deployment.quote] : [];
  const kuruApp = name === "local" ? null : "https://www.kuru.io";
  const onlyKuruCreatesMarkets = name === "mainnet";
  return { name, label: definition.label, chain, rpcUrl, explorer: definition.explorer, faucet: definition.faucet, kuruApp, onlyKuruCreatesMarkets, deployment, quoteTokens };
}

function selected(): NetworkName {
  const value = import.meta.env.VITE_CHAIN as string | undefined;
  if (value === "local" || value === "testnet" || value === "mainnet") return value;
  return import.meta.env.DEV ? "local" : "testnet";
}

export const network: Network = networkFor(selected(), files, import.meta.env.VITE_RPC_URL as string | undefined);

export function explorerUrl(kind: "address" | "tx", value: string): string | null {
  return network.explorer ? `${network.explorer}/${kind}/${value}` : null;
}
