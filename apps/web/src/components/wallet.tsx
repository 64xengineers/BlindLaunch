import { useEffect, useState } from "react";
import { formatEther } from "viem";
import { useSession } from "../auth/session";
import { publicClient } from "../chain/clients";
import { network } from "../chain/config";
import { shortAddress } from "../chain/format";
import { friendlyError } from "../state/errors";
import { useToast } from "../state/hooks";
import { CopyButton } from "./ui";

export function useBalance(): string {
  const { signer } = useSession();
  const [balance, setBalance] = useState("");
  useEffect(() => {
    if (!signer) {
      setBalance("");
      return;
    }
    let cancelled = false;
    const load = () => publicClient.getBalance({ address: signer.address }).then((wei) => !cancelled && setBalance(formatEther(wei))).catch(() => {});
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [signer]);
  return balance;
}

export function WalletPicker({ onClose }: { onClose: () => void }) {
  const { signer, wallets, connectWallet, signInWithPasskey, disconnect } = useSession();
  const { notify } = useToast();
  const balance = useBalance();
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function attempt(label: string, action: () => Promise<void>) {
    setPending(label);
    try {
      await action();
      onClose();
    } catch (error) {
      notify(friendlyError(error), "error");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Wallet" onClick={onClose}>
      <div className="glass toast w-full max-w-md p-5 sm:p-6" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">{signer ? "Your account" : "Connect"}</h2>
          <button type="button" className="min-h-11 px-2 text-lilac hover:text-paper" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        {signer ? (
          <div className="mt-4 grid gap-3 text-sm">
            <div className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.04] px-3 py-2">
              <span className="font-mono text-paper">{shortAddress(signer.address)}</span>
              <CopyButton value={signer.address} />
            </div>
            <p className="text-mist">
              {signer.kind === "passkey" ? "Signed in with a passkey. Your key exists only in memory and is recreated from the passkey next time." : `Connected with ${signer.wallet.info.name}.`}
            </p>
            <p className="text-mist">Balance: <span className="font-mono text-paper">{balance ? Number(balance).toFixed(4) : "…"} MON</span></p>
            {signer.kind === "passkey" && balance !== "" && Number(balance) === 0 ? (
              <p className="rounded-xl border border-amber/40 bg-amber/10 p-3 text-paper">
                This account needs MON for gas.{" "}
                {network.faucet ? <a className="text-amber" href={network.faucet} target="_blank" rel="noreferrer">Get some from the faucet</a> : "Send it some MON"}{" "}
                and paste the address above.
              </p>
            ) : null}
            <button type="button" className="btn-secondary min-h-11" onClick={() => { disconnect(); onClose(); }}>Disconnect</button>
          </div>
        ) : (
          <div className="mt-4 grid gap-2">
            {wallets.map((wallet) => (
              <button
                key={wallet.info.rdns}
                type="button"
                className="flex min-h-12 items-center gap-3 rounded-xl border border-white/15 bg-white/[0.04] px-4 text-left text-paper transition-colors hover:border-lavender hover:bg-white/10"
                disabled={pending !== null}
                onClick={() => void attempt(wallet.info.name, () => connectWallet(wallet.info.rdns))}
              >
                {wallet.info.icon ? <img src={wallet.info.icon} alt="" className="h-6 w-6 rounded" /> : <span className="h-6 w-6 rounded bg-white/10" />}
                <span className="flex-1">{wallet.info.name}</span>
                {pending === wallet.info.name ? <span className="text-xs text-lilac">Check your wallet…</span> : null}
              </button>
            ))}
            {wallets.length === 0 ? <p className="text-sm text-lilac">No browser wallet found. Use a passkey instead, or install a wallet.</p> : null}
            <div className="my-2 h-px bg-white/10" />
            <p className="text-sm text-mist">No wallet? Use Face ID, Touch ID or your device PIN. No seed phrase.</p>
            <button type="button" className="btn-primary min-h-12" disabled={pending !== null} onClick={() => void attempt("passkey", () => signInWithPasskey("signIn"))}>
              <span className="relative z-10">{pending === "passkey" ? "Waiting for your passkey…" : "Sign in with a passkey"}</span>
            </button>
            <button type="button" className="btn-secondary min-h-11" disabled={pending !== null} onClick={() => void attempt("create", () => signInWithPasskey("create"))}>
              {pending === "create" ? "Creating…" : "Create a passkey account"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
