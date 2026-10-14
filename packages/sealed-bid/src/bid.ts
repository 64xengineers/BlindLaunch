import { encodeAbiParameters, keccak256, type Address, type Hex } from "viem";

export const STEP_SHIFT = 224n;
export const QUANTITY_SHIFT = 128n;
export const MAX_QUANTITY = (1n << 96n) - 1n;
export const MAX_NONCE = (1n << 128n) - 1n;
export const BID_LIMIT = 1n << 232n;

/** `quantity` is in lots; `step` indexes the auction's price ladder. */
export type Bid = { step: number; quantity: bigint; nonce: bigint };

export function encodeBid(bid: Bid): bigint {
  if (!Number.isInteger(bid.step) || bid.step < 0 || bid.step > 255) throw new RangeError("step out of range");
  if (bid.quantity < 0n || bid.quantity > MAX_QUANTITY) throw new RangeError("quantity out of range");
  if (bid.nonce < 0n || bid.nonce > MAX_NONCE) throw new RangeError("nonce out of range");
  return (BigInt(bid.step) << STEP_SHIFT) | (bid.quantity << QUANTITY_SHIFT) | bid.nonce;
}

export function decodeBid(m: bigint): Bid | null {
  if (m < 0n || m >= BID_LIMIT) return null;
  return {
    step: Number(m >> STEP_SHIFT),
    quantity: (m >> QUANTITY_SHIFT) & MAX_QUANTITY,
    nonce: m & MAX_NONCE,
  };
}

/** The chain and auction contract a commitment is bound to. */
export type Domain = { chainId: bigint; contract: Address };

/** `keccak256(abi.encode(chainid, contract, auctionId, bidder, m))`, the `h` stored at commit. */
export function commitmentHash(domain: Domain, auctionId: bigint, bidder: Address, m: bigint): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "uint256" }, { type: "address" }, { type: "uint256" }, { type: "address" }, { type: "uint256" }],
      [domain.chainId, domain.contract, auctionId, bidder, m],
    ),
  );
}
