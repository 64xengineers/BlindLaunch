/** A private record of a sealed bid, kept only for passkey users and encrypted with their vault key. */
export type BidNote = { auctionId: string; step: number; lots: string; commitTx: string; savedAt: number };
export type SealedNote = { iv: string; data: string };
type KeyValueStore = Pick<Storage, "getItem" | "setItem">;

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));

export function noteKey(chainId: number, auction: string, bidder: string, auctionId: bigint): string {
  return `blindlaunch:v2:note:${chainId}:${auction.toLowerCase()}:${bidder.toLowerCase()}:${auctionId}`;
}

export async function sealNote(key: CryptoKey, note: BidNote): Promise<SealedNote> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(note)));
  return { iv: toBase64(iv), data: toBase64(new Uint8Array(data)) };
}

/** Null when the key is wrong or the record was tampered with (AES-GCM authenticates). */
export async function openNote(key: CryptoKey, sealed: SealedNote): Promise<BidNote | null> {
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(sealed.iv) }, key, fromBase64(sealed.data));
    const note = JSON.parse(new TextDecoder().decode(plain)) as BidNote;
    return typeof note.step === "number" && typeof note.lots === "string" ? note : null;
  } catch {
    return null;
  }
}

/** Corrupted or foreign entries read as missing, never as an exception. */
export function readNote(storage: KeyValueStore, key: string): SealedNote | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SealedNote>;
    return typeof parsed.iv === "string" && typeof parsed.data === "string" ? { iv: parsed.iv, data: parsed.data } : null;
  } catch {
    return null;
  }
}

export function writeNote(storage: KeyValueStore, key: string, sealed: SealedNote): void {
  storage.setItem(key, JSON.stringify(sealed));
}
