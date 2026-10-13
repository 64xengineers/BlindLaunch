import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getAddress, keccak256, numberToHex, toBytes } from "viem";
import { deterministicRng, mulBase, randomScalar, seal, sharedPoint, type KeeperIndex } from "../src";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../../../contracts/test/vectors/sealed-bid.json");

type Case = { label: string; pair: [KeeperIndex, KeeperIndex]; step: number; quantity: bigint; corrupt: boolean };

const cases: Case[] = [
  { label: "pair01", pair: [0, 1], step: 3, quantity: 250n, corrupt: false },
  { label: "pair02", pair: [0, 2], step: 0, quantity: 1n, corrupt: false },
  { label: "pair12", pair: [1, 2], step: 63, quantity: 999_999n, corrupt: false },
  { label: "corruptPair01", pair: [0, 1], step: 2, quantity: 10n, corrupt: true },
];

const hex = (value: bigint) => numberToHex(value);

const rows = cases.map((item) => {
  const rng = deterministicRng(`vectors:${item.label}`);
  const secretKeys = [randomScalar(rng), randomScalar(rng), randomScalar(rng)] as const;
  const keeperKeys = [mulBase(secretKeys[0]), mulBase(secretKeys[1]), mulBase(secretKeys[2])] as const;
  const bidder = getAddress(`0x${keccak256(toBytes(item.label)).slice(26)}`);
  const sealed = seal({ auctionId: 1n, bidder, step: item.step, quantity: item.quantity, keeperKeys }, rng);
  const c = item.corrupt ? [sealed.c[0], sealed.c[1] ^ 1n, sealed.c[2]] : sealed.c;
  const shared = secretKeys.map((secretKey) => sharedPoint(secretKey, sealed.R));
  return {
    label: item.label,
    bidder,
    step: hex(BigInt(item.step)),
    quantity: hex(item.quantity),
    m: hex(sealed.m),
    pairA: hex(BigInt(item.pair[0])),
    pairB: hex(BigInt(item.pair[1])),
    secretKeys: secretKeys.map(hex),
    Rx: hex(sealed.R.x),
    Ry: hex(sealed.R.y),
    c: c.map(hex),
    h: sealed.h,
    Sx: shared.map((point) => hex(point.x)),
    Sy: shared.map((point) => hex(point.y)),
    counted: !item.corrupt,
  };
});

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify({ count: rows.length, cases: rows }, null, 2)}\n`);
console.log(`wrote ${rows.length} cases to ${out}`);
