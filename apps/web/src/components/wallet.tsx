import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatEther } from "viem";
import { useSession } from "../auth/session";
import { publicClient } from "../chain/clients";
import { network } from "../chain/config";
import { shortAddress } from "../chain/format";
import { friendlyError } from "../state/errors";
import { CopyButton, Hush, Icon, SecondaryButton, Sticker } from "./ui";

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

const FOCUSABLE = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * Where Tab (or Shift+Tab) should move focus so it never leaves the dialog; null lets the browser
 * move it. Focus outside the dialog (for example on <body> after the focused button was swapped out
 * when a sign-in started) is pulled back in.
 */
export function trapTab<T>(items: readonly T[], active: T | null, dialog: T, inside: boolean, back: boolean): T | null {
  const first = items[0];
  const last = items[items.length - 1];
  if (first === undefined || last === undefined) return dialog;
  if (!inside) return back ? last : first;
  if (back) return active === first || active === dialog ? last : null;
  return active === last ? first : null;
}

/** The Connect modal: a passkey (no app needed) or a browser wallet; when signed in, the account and Disconnect. */
export function WalletPicker({ onClose, title }: { onClose: () => void; title?: string }) {
  const { signer, wallets, connectWallet, signInWithPasskey, disconnect } = useSession();
  const balance = useBalance();
  const [pending, setPending] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const dialog = useRef<HTMLDivElement>(null);

  // Focus moves into the dialog and returns to whatever opened it.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.focus();
    return () => opener?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !dialog.current) return;
      const items = Array.from(dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const target = trapTab(items, active, dialog.current, dialog.current.contains(active), event.shiftKey);
      if (!target) return;
      event.preventDefault();
      target.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Starting a sign-in swaps the focused button out; keep focus inside the dialog when that happens.
  useEffect(() => {
    const box = dialog.current;
    if (box && !box.contains(document.activeElement)) box.focus();
  }, [pending, problem, signer]);

  async function attempt(label: string, action: () => Promise<void>) {
    setPending(label);
    setProblem(null);
    try {
      await action();
      onClose();
    } catch (error) {
      setProblem(friendlyError(error));
    } finally {
      setPending(null);
    }
  }

  const pose = problem ? "error" : pending ? "waiting" : "idle";
  const waitingFor = pending === "passkey" ? "Waiting for Face ID or fingerprint" : pending === "create" ? "Making your passkey" : `Waiting for ${pending ?? "your wallet"}`;

  // Portalled to <body> so it sits above the top bar wherever it is opened from.
  return createPortal(
    <div className="scrim cn-scrim" onClick={onClose}>
      <div ref={dialog} tabIndex={-1} className="modal cn-wrap" role="dialog" aria-modal="true" aria-labelledby="connect-title" onClick={(event) => event.stopPropagation()}>
        <div className="panel panel-lg cn">
          <div className="cn-head">
            <Hush pose={pose} size={60} className={pose === "idle" ? "bob" : ""} />
            <h2 id="connect-title">{signer ? "Your account" : title ?? "Sign in"}</h2>
            <button type="button" id="connect-close" className="cn-x" aria-label="Close" onClick={onClose}><Icon name="x" size={20} /></button>
          </div>

          {signer ? (
            <div className="grid gap-4">
              <div className="cn-addr">
                <Icon name={signer.kind === "passkey" ? "fingerprint" : "wallet"} size={22} className="text-cyan" />
                <span className="flex-1 font-mono text-[17px] text-paper">{shortAddress(signer.address)}</span>
                <CopyButton value={signer.address} />
              </div>
              <p className="m-0 text-[15px] text-muted">
                {signer.kind === "passkey" ? "Signed in with a passkey. Your key exists only in memory and is recreated from the passkey next time." : `Connected with ${signer.wallet.info.name}.`}
              </p>
              <div className="cn-bal">
                <span className="label">Balance for gas</span>
                <b className="num">{balance ? Number(balance).toFixed(4) : "…"} <span className="text-[15px] text-muted">MON</span></b>
              </div>
              {signer.kind === "passkey" && balance !== "" && Number(balance) === 0 ? (
                <p className="cn-warn">
                  This account needs MON for gas.{" "}
                  {network.faucet ? <a className="font-bold text-yellow" href={network.faucet} target="_blank" rel="noreferrer">Get some from the faucet</a> : "Send it some MON"}{" "}
                  and paste the address above.
                </p>
              ) : null}
              <SecondaryButton icon="return" className="w-full" onClick={() => { disconnect(); onClose(); }}>Disconnect</SecondaryButton>
            </div>
          ) : (
            <>
              {problem ? <p className="cn-problem" role="alert"><Icon name="alert" size={18} className="mt-0.5" />{problem}</p> : null}
              {pending ? (
                <div className="cn-boot" aria-live="polite">
                  <p>&gt; {waitingFor}<span className="cn-dots" aria-hidden="true"><i /><i /><i /></span></p>
                  <p className="text-muted">&gt; Check the prompt on your screen.</p>
                </div>
              ) : (
                <div className="grid gap-6">
                  <div className="grid gap-2">
                    <button type="button" className="cn-opt cn-pass cr-cut" onClick={() => void attempt("passkey", () => signInWithPasskey("signIn"))}>
                      <span className="cn-ic"><Icon name="fingerprint" size={30} /></span>
                      <span className="min-w-0"><b>Use a passkey</b><small>Face ID or fingerprint. No wallet app needed.</small></span>
                      <Icon name="chevron-right" size={24} />
                      <Sticker tone="cyan" className="cn-sticker">No app needed</Sticker>
                    </button>
                    <button type="button" className="cn-link" onClick={() => void attempt("create", () => signInWithPasskey("create"))}>
                      First time here? <span>Make a passkey account</span>
                    </button>
                  </div>
                  <div className="cn-opt cn-wallet cr-cut">
                    <div className="cn-wallet-head">
                      <span className="cn-ic"><Icon name="wallet" size={28} /></span>
                      <span className="min-w-0"><b>Use a wallet</b><small>MetaMask, Rabby and others.</small></span>
                    </div>
                    {wallets.length > 0 ? (
                      <div className="grid gap-2">
                        {wallets.map((wallet) => (
                          <button key={wallet.info.rdns} type="button" className="cn-row" onClick={() => void attempt(wallet.info.name, () => connectWallet(wallet.info.rdns))}>
                            {wallet.info.icon ? <img src={wallet.info.icon} alt="" className="h-7 w-7" /> : <span className="h-7 w-7 bg-panel" />}
                            <span className="flex-1 truncate">{wallet.info.name}</span>
                            <Icon name="chevron-right" size={20} className="text-cyan" />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="m-0 text-[15px] text-muted">No wallet found in this browser. Use a passkey, or install a wallet like MetaMask or Rabby.</p>
                    )}
                  </div>
                  <p className="cn-foot"><Icon name="shield" size={16} className="text-green" />Blindlaunch never sees your keys.</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
