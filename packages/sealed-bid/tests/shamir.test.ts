import { describe, expect, it } from "vitest";
import { deterministicRng, N } from "../src/curve";
import { INV2, shamirReconstruct, shamirSplit, type KeeperIndex } from "../src/shamir";

const pairs: [KeeperIndex, KeeperIndex][] = [[0, 1], [0, 2], [1, 2]];

describe("shamir 2-of-3", () => {
  it("INV2 is the inverse of 2 mod n", () => {
    expect((2n * INV2) % N).toBe(1n);
  });

  it("reconstructs from every pair", () => {
    const m = (5n << 224n) | (400n << 128n) | 77n;
    const shares = shamirSplit(m, deterministicRng("split"));
    for (const [a, b] of pairs) {
      expect(shamirReconstruct(a, b, shares[a], shares[b])).toBe(m);
    }
  });

  it("reduces inputs mod n first, as the contract does", () => {
    const shares = shamirSplit(42n, deterministicRng("reduce"));
    expect(shamirReconstruct(0, 1, shares[0] + N, shares[1])).toBe(42n);
  });

  it("uses a fresh slope per split", () => {
    const one = shamirSplit(42n, deterministicRng("one"));
    const two = shamirSplit(42n, deterministicRng("two"));
    expect(one[0]).not.toBe(two[0]);
  });

  it("rejects pairs other than (0,1), (0,2), (1,2)", () => {
    expect(() => shamirReconstruct(1 as KeeperIndex, 0 as KeeperIndex, 1n, 1n)).toThrow(RangeError);
    expect(() => shamirReconstruct(0, 0, 1n, 1n)).toThrow(RangeError);
  });

  it("rejects secrets outside [0, n)", () => {
    expect(() => shamirSplit(N, deterministicRng("x"))).toThrow(RangeError);
  });
});
