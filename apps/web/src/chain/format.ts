import { formatUnits, parseUnits } from "viem";

/** Human amount with thousands separators and at most `maxFraction` fraction digits (rounded down). */
export function formatAmount(value: bigint, decimals: number, maxFraction = 4): string {
  const [whole = "0", fraction = ""] = formatUnits(value, decimals).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const trimmed = fraction.slice(0, maxFraction).replace(/0+$/, "");
  return trimmed ? `${grouped}.${trimmed}` : grouped;
}

/** Parses a typed amount; null when it is not a plain decimal or has more fraction digits than the token allows. */
export function parseAmount(text: string, decimals: number): bigint | null {
  const value = text.trim().replace(/,/g, "");
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return null;
  if ((match[2] ?? "").length > decimals) return null;
  return parseUnits(value, decimals);
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function formatLeft(seconds: number): string {
  const left = Math.max(0, Math.floor(seconds));
  const days = Math.floor(left / 86_400);
  const clock = [Math.floor((left % 86_400) / 3600), Math.floor((left % 3600) / 60), left % 60]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
  return days > 0 ? `${days}d ${clock}` : clock;
}

export function formatDate(seconds: bigint | number): string {
  return new Date(Number(seconds) * 1000).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}
