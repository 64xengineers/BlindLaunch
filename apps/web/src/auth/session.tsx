import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { createWalletClient, custom, http, numberToHex, type Address, type EIP1193Provider, type WalletClient } from "viem";
import { publicClient } from "../chain/clients";
import { network } from "../chain/config";
import type { Writer } from "../state/actions";
import { createWalletDiscovery, type WalletOption } from "./eip6963";
import { passkeyAccount, passkeyVaultKey, type PasskeySession } from "./mera";

export type Signer =
  | { kind: "injected"; address: Address; walletClient: WalletClient; wallet: WalletOption }
  | { kind: "passkey"; address: Address; walletClient: WalletClient; session: PasskeySession };

type SessionValue = {
  signer: Signer | null;
  wallets: WalletOption[];
  wrongChain: boolean;
  connectWallet: (rdns: string) => Promise<void>;
  signInWithPasskey: (mode: "create" | "signIn") => Promise<void>;
  disconnect: () => void;
  /** A writer on the right chain. For injected wallets it asks to switch networks first. */
  writer: () => Promise<Writer>;
  /** The passkey vault key, or null for injected wallets. Prompts once per session. */
  vaultKey: () => Promise<CryptoKey | null>;
};

const WALLET_KEY = "blindlaunch:v2:wallet";
const discovery = typeof window === "undefined" ? null : createWalletDiscovery(window, window.ethereum);
const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}

async function ensureChain(provider: EIP1193Provider): Promise<void> {
  const current = Number(await provider.request({ method: "eth_chainId" }));
  if (current === network.chain.id) return;
  const chainId = numberToHex(network.chain.id);
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  } catch (error) {
    if ((error as { code?: number }).code !== 4902) throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId,
        chainName: network.label,
        nativeCurrency: network.chain.nativeCurrency,
        rpcUrls: [network.rpcUrl],
        ...(network.explorer ? { blockExplorerUrls: [network.explorer] } : {}),
      }],
    });
  }
}

function injectedSigner(wallet: WalletOption, address: Address): Signer {
  return {
    kind: "injected",
    address,
    wallet,
    walletClient: createWalletClient({ account: address, chain: network.chain, transport: custom(wallet.provider) }),
  };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const wallets = useSyncExternalStore(
    (listener) => discovery?.subscribe(listener) ?? (() => {}),
    () => discovery?.list() ?? [],
    () => [],
  );
  const [signer, setSigner] = useState<Signer | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [vault, setVault] = useState<CryptoKey | null>(null);

  // Silent reconnect: eth_accounts never opens a wallet prompt.
  useEffect(() => {
    if (signer) return;
    const rdns = localStorage.getItem(WALLET_KEY);
    const wallet = rdns ? discovery?.find(rdns) : undefined;
    if (!wallet) return;
    void (wallet.provider.request({ method: "eth_accounts" }) as Promise<Address[]>).then((accounts) => {
      if (accounts[0]) setSigner(injectedSigner(wallet, accounts[0]));
    });
  }, [wallets, signer]);

  // Follow account and network changes in the active wallet.
  useEffect(() => {
    if (signer?.kind !== "injected") {
      setChainId(null);
      return;
    }
    const { provider } = signer.wallet;
    const onAccounts = (accounts: Address[]) => setSigner(accounts[0] ? injectedSigner(signer.wallet, accounts[0]) : null);
    const onChain = (id: string) => setChainId(Number(id));
    void (provider.request({ method: "eth_chainId" }) as Promise<string>).then(onChain);
    provider.on("accountsChanged", onAccounts);
    provider.on("chainChanged", onChain);
    return () => {
      provider.removeListener("accountsChanged", onAccounts);
      provider.removeListener("chainChanged", onChain);
    };
  }, [signer]);

  const connectWallet = useCallback(async (rdns: string) => {
    const wallet = discovery?.find(rdns);
    if (!wallet) throw new Error("That wallet is not available in this browser.");
    const accounts = (await wallet.provider.request({ method: "eth_requestAccounts" })) as Address[];
    if (!accounts[0]) throw new Error("The wallet returned no account.");
    await ensureChain(wallet.provider);
    localStorage.setItem(WALLET_KEY, rdns);
    setSigner(injectedSigner(wallet, accounts[0]));
  }, []);

  const signInWithPasskey = useCallback(async (mode: "create" | "signIn") => {
    const session = await passkeyAccount(mode);
    localStorage.removeItem(WALLET_KEY);
    setVault(null);
    setSigner({
      kind: "passkey",
      address: session.account.address,
      session,
      walletClient: createWalletClient({ account: session.account, chain: network.chain, transport: http(network.rpcUrl) }),
    });
  }, []);

  const disconnect = useCallback(() => {
    if (signer?.kind === "passkey") signer.session.end();
    localStorage.removeItem(WALLET_KEY);
    setVault(null);
    setSigner(null);
  }, [signer]);

  const writer = useCallback(async (): Promise<Writer> => {
    if (!signer) throw new Error("Connect a wallet or sign in with a passkey first.");
    if (!network.deployment) throw new Error(`Blindlaunch is not deployed on ${network.label} yet.`);
    if (signer.kind === "injected") await ensureChain(signer.wallet.provider);
    return { publicClient, walletClient: signer.walletClient, chain: network.chain, deployment: network.deployment };
  }, [signer]);

  const vaultKey = useCallback(async () => {
    if (signer?.kind !== "passkey") return null;
    if (vault) return vault;
    const key = await passkeyVaultKey();
    setVault(key);
    return key;
  }, [signer, vault]);

  const value = useMemo<SessionValue>(
    () => ({
      signer,
      wallets,
      wrongChain: signer?.kind === "injected" && chainId !== null && chainId !== network.chain.id,
      connectWallet,
      signInWithPasskey,
      disconnect,
      writer,
      vaultKey,
    }),
    [signer, wallets, chainId, connectWallet, signInWithPasskey, disconnect, writer, vaultKey],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
