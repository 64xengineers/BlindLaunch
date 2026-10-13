// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice What BlindAuctionV2 needs from a market seeder.
///         `validate` runs at auction creation and must revert on unusable parameters.
///         `accept` pulls exactly the approved amounts with transferFrom and records them.
///         `seed` creates the market and posts the orders; anyone calls it after the hand-off, and may retry it.
interface IMarketSeeder {
    struct SeedConfig {
        address saleToken;
        address quoteToken;
        uint256 lotSize;
        uint256 minPrice;
        uint256 stepSize;
        uint32 stepCount;
        bytes kuruParams;
    }

    struct SeedOrder {
        uint256 auctionId;
        address authority;
        address saleToken;
        address quoteToken;
        uint256 saleAmount;
        uint256 quoteAmount;
        uint256 clearingPrice;
        uint256 lotSize;
        uint64 lockUntil;
        bytes kuruParams;
    }

    function validate(SeedConfig calldata config) external view;
    function accept(SeedOrder calldata order) external;
    function seed(uint256 auctionId) external;
}
