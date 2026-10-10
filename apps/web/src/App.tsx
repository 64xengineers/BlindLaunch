import { useCallback, useEffect, useState } from "react";
import { formatEther, type Address, type Hash } from "viem";
import { auctionAbi } from "./abi";
import { auctionAddress, monadTestnet, quoteTokenAddress, saleTokenAddress } from "./config";
import {
  connectWallet,
  currentChainId,
  ensureAllowance,
  ensureTokenBalance,
  hashBid,
  publicClient,
  randomSalt,
  saltKey,
  writeContract,
} from "./wallet";

type Auction = {
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

type Bid = {
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

const statusName = ["Empty", "Open", "Settled", "Cancelled"];

function when(unix: number): string {
  return new Date(unix * 1000).toLocaleString();
}

function short(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function phase(auction: Auction, now: number): string {
  if (auction.status === 2) return "Settled";
  if (auction.status === 3) return "Cancelled";
  if (now < auction.commitDeadline) return "Commit window";
  if (now < auction.revealDeadline) return "Reveal window";
  if (now < auction.cancelAfter) return "Ready to settle";
  return "Ready to cancel";
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

export function App() {
  const [account, setAccount] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [mon, setMon] = useState<string>("");
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [selectedId, setSelectedId] = useState<string>("1");
  const [bids, setBids] = useState<Bid[]>([]);
  const [mySlot, setMySlot] = useState<number>(0);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [status, setStatus] = useState("Reading auctions from Monad testnet.");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [priceStep, setPriceStep] = useState("1");
  const [quantity, setQuantity] = useState("10");
  const [salt, setSalt] = useState("");
  const [supply, setSupply] = useState("1000");
  const [commitMinutes, setCommitMinutes] = useState("3");
  const [revealMinutes, setRevealMinutes] = useState("6");
  const [cancelMinutes, setCancelMinutes] = useState("9");

  const selected = auctions.find((auction) => auction.id.toString() === selectedId) ?? null;

  const refresh = useCallback(async () => {
    const rows = await loadAuctions();
    setAuctions(rows);
    setNow(Math.floor(Date.now() / 1000));
  }, []);

  useEffect(() => {
    refresh().then(() => setStatus("Auctions loaded.")).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "Could not read the auction contract.");
    });
  }, [refresh]);

  useEffect(() => {
    const ethereum = window.ethereum;
    if (!ethereum?.on) {
      return;
    }
    const onAccounts = (nextAccounts: unknown) => {
      const list = Array.isArray(nextAccounts) ? nextAccounts : [];
      const next = typeof list[0] === "string" ? (list[0] as Address) : null;
      setAccount(next);
      setStatus(next ? `Connected ${short(next)}.` : "Wallet disconnected.");
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
    loadBids(selected.id, selected.bidCount).then(setBids).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "Could not read bids.");
    });
  }, [selected]);

  useEffect(() => {
    if (!account || !selected) {
      setMySlot(0);
      return;
    }
    publicClient.readContract({
      address: auctionAddress,
      abi: auctionAbi,
      functionName: "bidderSlot",
      args: [selected.id, account],
    }).then((slot) => setMySlot(slot)).catch(() => setMySlot(0));
    const stored = localStorage.getItem(saltKey(selected.id.toString(), account));
    if (stored) setSalt(stored);
  }, [account, selected]);

  async function onConnect() {
    setError("");
    try {
      const next = await connectWallet();
      setAccount(next);
      setChainId(await currentChainId());
      const balance = await publicClient.getBalance({ address: next });
      setMon(formatEther(balance));
      setStatus(`Connected ${short(next)}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Wallet connection failed.");
    }
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
      setError(reason instanceof Error ? reason.message : "Transaction failed.");
      setStatus("The last transaction did not confirm.");
    } finally {
      setBusy(false);
    }
  }

  async function onCommit() {
    if (!account || !selected) return;
    const step = Number(priceStep);
    const qty = BigInt(quantity);
    const nextSalt = (salt || randomSalt()) as `0x${string}`;
    localStorage.setItem(saltKey(selected.id.toString(), account), nextSalt);
    setSalt(nextSalt);
    const commitment = hashBid(selected.id, account, step, qty, nextSalt);
    await run("Commit bid", async () => {
      await ensureTokenBalance(account, quoteTokenAddress, selected.deposit);
      await ensureAllowance(account, quoteTokenAddress, selected.deposit);
      await writeContract(account, {
        address: auctionAddress,
        abi: auctionAbi,
        functionName: "commit",
        args: [selected.id, commitment],
      });
    });
  }

  async function onReveal() {
    if (!account || !selected) return;
    const stored = localStorage.getItem(saltKey(selected.id.toString(), account)) ?? salt;
    await run("Reveal bid", async () => {
      await writeContract(account, {
        address: auctionAddress,
        abi: auctionAbi,
        functionName: "reveal",
        args: [selected.id, Number(priceStep), BigInt(quantity), stored as `0x${string}`],
      });
    });
  }

  async function onSimple(name: "settle" | "cancel" | "claim" | "reclaim") {
    if (!account || !selected) return;
    await run(name, async () => {
      await writeContract(account, {
        address: auctionAddress,
        abi: auctionAbi,
        functionName: name,
        args: [selected.id],
      });
    });
  }

  async function onCreate() {
    if (!account) return;
    const start = BigInt(Math.floor(Date.now() / 1000));
    const supplyAmount = BigInt(supply);
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
          minPrice: 50n,
          stepSize: 10n,
          stepCount: 6,
          deposit: 1_000_000n,
          maxNotional: 1_000_000n,
          maxSlots: 8,
          commitDeadline: start + BigInt(Number(commitMinutes) * 60),
          revealDeadline: start + BigInt(Number(revealMinutes) * 60),
          cancelAfter: start + BigInt(Number(cancelMinutes) * 60),
        }],
      });
    });
  }

  const wrongChain = account !== null && chainId !== null && chainId !== monadTestnet.id;
  const myBid = bids.find((bid) => account && bid.bidder.toLowerCase() === account.toLowerCase());
  const quoted = selected
    ? selected.minPrice + BigInt(Number(priceStep) || 0) * selected.stepSize
    : 0n;

  return (
    <main className="page">
      <header>
        <div>
          <div className="kicker">Monad testnet · chain 10143</div>
          <h1>Blindlaunch</h1>
          <p>Commit a hidden bid. After the window, reveal it. Everyone who is filled pays one clearing price.</p>
        </div>
        <div className="wallet">
          {account ? (
            <>
              <div>{short(account)}</div>
              <div>{mon ? `${mon} MON` : ""}</div>
              <button className="secondary" onClick={onConnect}>Switch account</button>
            </>
          ) : (
            <button onClick={onConnect}>Connect wallet</button>
          )}
        </div>
      </header>

      {wrongChain ? <div className="error">Switch the wallet to Monad testnet.</div> : null}
      {error ? <div className="error">{error}</div> : null}
      <div className="notice">{status}</div>

      <div className="layout">
        <section className="card">
          <h2>Auctions</h2>
          {auctions.map((auction) => (
            <button
              key={auction.id.toString()}
              className={auction.id.toString() === selectedId ? "auction-button active" : "auction-button"}
              onClick={() => setSelectedId(auction.id.toString())}
            >
              #{auction.id.toString()} · {statusName[auction.status] ?? "Unknown"}
            </button>
          ))}
          <h2>Open a new auction</h2>
          <label>Sale supply<input value={supply} onChange={(event) => setSupply(event.target.value)} /></label>
          <label>Commit minutes<input value={commitMinutes} onChange={(event) => setCommitMinutes(event.target.value)} /></label>
          <label>Reveal minutes<input value={revealMinutes} onChange={(event) => setRevealMinutes(event.target.value)} /></label>
          <label>Cancel minutes<input value={cancelMinutes} onChange={(event) => setCancelMinutes(event.target.value)} /></label>
          <button disabled={!account || busy} onClick={onCreate}>Create auction</button>
        </section>

        <section className="card">
          {selected ? (
            <>
              <h2>Auction {selected.id.toString()}</h2>
              <p>{phase(selected, now)} · {statusName[selected.status]}</p>
              <div className="meta">
                <div>Supply <strong>{selected.supply.toString()}</strong></div>
                <div>Deposit <strong>{selected.deposit.toString()}</strong></div>
                <div>Price grid <strong>{selected.minPrice.toString()} + step × {selected.stepSize.toString()}</strong></div>
                <div>Slots <strong>{selected.bidCount}/{selected.maxSlots}</strong></div>
                <div>Commit until <strong>{when(selected.commitDeadline)}</strong></div>
                <div>Reveal until <strong>{when(selected.revealDeadline)}</strong></div>
                <div>Cancel after <strong>{when(selected.cancelAfter)}</strong></div>
                <div>Clearing price <strong>{selected.status === 2 && selected.totalSold > 0n ? selected.clearingPrice.toString() : "—"}</strong></div>
                <div>Sold <strong>{selected.totalSold.toString()}</strong></div>
                <div>Authority <strong>{short(selected.authority)}</strong></div>
              </div>

              <div className="actions">
                <button disabled={!account || busy || selected.status !== 1 || now >= selected.commitDeadline || mySlot !== 0} onClick={onCommit}>Commit</button>
                <button disabled={!account || busy || !myBid || myBid.revealed || now < selected.commitDeadline || now >= selected.revealDeadline} onClick={onReveal}>Reveal</button>
                <button disabled={!account || busy || selected.status !== 1 || now < selected.revealDeadline || now >= selected.cancelAfter} onClick={() => onSimple("settle")}>Settle</button>
                <button disabled={!account || busy || selected.status !== 1 || now < selected.cancelAfter} onClick={() => onSimple("cancel")}>Cancel</button>
                <button disabled={!account || busy || !myBid || myBid.claimed || (selected.status !== 2 && selected.status !== 3)} onClick={() => onSimple("claim")}>Claim</button>
                <button disabled={!account || busy || selected.reclaimed || account.toLowerCase() !== selected.authority.toLowerCase() || (selected.status !== 2 && selected.status !== 3)} onClick={() => onSimple("reclaim")}>Reclaim</button>
              </div>

              <label>
                Price step
                <input value={priceStep} onChange={(event) => setPriceStep(event.target.value)} />
              </label>
              <p>That step quotes {quoted.toString()} quote units per sale unit.</p>
              <label>
                Quantity
                <input value={quantity} onChange={(event) => setQuantity(event.target.value)} />
              </label>
              <label>
                Salt
                <input value={salt} onChange={(event) => setSalt(event.target.value)} placeholder="Saved in this browser when you commit" />
              </label>

              <h2>Bids</h2>
              <div className="bids">
                {bids.length === 0 ? <p>No bids yet.</p> : bids.map((bid) => (
                  <div key={bid.slot}>
                    Slot {bid.slot} · {short(bid.bidder)} · {bid.revealed ? `step ${bid.priceStep}, qty ${bid.quantity.toString()}, filled ${bid.allocation.toString()}` : "hidden until reveal"}
                    <div><code>{bid.commitment}</code></div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p>No auction is loaded yet.</p>
          )}
        </section>
      </div>
    </main>
  );
}
