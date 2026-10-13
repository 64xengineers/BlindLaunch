import type { EIP1193Provider } from "viem";

export type WalletInfo = { uuid: string; name: string; icon: string; rdns: string };
export type WalletOption = { info: WalletInfo; provider: EIP1193Provider };

/**
 * EIP-6963 wallet discovery: every installed wallet announces itself, deduplicated by `rdns`, so
 * one extension cannot silently take over `window.ethereum` from another.
 */
export function createWalletDiscovery(target: EventTarget, legacy?: EIP1193Provider) {
  const wallets = new Map<string, WalletOption>();
  const listeners = new Set<() => void>();
  let snapshot: WalletOption[] = [];

  const refresh = () => {
    snapshot = [...wallets.values()];
    if (snapshot.length === 0 && legacy) {
      snapshot = [{ info: { uuid: "legacy", name: "Browser wallet", icon: "", rdns: "injected" }, provider: legacy }];
    }
    listeners.forEach((listener) => listener());
  };

  const onAnnounce = (event: Event) => {
    const detail = (event as CustomEvent<WalletOption>).detail;
    if (!detail?.info?.rdns || !detail.provider) return;
    wallets.set(detail.info.rdns, { info: detail.info, provider: detail.provider });
    refresh();
  };

  target.addEventListener("eip6963:announceProvider", onAnnounce);
  refresh();
  target.dispatchEvent(new Event("eip6963:requestProvider"));

  return {
    list: () => snapshot,
    find: (rdns: string) => snapshot.find((wallet) => wallet.info.rdns === rdns),
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    stop: () => target.removeEventListener("eip6963:announceProvider", onAnnounce),
  };
}
