// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BlindAuctionV2} from "../../src/BlindAuctionV2.sol";
import {V2Base} from "./V2Base.sol";

contract SettleTest is V2Base {
    event AuctionSettled(uint256 indexed auctionId, uint32 clearingStep, uint256 clearingPrice, uint256 totalSold);

    function test_referenceExampleClearsAt60() public {
        uint256 id = _create();
        _bid(id, alice, 5, 400);
        _bid(id, bob, 3, 300);
        _bid(id, cara, 1, 500);
        _bid(id, dan, 0, 400);
        _closeAndOpenAll(id);
        assertTrue(auction.canSettle(id));
        vm.expectEmit(address(auction));
        emit AuctionSettled(id, 1, 60, 1000);
        auction.settle(id);

        BlindAuctionV2.Auction memory a = auction.getAuction(id);
        assertEq(uint256(a.status), uint256(BlindAuctionV2.Status.Settled));
        assertEq(a.clearingStep, 1);
        assertEq(a.clearingPrice, 60);
        assertEq(a.aboveTotal, 700);
        assertEq(a.remaining, 300);
        assertEq(a.atDemand, 500);
        assertEq(a.totalSold, 1000);
        assertEq(auction.allocationOf(id, alice), 400);
        assertEq(auction.allocationOf(id, bob), 300);
        assertEq(auction.allocationOf(id, cara), 300);
        assertEq(auction.allocationOf(id, dan), 0);
    }

    function test_undersubscribedSellsAllCountedAtFloor() public {
        uint256 id = _create();
        _bid(id, alice, 5, 100);
        _bid(id, bob, 0, 50);
        _closeAndOpenAll(id);
        auction.settle(id);
        BlindAuctionV2.Auction memory a = auction.getAuction(id);
        assertEq(a.clearingStep, 0);
        assertEq(a.clearingPrice, 50);
        assertEq(a.totalSold, 150);
    }

    function test_noBidsSellsNothingAtPriceZero() public {
        uint256 id = _create();
        _close(id, 0, 1);
        auction.settle(id);
        BlindAuctionV2.Auction memory a = auction.getAuction(id);
        assertEq(a.clearingPrice, 0);
        assertEq(a.totalSold, 0);
    }

    function test_onlyInvalidBidsSellsNothing() public {
        uint256 id = _create();
        _bid(id, alice, 9, 10);
        _closeAndOpenAll(id);
        auction.settle(id);
        assertEq(auction.getAuction(id).clearingPrice, 0);
        assertEq(auction.getAuction(id).totalSold, 0);
    }

    function test_exactFillAtClearingStepIsNotProRata() public {
        uint256 id = _create();
        _bid(id, alice, 4, 600);
        _bid(id, bob, 2, 400);
        _closeAndOpenAll(id);
        auction.settle(id);
        BlindAuctionV2.Auction memory a = auction.getAuction(id);
        assertEq(a.clearingStep, 2);
        assertEq(a.totalSold, 1000);
        assertEq(auction.allocationOf(id, bob), 400);
    }

    function test_proRataSellsExactlyTheRemainingSupply() public {
        BlindAuctionV2.CreateParams memory p = _params();
        p.supply = 10;
        uint256 id = _create(p);
        _bid(id, alice, 2, 4);
        _bid(id, bob, 2, 4);
        _bid(id, cara, 2, 4);
        _closeAndOpenAll(id);
        auction.settle(id);
        BlindAuctionV2.Auction memory a = auction.getAuction(id);
        assertEq(a.totalSold, 10);
        assertEq(auction.allocationOf(id, alice), 3);
        assertEq(auction.allocationOf(id, bob), 3);
        assertEq(auction.allocationOf(id, cara), 4, "cumulative rounding gives the last unit to the last opened");
    }

    /// Audit H3: floor rounding sold nothing here.
    function test_oneLotTwoBiddersSellsTheLot() public {
        BlindAuctionV2.CreateParams memory p = _params();
        p.supply = 1;
        uint256 id = _create(p);
        _bid(id, alice, 2, 1);
        _bid(id, bob, 2, 1);
        _closeAndOpenAll(id);
        auction.settle(id);
        assertEq(auction.getAuction(id).totalSold, 1);
        assertEq(auction.allocationOf(id, alice) + auction.allocationOf(id, bob), 1);
    }

    /// Audit H3: one refunded 1-lot sybil halved this sale under floor rounding.
    function test_oneLotSybilCannotShrinkTheSale() public {
        BlindAuctionV2.CreateParams memory p = _params();
        p.supply = 10;
        uint256 id = _create(p);
        for (uint256 i = 0; i < 5; ++i) {
            _bid(id, address(uint160(0x3000 + i)), 2, 2);
        }
        _bid(id, makeAddr("sybil"), 2, 1);
        _closeAndOpenAll(id);
        auction.settle(id);
        assertEq(auction.getAuction(id).totalSold, 10);
        uint256 sum;
        for (uint256 i = 0; i < 5; ++i) {
            uint256 lots = auction.allocationOf(id, address(uint160(0x3000 + i)));
            assertLe(lots, 2);
            sum += lots;
        }
        sum += auction.allocationOf(id, makeAddr("sybil"));
        assertEq(sum, 10);
    }

    function test_needsAllBidsOpenedAndTwoKeys() public {
        uint256 id = _create();
        _bid(id, alice, 0, 1);
        vm.warp(auction.getAuction(id).commitDeadline);
        vm.expectRevert(BlindAuctionV2.NotEnoughKeys.selector);
        auction.settle(id);
        _publish(id, 0);
        _publish(id, 1);
        assertFalse(auction.canSettle(id));
        vm.expectRevert(BlindAuctionV2.BidsUnopened.selector);
        auction.settle(id);
    }

    function test_settlesOnlyOnce() public {
        uint256 id = _create();
        _close(id, 0, 1);
        auction.settle(id);
        vm.expectRevert(BlindAuctionV2.NotOpen.selector);
        auction.settle(id);
    }

    function test_settleHasNoDeadline() public {
        uint256 id = _create();
        _bid(id, alice, 0, 1);
        _closeAndOpenAll(id);
        vm.warp(block.timestamp + 365 days);
        auction.settle(id);
        assertEq(auction.getAuction(id).totalSold, 1);
    }

    function test_manySmallBidsAtTheClearingStepSellEverything() public {
        BlindAuctionV2.CreateParams memory p = _params();
        p.supply = 100;
        uint256 id = _create(p);
        uint256 bidders = 260;
        for (uint256 i = 0; i < bidders; ++i) {
            _bid(id, address(uint160(0x10000 + i)), 0, 1);
        }
        _closeAndOpenAll(id);
        auction.settle(id);
        assertEq(auction.getAuction(id).totalSold, 100);
        uint256 sum;
        for (uint256 i = 0; i < bidders; ++i) {
            sum += auction.allocationOf(id, address(uint160(0x10000 + i)));
        }
        assertEq(sum, 100);
    }
}
