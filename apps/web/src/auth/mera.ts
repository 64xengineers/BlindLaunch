import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getPasskeyPrfOutput,
  type PasskeyCredentialMetadata,
  type WebAuthnClient,
} from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { sha256 } from "@noble/hashes/sha2";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import type { LocalAccount } from "viem";

/** Second PRF namespace: the same passkey gives an unrelated key that encrypts bid notes. */
export const VAULT_SALT = sha256(new TextEncoder().encode("blindlaunch.vault.v1"));
const CREDENTIAL_KEY = "blindlaunch:v2:passkey";

/** Mera's documented path: PRF output → BIP-39 entropy → seed → m/44'/60'/0'/0/0. */
export function accountKeyFromPrf(prfOutput: Uint8Array): Uint8Array {
  const seed = mnemonicToSeedSync(entropyToMnemonic(prfOutput, wordlist));
  const node = HDKey.fromMasterSeed(seed).derive("m/44'/60'/0'/0/0");
  if (!node.privateKey) throw new Error("Passkey derivation produced no key.");
  return node.privateKey;
}

/** Last passkey used here: a hint for transports only. Sign-in never depends on it. */
function storedCredential(): PasskeyCredentialMetadata | undefined {
  try {
    const raw = localStorage.getItem(CREDENTIAL_KEY);
    const parsed = raw ? (JSON.parse(raw) as PasskeyCredentialMetadata) : undefined;
    return parsed && typeof parsed.credentialId === "string" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function rememberCredential(credential: PasskeyCredentialMetadata): void {
  try {
    localStorage.setItem(CREDENTIAL_KEY, JSON.stringify(credential));
  } catch {
    /* Site data blocked: only the hint is lost, the passkey still works. */
  }
}

/** Disconnect: forget the hint. The passkey itself stays on the authenticator. */
export function forgetPasskey(): void {
  try {
    localStorage.removeItem(CREDENTIAL_KEY);
  } catch {
    /* Site data blocked: nothing was saved. */
  }
}

/** The browser's WebAuthn and this host unless given (tests pass a fake authenticator). */
export type PasskeyOptions = { rpId?: string; webAuthnClient?: WebAuthnClient };

function ceremony(options: PasskeyOptions) {
  return { rpId: options.rpId ?? location.hostname, ...(options.webAuthnClient ? { webAuthnClient: options.webAuthnClient } : {}) };
}

export type PasskeySession = {
  account: LocalAccount;
  /** The passkey that signed this session in. The vault key must come from the same one. */
  credential: PasskeyCredentialMetadata;
  end: () => void;
};

/** Creates a passkey (first visit) or signs in with one; the private key lives only in memory. */
export async function passkeyAccount(mode: "create" | "signIn", options: PasskeyOptions = {}): Promise<PasskeySession> {
  const { rpId, ...client } = ceremony(options);
  let credential: PasskeyCredentialMetadata;
  let prfOutput: Uint8Array;
  if (mode === "create") {
    const created = await createPasskeyWithPrfOutput({
      rp: { id: rpId, name: "Blindlaunch" },
      user: { name: "Blindlaunch account", displayName: "Blindlaunch" },
      ...client,
    });
    credential = { credentialId: created.credentialId, ...(created.transports ? { transports: created.transports } : {}) };
    prfOutput = created.prfOutput;
  } else {
    // Discoverable request (no allowCredentials): the authenticator offers every Blindlaunch passkey,
    // so making a second passkey never locks the first one out of this browser.
    const result = await getPasskeyPrfOutput({ rpId, ...client });
    const known = storedCredential();
    credential = known?.credentialId === result.credentialId ? known : { credentialId: result.credentialId };
    prfOutput = result.prfOutput;
  }
  rememberCredential(credential);
  const privateKey = accountKeyFromPrf(prfOutput);
  const session = createSecp256k1SigningSession({ privateKey });
  privateKey.fill(0);
  return { account: toViemAccount(session) as LocalAccount, credential, end: () => session.end() };
}

/** AES-GCM key from the vault namespace of the passkey that signed this session in. One extra passkey prompt. */
export async function passkeyVaultKey(credential: PasskeyCredentialMetadata, options: PasskeyOptions = {}): Promise<CryptoKey> {
  const result = await getPasskeyPrfOutput({ ...ceremony(options), credential, prfSalt: VAULT_SALT });
  // allowCredentials already limits the prompt to this passkey. Check anyway: a vault key from
  // another passkey would seal bid notes that this account could never open.
  if (result.credentialId !== credential.credentialId) throw new Error("Use the passkey you signed in with.");
  return crypto.subtle.importKey("raw", result.prfOutput, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export function hasPasskey(): boolean {
  return storedCredential() !== undefined;
}
