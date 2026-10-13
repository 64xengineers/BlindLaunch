import { secp256k1 } from "@noble/curves/secp256k1";
import { expect, it } from "vitest";

it("loads the pinned noble curves API", () => {
  expect(typeof secp256k1.ProjectivePoint.BASE.multiply).toBe("function");
});
