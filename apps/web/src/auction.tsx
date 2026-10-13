import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { formatEther, type Address, type Hash } from "viem";
import { auctionAbi } from "./abi";
import { auctionAddress, monadTestnet, quoteTokenAddress, saleTokenAddress } from "./config";
import {
  connectWallet,
  currentChainId,
  ensureAllowance,
  ensureTokenBalance,
  hashBid,
  deriveSalt,
  publicClient,
  saltKey,
  writeContract,
} from "./wallet";

export type Auction = {
  id: bigint;
  authority: Address;
  supply: bigint;
  minPrice: bigint;
  stepSize: bigint;
  stepCount: number;
  deposit: bigint;
  maxNotional: bigint;
  maxSlots: number;
  commitDeadline: number;
  revealDeadline: number;
  cancelAfter: number;
  status: number;
  bidCount: number;
  clearingPrice: bigint;
  clearingStep: number;
  totalSold: bigint;
  reclaimed: boolean;
};

export type Bid = {
  slot: number;
  bidder: Address;
  commitment: Hash;
  priceStep: number;
  quantity: bigint;
  allocation: bigint;
  revealed: boolean;
  counted: boolean;
  claimed: boolean;
};

type AuctionContextValue = {
  account: Address | null;
  mon: string;
  wrongChain: boolean;
  auctions: Auction[];
  bids: Bid[];
  mySlot: number;
  now: number;
  loading: boolean;
  busy: boolean;
  error: string;
  status: string;
  priceStep: string;
  quantity: string;
  salt: string;
  setPriceStep: (value: string) => void;
  setQuantity: (value: string) => void;
  setSalt: (value: string) => void;
  selectAuction: (id: bigint) => void;
  selected: Auction | null;
  myBid: Bid | undefined;
  quotedPrice: bigint;
  connect: () => Promise<void>;
  commit: () => Promise<boolean>;
  reveal: () => Promise<void>;
  act: (name: "settle" | "cancel" | "claim" | "reclaim") => Promise<void>;
  actOn: (name: "settle" | "cancel" | "claim" | "reclaim", auctionId: bigint) => Promise<void>;
  createAuction: (input: {
    supply: string;
    minPrice: string;
    deposit: string;
    closeAt: number;
    name?: string;
    description?: string;
  }) => Promise<bigint | null>;
};

const AuctionContext = createContext<AuctionContextValue | null>(null);

export function useAuction(): AuctionContextValue {
  const value = useContext(AuctionContext);
  if (!value) {
    throw new Error("useAuction must be used inside AuctionProvider");
  }
  return value;
}

