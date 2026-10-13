import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { KeyStore } from "../src/keystore";

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

  it("refuses to overwrite a secret with a different one", () => {
    const store = new KeyStore(freshPath());
    store.add([{ x: 1n, secret: 2n }]);
    expect(() => store.add([{ x: 1n, secret: 9n }])).toThrow(/different secret/);
  });
});
