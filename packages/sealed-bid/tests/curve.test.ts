import { secp256k1 } from "@noble/curves/secp256k1";
import { describe, expect, it } from "vitest";
import { deterministicRng, G, isValid, mul, mulBase, N, randomScalar } from "../src/curve";

describe("curve", () => {
  it("uses the secp256k1 group order", () => {
    expect(N).toBe(secp256k1.CURVE.n);
  });

  it("puts G on the curve and matches noble for k·G", () => {
    expect(isValid(G)).toBe(true);
    expect(mulBase(123456789n)).toEqual(secp256k1.ProjectivePoint.BASE.multiply(123456789n).toAffine());
  });

  it("satisfies a·(b·G) = (a·b mod n)·G", () => {
    const a = 0xabcdefn;
    const b = 0x123457n;
    expect(mul(mulBase(b), a)).toEqual(mulBase((a * b) % N));
  });

  it("rejects x = 0, x ≥ n and off-curve y", () => {
    expect(isValid({ x: 0n, y: G.y })).toBe(false);
    expect(isValid({ x: N, y: G.y })).toBe(false);
    expect(isValid({ x: G.x, y: G.y + 1n })).toBe(false);
  });

  it("redraws scalars that are 0 or ≥ n", () => {
    const draws = [new Uint8Array(32), new Uint8Array(32).fill(0xff), Uint8Array.from({ length: 32 }, (_, i) => (i === 31 ? 7 : 0))];
    const rng = () => draws.shift() ?? new Uint8Array(32);
    expect(randomScalar(rng)).toBe(7n);
  });

  it("deterministicRng is reproducible and seed-dependent", () => {
    const a = deterministicRng("seed")(48);
    expect(deterministicRng("seed")(48)).toEqual(a);
    expect(deterministicRng("other")(48)).not.toEqual(a);
  });
});
