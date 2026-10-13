import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useSession } from "../auth/session";
import { publicClient } from "../chain/clients";
import type { Writer } from "./actions";
import { friendlyError } from "./errors";

let clockOffset = 0;

/**
 * Seconds of chain time, ticking every second. It follows the latest block's timestamp (re-read
 * every 30 s), so a wrong device clock never shows the wrong auction phase.
 */
export function useNow(): bigint {
  const read = () => BigInt(Math.floor(Date.now() / 1000) + clockOffset);
  const [now, setNow] = useState(read);
  useEffect(() => {
    const sync = () =>
      void publicClient.getBlock().then((block) => {
        clockOffset = Number(block.timestamp) - Math.floor(Date.now() / 1000);
        setNow(read());
      }).catch(() => {});
    sync();
    const tick = window.setInterval(() => setNow(read()), 1000);
    const resync = window.setInterval(sync, 30_000);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(resync);
    };
  }, []);
  return now;
}

/** Loads now and every `intervalMs` while the tab is visible; `reload` refreshes immediately. */
export function usePolling<T>(load: (() => Promise<T>) | null, deps: readonly unknown[], intervalMs = 5_000) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    setData(undefined);
    setLoading(true);
  }, deps);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const current = loadRef.current;
      if (!current || document.hidden) return;
      try {
        const value = await current();
        if (!cancelled) {
          setData(value);
          setError(null);
        }
      } catch (reason) {
        if (!cancelled) setError(friendlyError(reason));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    const timer = window.setInterval(() => void run(), intervalMs);
    const onVisible = () => { if (!document.hidden) void run(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [...deps, tick, intervalMs]);

  const reload = useCallback(() => setTick((value) => value + 1), []);
  return { data, error, loading, reload };
}

type Toast = { id: number; message: string; tone: "ok" | "error" };
const ToastContext = createContext<{ toast: Toast | null; notify: (message: string, tone?: "ok" | "error") => void; dismiss: () => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const notify = useCallback((message: string, tone: "ok" | "error" = "ok") => setToast({ id: Date.now(), message, tone }), []);
  const dismiss = useCallback(() => setToast(null), []);
  return <ToastContext.Provider value={{ toast, notify, dismiss }}>{children}</ToastContext.Provider>;
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used inside ToastProvider");
  return value;
}

/** Runs one wallet action at a time: busy flag, success toast, and a plain sentence on failure. */
export function useRunner() {
  const { writer } = useSession();
  const { notify } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const run = useCallback(
    async <T,>(label: string, action: (w: Writer) => Promise<T>, done?: string): Promise<T | undefined> => {
      setBusy(label);
      try {
        const result = await action(await writer());
        notify(done ?? `${label}: confirmed.`);
        return result;
      } catch (reason) {
        notify(friendlyError(reason), "error");
        return undefined;
      } finally {
        setBusy(null);
      }
    },
    [writer, notify],
  );
  return { run, busy };
}
