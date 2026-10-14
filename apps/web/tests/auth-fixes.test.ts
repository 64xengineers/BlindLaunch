import type { WebAuthnClient } from "@category-labs/mera";
import { sha256 } from "@noble/hashes/sha2";
import { afterEach, describe, expect, it } from "vitest";
import { forgetPasskey, hasPasskey, passkeyAccount, passkeyVaultKey, VAULT_SALT } from "../src/auth/mera";
import { savedWallet, saveWallet } from "../src/auth/session";

/** A fake authenticator holding several passkeys. `pick` is the passkey the person chooses in the prompt. */
function authenticator() {
  const passkeys: { id: Uint8Array; secret: Uint8Array }[] = [];
  const requests: WebAuthnClient.GetCredentialRequest[] = [];
  const state = { pick: 0, ignoreAllowList: false };
  const prf = (secret: Uint8Array, salt: Uint8Array) => new Uint8Array(sha256(Uint8Array.from([...secret, ...salt])));
  const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((byte, i) => byte === b[i]);
  const client: WebAuthnClient = {
    async createCredential(request) {
      const passkey = { id: crypto.getRandomValues(new Uint8Array(16)), secret: crypto.getRandomValues(new Uint8Array(32)) };
      passkeys.push(passkey);
      return { credentialId: passkey.id, transports: ["internal"], prfEnabled: true, prfOutput: prf(passkey.secret, request.prfSalt) };
    },
    async getCredential(request) {
      requests.push(request);
      const allow = request.allowCredential;
      const offered = allow && !state.ignoreAllowList ? passkeys.filter((p) => same(p.id, allow.credentialId)) : passkeys;
      const wanted = passkeys[state.pick];
      // The person can only choose a passkey the browser offers; otherwise all they can do is cancel.
      if (!wanted || !offered.includes(wanted)) throw new DOMException("Not allowed.", "NotAllowedError");
      return { credentialId: wanted.id, prfOutput: prf(wanted.secret, request.prfSalt) };
    },
  };
  const options = { rpId: "blindlaunch.test", webAuthnClient: client };
  return { options, passkeys, requests, state, prf };
}

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

function useStorage(storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | "blocked") {
  Object.defineProperty(
    globalThis,
    "localStorage",
    storage === "blocked"
      ? { configurable: true, get: () => { throw new DOMException("Access is denied for this document.", "SecurityError"); } }
      : { configurable: true, value: storage },
  );
}

function memoryStorage() {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
  return { values, storage };
}

afterEach(() => {
  if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
  else delete (globalThis as { localStorage?: Storage }).localStorage;
});

describe("passkey sign-in with more than one passkey", () => {
  it("still signs in with the first passkey after a second one was made here", async () => {
    useStorage(memoryStorage().storage);
    const { options, requests, state } = authenticator();
    const first = await passkeyAccount("create", options);
    const second = await passkeyAccount("create", options);
    expect(second.account.address).not.toBe(first.account.address);

    state.pick = 0;
    const again = await passkeyAccount("signIn", options);
    expect(requests.at(-1)?.allowCredential).toBeUndefined();
    expect(again.account.address).toBe(first.account.address);
    expect(again.credential.credentialId).toBe(first.credential.credentialId);
  });

  it("takes the vault key from the passkey that signed this session in, not the one saved last", async () => {
    useStorage(memoryStorage().storage);
    const { options, passkeys, requests, state, prf } = authenticator();
    const first = await passkeyAccount("create", options);
    await passkeyAccount("create", options); // another tab makes a second passkey; it is now the saved one

    state.pick = 0;
    const key = await passkeyVaultKey(first.credential, options);
    expect(Array.from(requests.at(-1)?.allowCredential?.credentialId ?? [])).toEqual(Array.from(passkeys[0]!.id));

    const expected = await crypto.subtle.importKey("raw", prf(passkeys[0]!.secret, VAULT_SALT), "AES-GCM", false, ["encrypt", "decrypt"]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const sealed = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode("bid note"));
    const opened = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, expected, sealed);
    expect(new TextDecoder().decode(opened)).toBe("bid note");
  });

  it("refuses a vault key from a different passkey", async () => {
    useStorage(memoryStorage().storage);
    const { options, state } = authenticator();
    const first = await passkeyAccount("create", options);
    await passkeyAccount("create", options);
    state.ignoreAllowList = true;
    state.pick = 1;
    await expect(passkeyVaultKey(first.credential, options)).rejects.toThrow("Use the passkey you signed in with.");
  });

  it("forgets the saved passkey on Disconnect", async () => {
    useStorage(memoryStorage().storage);
    await passkeyAccount("create", authenticator().options);
    expect(hasPasskey()).toBe(true);
    forgetPasskey();
    expect(hasPasskey()).toBe(false);
  });
});

describe("blocked site data", () => {
  it("creates and signs in with a passkey when storage throws", async () => {
    useStorage("blocked");
    const { options } = authenticator();
    const created = await passkeyAccount("create", options);
    const again = await passkeyAccount("signIn", options);
    expect(again.account.address).toBe(created.account.address);
    expect(hasPasskey()).toBe(false);
    expect(() => forgetPasskey()).not.toThrow();
  });

  it("keeps the wallet choice in memory when storage access throws", () => {
    useStorage("blocked");
    saveWallet(null);
    expect(savedWallet()).toBeNull();
    saveWallet("io.metamask");
    expect(savedWallet()).toBe("io.metamask");
    saveWallet(null);
    expect(savedWallet()).toBeNull();
  });

  it("keeps the wallet choice in memory when reads work but writes throw", () => {
    useStorage({
      getItem: () => null,
      setItem: () => { throw new DOMException("Quota exceeded.", "QuotaExceededError"); },
      removeItem: () => {},
    });
    saveWallet("io.rabby");
    expect(savedWallet()).toBe("io.rabby");
    saveWallet(null);
    expect(savedWallet()).toBeNull();
  });

  it("uses real storage when it works", () => {
    const { values, storage } = memoryStorage();
    useStorage(storage);
    saveWallet("io.rabby");
    expect(values.get("blindlaunch:v2:wallet")).toBe("io.rabby");
    expect(savedWallet()).toBe("io.rabby");
    saveWallet(null);
    expect(values.has("blindlaunch:v2:wallet")).toBe(false);
    expect(savedWallet()).toBeNull();
  });
});
