import { getAddress, isAddress, type Address } from "viem";

/** `deployments/<chainId>.json`, written by `contracts/script/DeployV2.s.sol`. */
export type Deployment = {
  chainId: number;
  deployBlock: bigint;
  registry: Address;
  auction: Address;
  seeder: Address;
  factory: Address;
  quote: Address;
};

const addressKeys = ["registry", "auction", "seeder", "factory", "quote"] as const;

export function parseDeployment(json: unknown): Deployment {
  if (typeof json !== "object" || json === null) throw new TypeError("deployment must be an object");
  const record = json as Record<string, unknown>;
  const chainId = Number(record.chainId);
  if (!Number.isInteger(chainId) || chainId <= 0) throw new TypeError("deployment.chainId must be a positive integer");
  const deployBlock = BigInt(record.deployBlock as string | number);
  const addresses = Object.fromEntries(
    addressKeys.map((key) => {
      const value = record[key];
      if (typeof value !== "string" || !isAddress(value, { strict: false })) throw new TypeError(`deployment.${key} must be an address`);
      return [key, getAddress(value)];
    }),
  ) as Record<(typeof addressKeys)[number], Address>;
  return { chainId, deployBlock, ...addresses };
}
