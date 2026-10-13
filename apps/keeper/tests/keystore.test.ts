import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { KeyStore } from "../src/keystore";

const fsCalls: string[] = vi.hoisted(() => []);
vi.mock("node:fs", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs")>();
  return {
    ...fs,
    fsyncSync: (fd: number) => {
      fsCalls.push(fs.fstatSync(fd).isDirectory() ? "fsync-dir" : "fsync-file");
      fs.fsyncSync(fd);
    },
    renameSync: (from: string, to: string) => {
      fsCalls.push("rename");
      fs.renameSync(from, to);
    },
  };
});

function freshPath() {
  return join(mkdtempSync(join(tmpdir(), "keeper-")), "keys.json");
}

describe("KeyStore (K1)", () => {
  it("starts empty when the file does not exist", () => {
    expect(new KeyStore(freshPath()).secretFor(1n)).toBeUndefined();
  });

  it("round-trips secrets keyed by the public key x", () => {
    const path = freshPath();
    new KeyStore(path).add([{ x: 0xabcn, secret: 0x123n }, { x: 0xdefn, secret: 0x456n }]);
    const reloaded = new KeyStore(path);
    expect(reloaded.secretFor(0xabcn)).toBe(0x123n);
    expect(reloaded.secretFor(0xdefn)).toBe(0x456n);
    expect(reloaded.size()).toBe(2);
  });

  it("is readable by its owner only", () => {
    const path = freshPath();
    new KeyStore(path).add([{ x: 1n, secret: 2n }]);
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it("never leaves a half-written file: writes a temp file and renames it", () => {
    const path = freshPath();
    const store = new KeyStore(path);
    store.add([{ x: 1n, secret: 2n }]);
    writeFileSync(`${path}.tmp`, "{ garbage from a crash");
    store.add([{ x: 3n, secret: 4n }]);
    expect(JSON.parse(readFileSync(path, "utf8")).keys).toHaveProperty("0x3");
    expect(new KeyStore(path).secretFor(1n)).toBe(2n);
  });

  it("is durable before it returns: fsyncs the temp file, renames it, then fsyncs the directory", () => {
    const store = new KeyStore(freshPath());
    fsCalls.length = 0;
    store.add([{ x: 1n, secret: 2n }]);
    expect(fsCalls).toEqual(["fsync-file", "rename", "fsync-dir"]);
  });

  it("uses a unique temp file per write and leaves none behind", () => {
    const path = freshPath();
    const store = new KeyStore(path);
    store.add([{ x: 1n, secret: 2n }]);
    store.add([{ x: 3n, secret: 4n }]);
    expect(readdirSync(dirname(path))).toEqual(["keys.json"]);
  });

  it("refuses a second lock while a live process holds it, and takes over a stale one", () => {
    const path = freshPath();
    const first = new KeyStore(path);
    first.lock();
    expect(() => new KeyStore(path).lock()).toThrow(/locked by process/);
    first.unlock();
    expect(existsSync(`${path}.lock`)).toBe(false);

    writeFileSync(`${path}.lock`, "99999999"); // a process that no longer exists
    const second = new KeyStore(path);
    second.lock();
    expect(readFileSync(`${path}.lock`, "utf8")).toBe(String(process.pid));
    second.unlock();
  });

  it("refuses to overwrite a secret with a different one", () => {
    const store = new KeyStore(freshPath());
    store.add([{ x: 1n, secret: 2n }]);
    expect(() => store.add([{ x: 1n, secret: 9n }])).toThrow(/different secret/);
  });
});
