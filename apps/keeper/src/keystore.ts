import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";

type Data = { keys: Record<string, string> };

const hex = (value: bigint) => `0x${value.toString(16)}`;

/**
 * This keeper's per-auction secret keys, keyed by public key x. The file is the keeper's whole
 * secret: owner-only permissions, and every write goes to a temp file that is then renamed, so
 * a crash never leaves a truncated store. Secrets are written before their public keys are
 * enqueued on chain, so a key on chain always has its secret on disk.
 */
export class KeyStore {
  constructor(private readonly path: string) {}

  private load(): Data {
    if (!existsSync(this.path)) return { keys: {} };
    return JSON.parse(readFileSync(this.path, "utf8")) as Data;
  }

  private save(data: Data): void {
    const temp = `${this.path}.tmp`;
    writeFileSync(temp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
    chmodSync(temp, 0o600);
    renameSync(temp, this.path);
  }

  secretFor(x: bigint): bigint | undefined {
    const secret = this.load().keys[hex(x)];
    return secret === undefined ? undefined : BigInt(secret);
  }

  size(): number {
    return Object.keys(this.load().keys).length;
  }

  add(entries: readonly { x: bigint; secret: bigint }[]): void {
    const data = this.load();
    for (const { x, secret } of entries) {
      const existing = data.keys[hex(x)];
      if (existing !== undefined && BigInt(existing) !== secret) throw new Error(`key ${hex(x)} already has a different secret`);
      data.keys[hex(x)] = hex(secret);
    }
    this.save(data);
  }
}
