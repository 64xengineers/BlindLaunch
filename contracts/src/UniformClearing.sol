// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title UniformClearing
/// @notice Integer uniform-price clearing used by the Monad auction.
/// @dev Matches `packages/auction-core`: the clearing step is the highest
///      grid step whose demand covers `supply`. Undersubscribed auctions
///      still clear at step 0. Dust at the clearing step is handed out one
///      unit at a time. Callers must pass bids in ascending slot order so
///      that dust goes to earlier slots first.
library UniformClearing {
    error Oversold();
    error ClearingDust();

    struct Bid {
        uint32 slot;
        uint32 priceStep;
        uint256 quantity;
        uint256 allocation;
    }

    struct Outcome {
        uint32 clearingStep;
        uint256 clearingPrice;
        uint256 totalSold;
    }

    function quotePerToken(uint256 minPrice, uint256 stepSize, uint32 step) internal pure returns (uint256) {
        return minPrice + (uint256(step) * stepSize);
    }

    function clear(
        uint256 supply,
        uint256 minPrice,
        uint256 stepSize,
        uint32 stepCount,
        Bid[] memory bids
    ) internal pure returns (Outcome memory outcome) {
        if (bids.length == 0) {
            return Outcome({clearingStep: 0, clearingPrice: 0, totalSold: 0});
        }

        uint32 clearingStep = _findClearingStep(supply, stepCount, bids);
        _allocate(supply, bids, clearingStep);

        uint256 totalSold;
        uint256 length = bids.length;
        for (uint256 i = 0; i < length; ++i) {
            totalSold += bids[i].allocation;
        }
        if (totalSold > supply) revert Oversold();

        outcome = Outcome({
            clearingStep: clearingStep,
            clearingPrice: quotePerToken(minPrice, stepSize, clearingStep),
            totalSold: totalSold
        });
    }

    function _findClearingStep(uint256 supply, uint32 stepCount, Bid[] memory bids) private pure returns (uint32) {
        uint256 length = bids.length;
        for (uint32 step = stepCount; step > 0;) {
            unchecked {
                --step;
            }
            uint256 demand;
            for (uint256 i = 0; i < length; ++i) {
                if (bids[i].priceStep >= step) {
                    demand += bids[i].quantity;
                }
            }
            if (demand >= supply) {
                return step;
            }
        }
        return 0;
    }

    function _allocate(uint256 supply, Bid[] memory bids, uint32 clearingStep) private pure {
        uint256 length = bids.length;
        uint256[] memory atIndexes = new uint256[](length);
        uint256 atCount;
        uint256 aboveTotal;

        for (uint256 i = 0; i < length; ++i) {
            if (bids[i].priceStep > clearingStep) {
                bids[i].allocation = bids[i].quantity;
                aboveTotal += bids[i].quantity;
            } else if (bids[i].priceStep == clearingStep) {
                atIndexes[atCount] = i;
                ++atCount;
            }
        }
        if (aboveTotal > supply) revert Oversold();

        uint256 remaining = supply - aboveTotal;
        uint256 atDemand;
        for (uint256 n = 0; n < atCount; ++n) {
            atDemand += bids[atIndexes[n]].quantity;
        }
        if (atDemand == 0 || remaining == 0) {
            return;
        }
        if (atDemand <= remaining) {
            for (uint256 n = 0; n < atCount; ++n) {
                uint256 index = atIndexes[n];
                bids[index].allocation = bids[index].quantity;
            }
            return;
        }

        uint256 allocated;
        for (uint256 n = 0; n < atCount; ++n) {
            uint256 index = atIndexes[n];
            uint256 share = (remaining * bids[index].quantity) / atDemand;
            bids[index].allocation = share;
            allocated += share;
        }

        uint256 dust = remaining - allocated;
        for (uint256 pass = 0; dust > 0 && pass < atCount; ++pass) {
            for (uint256 n = 0; n < atCount && dust > 0; ++n) {
                uint256 index = atIndexes[n];
                if (bids[index].allocation < bids[index].quantity) {
                    bids[index].allocation += 1;
                    --dust;
                }
            }
        }
        if (dust > 0) revert ClearingDust();
    }
}
