import { describe, expect, it } from "vitest";
import { formatAmount, parseAmount } from "../src/chain/format";

describe("parseAmount commas", () => {
  it("refuses a decimal comma instead of reading it as a thousands separator", () => {
    expect(parseAmount("0,05", 6)).toBeNull(); // was 5
    expect(parseAmount("2,5", 6)).toBeNull(); // was 25
    expect(parseAmount("1,5", 2)).toBeNull(); // seed percent: was 15%
    expect(parseAmount("0,050", 6)).toBeNull(); // a zero lead group is not thousands: was 50
    expect(parseAmount("1,0000", 6)).toBeNull();
    expect(parseAmount("1000,000", 6)).toBeNull();
    expect(parseAmount("1,000,5", 6)).toBeNull();
    expect(parseAmount("1,000.5,0", 6)).toBeNull();
    expect(parseAmount(",500", 6)).toBeNull();
    expect(parseAmount("500,", 6)).toBeNull();
  });

  it("still reads commas that group thousands", () => {
    expect(parseAmount("1,000", 6)).toBe(1_000_000_000n);
    expect(parseAmount(" 12,345,678.25 ", 2)).toBe(1_234_567_825n);
    expect(parseAmount("999,999", 0)).toBe(999_999n);
    expect(parseAmount("1000000", 18)).toBe(10n ** 24n);
    expect(parseAmount("0.05", 6)).toBe(50_000n);
  });

  it("reads back what formatAmount shows", () => {
    for (const [value, decimals] of [[1_234_567_891_234n, 6], [50_000n, 6], [10n ** 27n, 18], [999n, 0]] as const) {
      expect(parseAmount(formatAmount(value, decimals, decimals), decimals)).toBe(value);
    }
  });
});
