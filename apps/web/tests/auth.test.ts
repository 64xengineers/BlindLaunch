import { createSecp256k1SigningSession, getEvmAddress } from "@category-labs/mera";
import { privateKeyToAccount } from "viem/accounts";
import { toHex } from "viem";
import { describe, expect, it } from "vitest";
import { createWalletDiscovery } from "../src/auth/eip6963";
import { accountKeyFromPrf } from "../src/auth/mera";
import { noteKey, openNote, readNote, sealNote, writeNote } from "../src/bids/vault";

function announce(target: EventTarget, rdns: string, name: string) {
  const provider = { request: async () => null } as never;
  target.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: { info: { uuid: name, name, icon: "", rdns }, provider } }));
}

describe("wallet discovery (A1)", () => {
  it("lists each announced wallet once, keyed by rdns", () => {
    const target = new EventTarget();
    const discovery = createWalletDiscovery(target);
    announce(target, "io.metamask", "MetaMask");
    announce(target, "io.rabby", "Rabby");
    announce(target, "io.metamask", "MetaMask");
    expect(discovery.list().map((wallet) => wallet.info.rdns)).toEqual(["io.metamask", "io.rabby"]);
    expect(discovery.find("io.rabby")?.info.name).toBe("Rabby");
  });

  it("asks wallets to announce themselves and falls back to window.ethereum", () => {
    const target = new EventTarget();
    let asked = false;
    target.addEventListener("eip6963:requestProvider", () => { asked = true; });
    const legacy = { request: async () => null } as never;
    const discovery = createWalletDiscovery(target, legacy);
    expect(asked).toBe(true);
    expect(discovery.list()).toHaveLength(1);
    expect(discovery.list()[0]?.info.rdns).toBe("injected");
    announce(target, "io.metamask", "MetaMask");
    expect(discovery.list().map((wallet) => wallet.info.rdns)).toEqual(["io.metamask"]);
  });
});

describe("passkey account derivation (A4)", () => {
  it("gives the same address through Mera and through viem, deterministically", () => {
    const prf = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
    const key = accountKeyFromPrf(prf);
    const viaViem = privateKeyToAccount(toHex(key)).address;
    const session = createSecp256k1SigningSession({ privateKey: accountKeyFromPrf(prf) });
    expect(getEvmAddress(session.publicKey)).toBe(viaViem);
    session.end();
    expect(privateKeyToAccount(toHex(accountKeyFromPrf(prf))).address).toBe(viaViem);
    expect(privateKeyToAccount(toHex(accountKeyFromPrf(prf.map((b) => b ^ 1)))).address).not.toBe(viaViem);
  });
});

describe("bid notes (B2, B3)", () => {
  const note = { auctionId: "7", step: 3, lots: "250", commitTx: "0xabc", savedAt: 1 };
  const key = () => crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);

  it("round-trips with the vault key and fails with another", async () => {
    const mine = await key();
    const sealed = await sealNote(mine, note);
    expect(await openNote(mine, sealed)).toEqual(note);
    expect(await openNote(await key(), sealed)).toBeNull();
  });

  it("reads corrupted storage as missing", async () => {
    const values = new Map<string, string>();
    const storage = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => void values.set(k, v) };
    const slot = noteKey(10143, "0xAbC", "0xDeF", 7n);
    expect(slot).toBe("blindlaunch:v2:note:10143:0xabc:0xdef:7");
    values.set(slot, "{ not json");
    expect(readNote(storage, slot)).toBeNull();
    values.set(slot, JSON.stringify({ iv: 1 }));
    expect(readNote(storage, slot)).toBeNull();
    const sealed = await sealNote(await key(), note);
    writeNote(storage, slot, sealed);
    expect(readNote(storage, slot)).toEqual(sealed);
  });
});
