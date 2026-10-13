import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { buildVectors, vectorsPath } from "./buildVectors";

mkdirSync(dirname(vectorsPath), { recursive: true });
writeFileSync(vectorsPath, buildVectors());
console.log(`wrote ${vectorsPath}`);
