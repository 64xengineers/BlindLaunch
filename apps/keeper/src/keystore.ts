import { randomBytes } from "node:crypto";
import { closeSync, existsSync, fchmodSync, fsyncSync, openSync, readFileSync, renameSync, unlinkSync, writeSync } from "node:fs";
import { dirname } from "node:path";

type Data = { keys: Record<string, string> };

const hex = (value: bigint) => `0x${value.toString(16)}`;

function alive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * This keeper's per-auction secret keys, keyed by public key x. The file is the keeper's whole
 * secret: owner-only permissions, and every write goes to a uniquely named temp file that is
 * fsynced, renamed over the store, and made durable by fsyncing the directory, so a crash never
 * leaves a truncated store and a secret is on disk before its public key is enqueued on chain.
 */
export class KeyStore {
  private lockFd: number | undefined;

  constructor(private readonly path: string) {}

  /**
   * Holds `<path>.lock` for the life of this process, so two keeper processes on one KEY_STORE
   * cannot overwrite each other's secrets. Throws while another live process holds it; a lock left
   * by a process that has exited is taken over.
   */
  lock(): void {
    const lockPath = `${this.path}.lock`;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const fd = openSync(lockPath, "wx", 0o600);
        writeSync(fd, String(process.pid));
        this.lockFd = fd;
        process.once("exit", () => this.unlock());
        return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const holder = Number(readFileSync(lockPath, "utf8").trim());
        if (alive(holder)) throw new Error(`${this.path} is locked by process ${holder}: refusing to run a second keeper on it`);
        unlinkSync(lockPath); // its process is gone
      }
    }
    throw new Error(`could not lock ${this.path}`);
  }

  unlock(): void {
    if (this.lockFd === undefined) return;
    closeSync(this.lockFd);
    this.lockFd = undefined;
    unlinkSync(`${this.path}.lock`);
  }

  private load(): Data {
    if (!existsSync(this.path)) return { keys: {} };
    return JSON.parse(readFileSync(this.path, "utf8")) as Data;
  }

  private save(data: Data): void {
    const temp = `${this.path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
    const fd = openSync(temp, "wx", 0o600);
    try {
      fchmodSync(fd, 0o600);
      writeSync(fd, `${JSON.stringify(data, null, 2)}\n`);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temp, this.path);
    const dir = openSync(dirname(this.path), "r");
    try {
      fsyncSync(dir);
    } finally {
      closeSync(dir);
    }
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
