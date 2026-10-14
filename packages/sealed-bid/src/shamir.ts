import { mod, N, randomScalar, type Rng } from "./curve";

export type KeeperIndex = 0 | 1 | 2;

export const INV2 = (N + 1n) / 2n;

/** f(x) = m + a·x mod n; keeper i gets f(i + 1). */
export function shamirSplit(m: bigint, rng: Rng): [bigint, bigint, bigint] {
  if (m < 0n || m >= N) throw new RangeError("secret out of range");
  const a = randomScalar(rng);
  return [mod(m + a), mod(m + 2n * a), mod(m + 3n * a)];
}

/** Lagrange at 0 with the fixed coefficients `Secp256k1.reconstruct` uses. */
export function shamirReconstruct(a: KeeperIndex, b: KeeperIndex, ya: bigint, yb: bigint): bigint {
  const first = mod(ya);
  const second = mod(yb);
  if (a === 0 && b === 1) return mod(2n * first - second);
  if (a === 0 && b === 2) return mod((3n * first - second) * INV2);
  if (a === 1 && b === 2) return mod(3n * first - 2n * second);
  throw new RangeError("pair must be (0,1), (0,2) or (1,2)");
}
