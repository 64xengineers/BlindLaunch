import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak256, toBytes } from "viem";

export type Point = { x: bigint; y: bigint };
export type Rng = (length: number) => Uint8Array;

/** secp256k1 group order. */
export const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
/** secp256k1 field prime. */
export const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;

const Projective = secp256k1.ProjectivePoint;

export const G: Point = Projective.BASE.toAffine();

export const defaultRng: Rng = (length) => crypto.getRandomValues(new Uint8Array(length));

/** Counter-mode keccak stream. For vectors and tests only, never for real bids. */
export function deterministicRng(seed: string): Rng {
  let counter = 0n;
  let buffer = new Uint8Array(0);
  return (length) => {
    while (buffer.length < length) {
      const block = toBytes(keccak256(toBytes(`${seed}:${counter}`)));
      counter += 1n;
      const next = new Uint8Array(buffer.length + block.length);
      next.set(buffer);
      next.set(block, buffer.length);
      buffer = next;
    }
    const out = buffer.slice(0, length);
    buffer = buffer.slice(length);
    return out;
  };
}

export function mod(value: bigint): bigint {
  const r = value % N;
  return r < 0n ? r + N : r;
}

export function bytesToBigInt(bytes: Uint8Array): bigint {
  let out = 0n;
  for (const byte of bytes) out = (out << 8n) | BigInt(byte);
  return out;
}

export function randomScalar(rng: Rng): bigint {
  for (;;) {
    const k = bytesToBigInt(rng(32));
    if (k > 0n && k < N) return k;
  }
}

export function mulBase(k: bigint): Point {
  return Projective.BASE.multiply(k).toAffine();
}

export function mul(point: Point, k: bigint): Point {
  return Projective.fromAffine(point).multiply(k).toAffine();
}

/** Same rule as `Secp256k1.isValid`: 0 < x < n, 0 < y < p, y² = x³ + 7. */
export function isValid(point: Point): boolean {
  if (point.x <= 0n || point.x >= N || point.y <= 0n || point.y >= P) return false;
  return (point.y * point.y - (point.x ** 3n + 7n)) % P === 0n;
}
