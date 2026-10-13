import { BaseError, ContractFunctionRevertedError, InsufficientFundsError, UserRejectedRequestError } from "viem";

/** One sentence for every custom error in BlindAuctionV2, MarketSeeder and KeeperRegistry. */
export const errorMessages: Record<string, string> = {
  ZeroAddress: "An address is missing.",
  SameToken: "The token for sale and the payment token must differ.",
  NotAContract: "That address is not a token contract.",
  BadSupply: "The supply must be above zero.",
  BadLot: "The supply must be a whole number of tokens.",
  BadGrid: "The price ladder is not valid.",
  BadDeposit: "The deposit must cover at least one token at the lowest price.",
  BadBids: "The number of bids must be between 1 and 65,535.",
  BadSchedule: "The schedule is not valid. Bidding may have started before the transaction landed; try again.",
  BadSeed: "The market seeding settings are not valid.",
  SeederNotSet: "Market seeding is not available on this deployment.",
  SeederAlreadySet: "The seeder is already set.",
  NotDeployer: "Only the deployer can do that.",
  MissingAuction: "That auction does not exist.",
  NotOpen: "This auction is no longer open for that.",
  TooEarly: "It is too early for that.",
  TooLate: "Too late: that window has closed.",
  AuthorityBid: "The creator of an auction cannot bid in it.",
  AlreadyBid: "This wallet already sealed a bid in this auction.",
  AuctionFull: "Every bid slot is taken.",
  BadPoint: "The sealed bid is malformed.",
  BadKeeper: "Unknown keeper.",
  KeysComplete: "Two keeper keys are already published.",
  AlreadyPublished: "That keeper key is already published.",
  BadKey: "That keeper key does not match.",
  NotEnoughKeys: "The keepers have not published two keys yet.",
  UnknownSlot: "Unknown bid.",
  AlreadyOpened: "That bid is already open.",
  BadShare: "A shared key does not match. Reload and try again.",
  LengthMismatch: "Mismatched inputs.",
  BidsUnopened: "Some bids are still sealed. Open them first.",
  BadStatus: "Not possible in the auction's current state.",
  UnknownBidder: "This wallet has no bid in this auction.",
  AlreadyClaimed: "Already claimed.",
  NotAuthority: "Only the auction's creator can do that.",
  AlreadyReclaimed: "Already reclaimed.",
  NothingToBurn: "There are no forfeited deposits to burn.",
  NoSeed: "There is no reserved market seed to hand off.",
  AllowanceLeft: "The seeder did not take the exact amounts.",
  TransferFailed: "A token transfer failed. The token may be paused or may charge a fee.",
  Reentrancy: "Unexpected re-entry.",
  BadPair: "Unexpected keeper pair.",
  NotAuction: "Only the auction contract can do that.",
  AlreadyAccepted: "That seed was already handed off.",
  NotAccepted: "There is no seed for that auction.",
  AlreadySeeded: "The market is already seeded.",
  Locked: "The market seed is still locked.",
  AlreadyUnwound: "The market seed was already unwound.",
  BadParams: "The Kuru market settings are not valid.",
  OffTick: "A ladder price falls between Kuru ticks.",
  PriceTooLow: "The lowest price is too low for a Kuru market.",
  PriceTooHigh: "The top price is too high for a Kuru market.",
  DeployFailed: "Kuru did not create the market. Anyone can retry.",
  NotAKuruMarket: "That address is not a Kuru market.",
  MarketMismatch: "That Kuru market is for different tokens or settings than this launch declared.",
  NotKeeper: "Only that keeper's owner can do that.",
  AuctionAlreadySet: "The auction is already set.",
  NoKeeperKeys: "The keepers have no fresh keys right now. Try again in a minute.",
  DuplicateKey: "That keeper key was used before.",
  ZeroOwner: "The owner cannot be empty.",
};

export function friendlyError(error: unknown): string {
  if (error instanceof BaseError) {
    if (error.walk((e) => e instanceof UserRejectedRequestError)) return "You cancelled the request in your wallet.";
    if (error.walk((e) => e instanceof InsufficientFundsError)) return "Not enough MON to pay for gas.";
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      if (name && errorMessages[name]) return errorMessages[name];
      if (revert.reason) return `The contract refused: ${revert.reason}.`;
    }
    return error.shortMessage;
  }
  const code = (error as { code?: number } | null)?.code;
  if (code === 4001) return "You cancelled the request in your wallet.";
  return error instanceof Error ? error.message.split("\n")[0] ?? "Something went wrong." : "Something went wrong.";
}
