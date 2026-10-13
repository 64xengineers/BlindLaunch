import { readFileSync } from "node:fs";
import { parseDeployment, type Deployment } from "@blindlaunch/abi";
import type { Hex } from "viem";
import type { KeeperIndex } from "./decide";

export type KeeperConfig = {
  rpcUrl: string;
  keeperIndex: KeeperIndex;
  privateKey: Hex;
  keyStorePath: string;
  queueTarget: number;
  pollMs: number;
  deployment: Deployment;
};

export function loadConfig(env: Record<string, string | undefined>): KeeperConfig {
  const need = (name: string): string => {
    const value = env[name];
    if (!value) throw new Error(`${name} is required`);
    return value;
  };
  const keeperIndex = Number(need("KEEPER_INDEX"));
  if (keeperIndex !== 0 && keeperIndex !== 1 && keeperIndex !== 2) throw new Error("KEEPER_INDEX must be 0, 1 or 2");
  const privateKey = need("KEEPER_PRIVATE_KEY");
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) throw new Error("KEEPER_PRIVATE_KEY must be a 32-byte hex key");
  const queueTarget = Number(env.QUEUE_TARGET ?? 20);
  const pollMs = Number(env.POLL_MS ?? 2000);
  if (!Number.isInteger(queueTarget) || queueTarget < 1) throw new Error("QUEUE_TARGET must be a positive integer");
  if (!Number.isInteger(pollMs) || pollMs < 100) throw new Error("POLL_MS must be at least 100");
  return {
    rpcUrl: need("RPC_URL"),
    keeperIndex,
    privateKey: privateKey as Hex,
    keyStorePath: need("KEY_STORE"),
    queueTarget,
    pollMs,
    deployment: parseDeployment(JSON.parse(readFileSync(need("DEPLOYMENT"), "utf8"))),
  };
}
