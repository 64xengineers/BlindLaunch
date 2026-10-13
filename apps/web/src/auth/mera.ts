import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getPasskeyPrfOutput,
  type PasskeyCredentialMetadata,
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

function storedCredential(): PasskeyCredentialMetadata | undefined {
  try {
    const raw = localStorage.getItem(CREDENTIAL_KEY);
    const parsed = raw ? (JSON.parse(raw) as PasskeyCredentialMetadata) : undefined;
    return parsed && typeof parsed.credentialId === "string" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export type PasskeySession = { account: LocalAccount; end: () => void };

/** Creates a passkey (first visit) or signs in with one; the private key lives only in memory. */
export async function passkeyAccount(mode: "create" | "signIn"): Promise<PasskeySession> {
  const rpId = location.hostname;
  let prfOutput: Uint8Array;
  if (mode === "create") {
    const created = await createPasskeyWithPrfOutput({
      rp: { id: rpId, name: "Blindlaunch" },
      user: { name: "Blindlaunch account", displayName: "Blindlaunch" },
    });
    localStorage.setItem(CREDENTIAL_KEY, JSON.stringify({ credentialId: created.credentialId, transports: created.transports }));
    prfOutput = created.prfOutput;
  } else {
    const credential = storedCredential();
    const result = await getPasskeyPrfOutput(credential ? { rpId, credential } : { rpId });
    localStorage.setItem(CREDENTIAL_KEY, JSON.stringify({ ...(credential ?? {}), credentialId: result.credentialId }));
    prfOutput = result.prfOutput;
  }
  const privateKey = accountKeyFromPrf(prfOutput);
  const session = createSecp256k1SigningSession({ privateKey });
  privateKey.fill(0);
  return { account: toViemAccount(session) as LocalAccount, end: () => session.end() };
}

/** AES-GCM key from the passkey's vault namespace. One extra passkey prompt. */
export async function passkeyVaultKey(): Promise<CryptoKey> {
  const credential = storedCredential();
  const rpId = location.hostname;
  const { prfOutput } = await getPasskeyPrfOutput(credential ? { rpId, credential, prfSalt: VAULT_SALT } : { rpId, prfSalt: VAULT_SALT });
  return crypto.subtle.importKey("raw", prfOutput, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export function hasPasskey(): boolean {
  return storedCredential() !== undefined;
}