export function friendlyError(reason: unknown, fallback: string): string {
  const chain: unknown[] = [];
  let current: unknown = reason;
  while (current && chain.length < 8) {
    chain.push(current);
    current = (current as { cause?: unknown }).cause;
  }
  const rejected = chain.some((item) => {
    const error = item as { code?: number; name?: string; message?: string };
    return error.code === 4001
      || error.name === "UserRejectedRequestError"
      || /user (rejected|denied)/i.test(error.message ?? "");
  });
  if (rejected) return "User rejected the request.";
  const short = (reason as { shortMessage?: string } | null)?.shortMessage;
  if (short) return short;
  if (reason instanceof Error) return reason.message.split("\n")[0];
  return fallback;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function priceAt(auction: Auction, step: number): bigint {
  return auction.minPrice + BigInt(step) * auction.stepSize;
}

async function loadAuctions(): Promise<Auction[]> {
  const next = await publicClient.readContract({
    address: auctionAddress,
    abi: auctionAbi,
    functionName: "nextAuctionId",
  });
  const auctions: Auction[] = [];
  for (let id = 1n; id < next && id <= 20n; id += 1n) {
    const row = await publicClient.readContract({
      address: auctionAddress,
      abi: auctionAbi,
      functionName: "getAuction",
      args: [id],
    });
    auctions.push({
      id,
      authority: row.authority,
      supply: row.supply,
      minPrice: row.minPrice,
      stepSize: row.stepSize,
      stepCount: row.stepCount,
      deposit: row.deposit,
      maxNotional: row.maxNotional,
      maxSlots: row.maxSlots,
      commitDeadline: Number(row.commitDeadline),
      revealDeadline: Number(row.revealDeadline),
      cancelAfter: Number(row.cancelAfter),
      status: row.status,
      bidCount: row.bidCount,
      clearingPrice: row.clearingPrice,
      clearingStep: row.clearingStep,
      totalSold: row.totalSold,
      reclaimed: row.reclaimed,
    });
  }
  return auctions.reverse();
}

export type StoredBid = { step: number; quantity: string; salt: string; derived?: boolean; commitTx?: string; revealTx?: string };

function storedBidKey(auctionId: bigint | string, account: string) {
  return `blindlaunch:bid:${auctionId.toString()}:${account.toLowerCase()}`;
}

export function readStoredBid(auctionId: bigint | string, account: string): StoredBid | null {
  try {
    const raw = localStorage.getItem(storedBidKey(auctionId, account));
    return raw ? (JSON.parse(raw) as StoredBid) : null;
  } catch {
    return null;
  }
}

function writeStoredBid(auctionId: bigint, account: string, patch: Partial<StoredBid>) {
  const current = readStoredBid(auctionId, account) ?? { step: 0, quantity: "0", salt: "" };
  localStorage.setItem(storedBidKey(auctionId, account), JSON.stringify({ ...current, ...patch }));
}

export type AuctionMeta = { name: string; description: string };

export function readAuctionMeta(auctionId: bigint | string): AuctionMeta | null {
  try {
    const raw = localStorage.getItem(`blindlaunch:meta:${auctionId.toString()}`);
    return raw ? (JSON.parse(raw) as AuctionMeta) : null;
  } catch {
    return null;
  }
}

export type MyBid = { auction: Auction; bid: Bid };

export async function loadMyBids(auctions: Auction[], account: Address): Promise<MyBid[]> {
  const rows = await Promise.all(auctions.map(async (auction) => {
    const slotPlusOne = await publicClient.readContract({
      address: auctionAddress,
      abi: auctionAbi,
      functionName: "bidderSlot",
      args: [auction.id, account],
    });
    if (slotPlusOne === 0) return null;
    const slot = slotPlusOne - 1;
    const row = await publicClient.readContract({
      address: auctionAddress,
      abi: auctionAbi,
      functionName: "getBid",
      args: [auction.id, slot],
    });
    return {
      auction,
      bid: {
        slot,
        bidder: row.bidder,
        commitment: row.commitment,
        priceStep: row.priceStep,
        quantity: row.quantity,
        allocation: row.allocation,
        revealed: row.revealed,
        counted: row.counted,
        claimed: row.claimed,
      },
    };
  }));
  return rows.filter((row): row is MyBid => row !== null);
}

async function loadBids(auctionId: bigint, bidCount: number): Promise<Bid[]> {
  const bids: Bid[] = [];
  for (let slot = 0; slot < bidCount; slot += 1) {
    const row = await publicClient.readContract({
      address: auctionAddress,
      abi: auctionAbi,
      functionName: "getBid",
      args: [auctionId, slot],
    });
    bids.push({
      slot,
      bidder: row.bidder,
      commitment: row.commitment,
      priceStep: row.priceStep,
      quantity: row.quantity,
      allocation: row.allocation,
      revealed: row.revealed,
      counted: row.counted,
      claimed: row.claimed,
    });
  }
  return bids;
}

export function AuctionProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [mon, setMon] = useState("");
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [selectedId, setSelectedId] = useState<bigint | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [mySlot, setMySlot] = useState(0);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Reading auctions from Monad testnet.");
  const [priceStep, setPriceStep] = useState("1");
  const [quantity, setQuantity] = useState("10");
  const [salt, setSalt] = useState("");

  const selected = auctions.find((auction) => auction.id === selectedId) ?? null;

  const refresh = useCallback(async () => {
    const rows = await loadAuctions();
    setAuctions(rows);
    setNow(Math.floor(Date.now() / 1000));
    return rows;
  }, []);

  useEffect(() => {
    refresh()
      .then(() => setStatus("Auctions loaded."))
      .catch((reason: unknown) => {
        setError(friendlyError(reason, "Could not read the auction contract."));
      })
      .finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const ethereum = window.ethereum;
    if (!ethereum?.on) return;
    const onAccounts = (nextAccounts: unknown) => {
      const list = Array.isArray(nextAccounts) ? nextAccounts : [];
      const next = typeof list[0] === "string" ? (list[0] as Address) : null;
      setAccount(next);
      setStatus(next ? `Connected ${shortAddress(next)}.` : "Wallet disconnected.");
    };
    ethereum.on("accountsChanged", onAccounts);
    return () => ethereum.removeListener?.("accountsChanged", onAccounts);
  }, []);

  useEffect(() => {
    if (!account) {
      setMon("");
      return;
    }
    publicClient.getBalance({ address: account }).then((balance) => setMon(formatEther(balance))).catch(() => setMon(""));
    currentChainId().then(setChainId).catch(() => setChainId(null));
  }, [account]);

  useEffect(() => {
    if (!selected) {
      setBids([]);
      return;
    }
    loadBids(selected.id, selected.bidCount)
      .then(setBids)
      .catch((reason: unknown) => {
        setError(friendlyError(reason, "Could not read bids."));
      });
  }, [selected]);

  useEffect(() => {
    if (!account || !selected) {
      setMySlot(0);
      return;
    }
    publicClient
      .readContract({
        address: auctionAddress,
        abi: auctionAbi,
        functionName: "bidderSlot",
        args: [selected.id, account],
      })
      .then((slot) => setMySlot(slot))
      .catch(() => setMySlot(0));
  }, [account, selected]);

  useEffect(() => {
    if (!account || selectedId === null) {
      setSalt("");
      return;
    }
    const stored = readStoredBid(selectedId, account)?.salt || localStorage.getItem(saltKey(selectedId.toString(), account));
    setSalt(stored ?? "");
  }, [account, selectedId]);

  async function connect() {
    setError("");
    const next = await connectWallet();
    setAccount(next);
    setChainId(await currentChainId());
    const balance = await publicClient.getBalance({ address: next });
    setMon(formatEther(balance));
    setStatus(`Connected ${shortAddress(next)}.`);
  }

  async function run(label: string, action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setStatus(label);
    try {
      await action();
      await refresh();
      setStatus(`${label} confirmed.`);
    } catch (reason) {
      const message = friendlyError(reason, "Transaction failed.");
      setError(message);
      setStatus("The last transaction did not confirm.");
      throw reason;
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!account || !selected) return false;
    const step = Number(priceStep);
    const qty = BigInt(quantity);
    const custom = /^0x[0-9a-fA-F]{64}$/.test(salt) ? (salt as `0x${string}`) : null;
    await run("Seal bid", async () => {
      const nextSalt = custom ?? (await deriveSalt(account, selected.id));
      localStorage.setItem(saltKey(selected.id.toString(), account), nextSalt);
      setSalt(nextSalt);
      writeStoredBid(selected.id, account, { step, quantity: qty.toString(), salt: nextSalt, derived: custom === null });
      const commitment = hashBid(selected.id, account, step, qty, nextSalt);
      await ensureTokenBalance(account, quoteTokenAddress, selected.deposit);
      await ensureAllowance(account, quoteTokenAddress, selected.deposit);
      const hash = await writeContract(account, {
        address: auctionAddress,
        abi: auctionAbi,
        functionName: "commit",
        args: [selected.id, commitment],
      });
      writeStoredBid(selected.id, account, { commitTx: hash });
    });
    return true;
  }

  async function reveal() {
    if (!account || !selected) return;
    const stored = readStoredBid(selected.id, account);
    const knownSalt = stored?.salt || localStorage.getItem(saltKey(selected.id.toString(), account)) || salt;
    await run("Reveal bid", async () => {
      let step: number;
      let qty: bigint;
      let storedSalt = knownSalt as `0x${string}`;
      if (stored?.salt) {
        step = stored.step;
        qty = BigInt(stored.quantity);
      } else {
        const commitment = bids.find((bid) => bid.bidder.toLowerCase() === account.toLowerCase())?.commitment;
        if (!commitment) throw new Error("This wallet has no sealed bid in this auction.");
        if (!/^\d+$/.test(quantity) || BigInt(quantity) === 0n) {
          throw new Error("Enter the number of tokens you bid so the bid can be recovered.");
        }
        qty = BigInt(quantity);
        if (!/^0x[0-9a-fA-F]{64}$/.test(storedSalt ?? "")) storedSalt = await deriveSalt(account, selected.id);
        const steps = Array.from({ length: selected.stepCount }, (_, index) => index);
        const match = steps.find((candidate) => hashBid(selected.id, account, candidate, qty, storedSalt) === commitment);
        if (match === undefined) {
          throw new Error("Could not recover the bid. Check the token amount, and use the wallet that sealed it.");
        }
        step = match;
        writeStoredBid(selected.id, account, { step, quantity: qty.toString(), salt: storedSalt, derived: true });
      }
      const hash = await writeContract(account, {
        address: auctionAddress,
        abi: auctionAbi,
        functionName: "reveal",
        args: [selected.id, step, qty, storedSalt as `0x${string}`],
      });
      writeStoredBid(selected.id, account, { revealTx: hash });
    });
  }

  async function actOn(name: "settle" | "cancel" | "claim" | "reclaim", auctionId: bigint) {
    if (!account) return;
    await run(name, async () => {
      await writeContract(account, {
        address: auctionAddress,
        abi: auctionAbi,
        functionName: name,
        args: [auctionId],
      });
    });
  }

  async function act(name: "settle" | "cancel" | "claim" | "reclaim") {
    if (!selected) return;
    await actOn(name, selected.id);
  }

  async function createAuction(input: {
    supply: string;
    minPrice: string;
    deposit: string;
    closeAt: number;
    name?: string;
    description?: string;
  }) {
    if (!account) return null;
    const supplyAmount = BigInt(input.supply);
    const minPrice = BigInt(input.minPrice);
    const deposit = BigInt(input.deposit);
    const revealAt = input.closeAt + 15 * 60;
    const cancelAt = input.closeAt + 30 * 60;
    let created: bigint | null = null;
    await run("Create auction", async () => {
      await ensureTokenBalance(account, saleTokenAddress, supplyAmount);
      await ensureAllowance(account, saleTokenAddress, supplyAmount);
      await writeContract(account, {
        address: auctionAddress,
        abi: auctionAbi,
        functionName: "createAuction",
        args: [{
          saleToken: saleTokenAddress,
          quoteToken: quoteTokenAddress,
          supply: supplyAmount,
          minPrice,
          stepSize: 10n,
          stepCount: 6,
          deposit,
          maxNotional: deposit,
          maxSlots: 64,
          commitDeadline: BigInt(input.closeAt),
          revealDeadline: BigInt(revealAt),
          cancelAfter: BigInt(cancelAt),
        }],
      });
      const next = await publicClient.readContract({
        address: auctionAddress,
        abi: auctionAbi,
        functionName: "nextAuctionId",
      });
      created = next - 1n;
      if (input.name || input.description) {
        localStorage.setItem(`blindlaunch:meta:${created.toString()}`, JSON.stringify({ name: input.name ?? "", description: input.description ?? "" }));
      }
    });
    return created;
  }

  const quotedPrice = selected ? priceAt(selected, Number(priceStep) || 0) : 0n;
  const myBid = bids.find((bid) => account && bid.bidder.toLowerCase() === account.toLowerCase());

  const value = useMemo<AuctionContextValue>(() => ({
    account,
    mon,
    wrongChain: account !== null && chainId !== null && chainId !== monadTestnet.id,
    auctions,
    bids,
    mySlot,
    now,
    loading,
    busy,
    error,
    status,
    priceStep,
    quantity,
    salt,
    setPriceStep,
    setQuantity,
    setSalt,
    selectAuction: setSelectedId,
    selected,
    myBid,
    quotedPrice,
    connect: async () => {
      try {
        await connect();
      } catch (reason) {
        setError(friendlyError(reason, "Wallet connection failed."));
      }
    },
    commit,
    reveal,
    act,
    actOn,
    createAuction,
  }), [
    account, mon, chainId, auctions, bids, mySlot, now, loading, busy, error, status,
    priceStep, quantity, salt, selected, myBid, quotedPrice,
  ]);

  return <AuctionContext.Provider value={value}>{children}</AuctionContext.Provider>;
}
