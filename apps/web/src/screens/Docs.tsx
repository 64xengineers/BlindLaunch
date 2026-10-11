import { auctionAddress, monadTestnet, quoteTokenAddress, saleTokenAddress } from "../config";
import { Badge, CopyButton, GlassCard } from "../components/ui";

const commitSnippet = `import { createPublicClient, createWalletClient, custom, http,
  encodeAbiParameters, keccak256, toHex } from "viem";

const salt = toHex(crypto.getRandomValues(new Uint8Array(32)));
// Keep the salt. Without it the bid cannot be revealed.

const commitment = keccak256(encodeAbiParameters(
  [{ type: "uint256" }, { type: "address" }, { type: "uint32" },
   { type: "uint256" }, { type: "bytes32" }],
  [auctionId, bidder, priceStep, quantity, salt],
));

// 1. approve(BlindAuction, deposit) on the quote token
// 2. commit before commitDeadline
await wallet.writeContract({
  address: "${auctionAddress}",
  abi, functionName: "commit", args: [auctionId, commitment],
});`;

const revealSnippet = `// Between commitDeadline and revealDeadline
await wallet.writeContract({
  address: "${auctionAddress}",
  abi, functionName: "reveal",
  args: [auctionId, priceStep, quantity, salt],
});

// After revealDeadline, anyone can settle; then each bidder claims
await wallet.writeContract({ address, abi, functionName: "settle", args: [auctionId] });
await wallet.writeContract({ address, abi, functionName: "claim", args: [auctionId] });`;

const functions: [string, string][] = [
  ["createAuction(CreateParams)", "Escrows the sale supply and sets the price grid, deposit and three deadlines."],
  ["commit(id, commitment)", "Locks the fixed deposit and stores the hash. One bid per wallet. Before commitDeadline."],
  ["reveal(id, priceStep, quantity, salt)", "Opens the bid. Between commitDeadline and revealDeadline."],
  ["settle(id)", "Anyone. Finds the clearing step and allocations. Between revealDeadline and cancelAfter."],
  ["cancel(id)", "Anyone, at or after cancelAfter if still open. Every deposit becomes refundable."],
  ["claim(id)", "Bidder receives allocated tokens plus unused deposit."],
  ["reclaim(id)", "Authority receives proceeds plus unsold tokens."],
  ["getAuction(id) / getBid(id, slot)", "Read state. bidderSlot(id, wallet) returns slot + 1, or 0 if no bid."],
  ["claimable(id, wallet)", "Tokens and refund a bidder would receive right now."],
  ["hashBid(id, bidder, step, qty, salt)", "Same commitment the contract checks, handy for testing."],
];

const events = [
  "AuctionCreated(auctionId, authority, saleToken, quoteToken, supply, …)",
  "BidCommitted(auctionId, bidder, slot, commitment)",
  "BidRevealed(auctionId, bidder, priceStep, quantity, counted)",
  "AuctionSettled(auctionId, clearingPrice, clearingStep, totalSold)",
  "AuctionCancelled(auctionId)",
  "BidClaimed(auctionId, bidder, saleTokens, quoteRefund)",
  "ProceedsReclaimed(auctionId, authority, unsold, proceeds)",
];

function Code({ code }: { code: string }) {
  return (
    <div className="relative mt-3">
      <pre className="overflow-x-auto rounded-xl border border-white/10 bg-ink/80 p-4 font-mono text-xs leading-relaxed text-mist"><code>{code}</code></pre>
      <div className="absolute right-2 top-1"><CopyButton value={code} /></div>
    </div>
  );
}

export function Docs() {
  const addresses: [string, string][] = [
    ["BlindAuction", auctionAddress],
    ["SALE test token", saleTokenAddress],
    ["QUOTE test token", quoteTokenAddress],
  ];
  return (
    <div className="mx-auto max-w-4xl px-4 pb-20">
      <Badge>Integration docs</Badge>
      <h1 className="mt-5 text-4xl font-bold tracking-[-0.04em] sm:text-5xl">Use Blindlaunch from your launchpad.</h1>
      <p className="mt-3 text-mist">
        Any frontend can run a sealed-bid, one-price sale by calling the contract directly. There is no API server. Everything below works against {monadTestnet.name} (chain {monadTestnet.id}).
      </p>

      <GlassCard className="mt-8">
        <h2 className="text-lg font-bold">Addresses</h2>
        <ul className="mt-3 grid gap-2">
          {addresses.map(([label, address]) => (
            <li key={label} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl bg-white/[0.04] px-3">
              <span className="text-sm text-lilac">{label}</span>
              <span className="flex min-w-0 max-w-full flex-1 items-center justify-end gap-1">
                <a className="truncate font-mono text-xs text-paper hover:text-amber" href={`https://testnet.monadscan.com/address/${address}`} target="_blank" rel="noreferrer">{address}</a>
                <CopyButton value={address} />
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-lilac">RPC https://testnet-rpc.monad.xyz · test tokens have 0 decimals and a public mint, for demos only.</p>
      </GlassCard>

      <GlassCard className="mt-6">
        <h2 className="text-lg font-bold">1. Seal a bid</h2>
        <p className="mt-2 text-sm text-mist">The commitment is the keccak256 of the ABI-encoded auction id, bidder, price step, quantity and a random 32-byte salt. The price paid at step <span className="font-mono">s</span> is <span className="font-mono">minPrice + s × stepSize</span>.</p>
        <Code code={commitSnippet} />
      </GlassCard>

      <GlassCard className="mt-6">
        <h2 className="text-lg font-bold">2. Reveal, settle, claim</h2>
        <Code code={revealSnippet} />
      </GlassCard>

      <GlassCard className="mt-6">
        <h2 className="text-lg font-bold">Functions</h2>
        <dl className="mt-3 grid gap-3">
          {functions.map(([name, copy]) => (
            <div key={name} className="grid gap-1 border-b border-white/5 pb-3 last:border-0 sm:grid-cols-[17rem_1fr]">
              <dt className="break-words font-mono text-xs text-amber">{name}</dt>
              <dd className="text-sm text-mist">{copy}</dd>
            </div>
          ))}
        </dl>
      </GlassCard>

      <GlassCard className="mt-6">
        <h2 className="text-lg font-bold">Events to index</h2>
        <ul className="mt-3 grid gap-2">
          {events.map((event) => <li key={event} className="break-words font-mono text-xs text-mist">{event}</li>)}
        </ul>
        <p className="mt-3 text-sm text-mist">Full source and tests: <a className="text-amber" href="https://github.com/64xengineers/BlindLaunch/tree/added-readme.md/contracts" target="_blank" rel="noreferrer">contracts on GitHub</a>.</p>
      </GlassCard>
    </div>
  );
}
