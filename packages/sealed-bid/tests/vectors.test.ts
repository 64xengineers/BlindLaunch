import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { buildVectors, vectorsPath } from "../scripts/buildVectors";

it("checked-in Foundry vectors match the current sealing code (run `pnpm vectors` if this fails)", () => {
  expect(readFileSync(vectorsPath, "utf8")).toBe(buildVectors());
});
