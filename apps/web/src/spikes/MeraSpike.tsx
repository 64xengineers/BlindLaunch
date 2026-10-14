import { useState } from "react";
import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getEvmAddress,
  getPasskeyPrfOutput,
} from "@category-labs/mera";
import { sha256 } from "@noble/hashes/sha2";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";

const VAULT_SALT = sha256(new TextEncoder().encode("blindlaunch.vault.v1"));

function accountFromPrf(prfOutput: Uint8Array): string {
  const seed = mnemonicToSeedSync(entropyToMnemonic(prfOutput, wordlist));
  const node = HDKey.fromMasterSeed(seed).derive("m/44'/60'/0'/0/0");
  if (!node.privateKey) throw new Error("derivation produced no key");
  const session = createSecp256k1SigningSession({ privateKey: node.privateKey });
  const address = getEvmAddress(session.publicKey);
  session.end();
  return address;
}

async function roundTrip(vaultPrf: Uint8Array<ArrayBuffer>): Promise<string> {
  const key = await crypto.subtle.importKey("raw", vaultPrf, "AES-GCM", false, ["encrypt", "decrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode("sealed bid record"));
  const opened = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, sealed);
  return new TextDecoder().decode(opened);
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function MeraSpike() {
  const [lines, setLines] = useState<string[]>([`rpId ${location.hostname}`, `ua ${navigator.userAgent}`]);
  const log = (line: string) => setLines((current) => [...current, line]);

  async function create() {
    try {
      const result = await createPasskeyWithPrfOutput({
        rp: { id: location.hostname, name: "Blindlaunch" },
        user: { name: "spike@blindlaunch", displayName: "Blindlaunch spike" },
      });
      log(`created; account ${accountFromPrf(result.prfOutput)}`);
    } catch (error) {
      log(`create failed: ${String(error)}`);
    }
  }

  async function signIn() {
    try {
      const account = await getPasskeyPrfOutput({ rpId: location.hostname });
      const vault = await getPasskeyPrfOutput({ rpId: location.hostname, prfSalt: VAULT_SALT });
      log(`account ${accountFromPrf(account.prfOutput)}`);
      log(`account prf ${hex(account.prfOutput).slice(0, 16)}…`);
      log(`vault prf ${hex(vault.prfOutput).slice(0, 16)}…`);
      log(`outputs differ: ${hex(account.prfOutput) !== hex(vault.prfOutput)}`);
      log(`vault round trip: ${await roundTrip(vault.prfOutput)}`);
    } catch (error) {
      log(`sign-in failed: ${String(error)}`);
    }
  }

  return (
    <section className="mx-auto max-w-2xl space-y-4 p-6 text-sm">
      <h1 className="text-xl font-semibold">Mera PRF spike</h1>
      <div className="flex gap-3">
        <button className="rounded border px-3 py-2" onClick={() => void create()}>Create passkey</button>
        <button className="rounded border px-3 py-2" onClick={() => void signIn()}>Sign in (two salts)</button>
      </div>
      <pre className="whitespace-pre-wrap break-all rounded border p-3">{lines.join("\n")}</pre>
    </section>
  );
}
