// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BlindAuctionV2} from "../../src/BlindAuctionV2.sol";
import {V2Base} from "./V2Base.sol";

contract SettleTest is V2Base {
    function test_referenceExampleClearsAt60() public {
        uint256 id = _create();
        _bid(id, alice, 5, 400);
        _bid(id, bob, 3, 300);
        _bid(id, cara, 1, 500);
        _bid(id, dan, 0, 400);
        _closeAndOpenAll(id);
        assertTrue(auction.canSettle(id));
        auction.settle(id);

        BlindAuctionV2.Auction memory a = auction.getAuction(id);
        assertEq(uint256(a.status), uint256(BlindAuctionV2.Status.Settled));
        assertEq(a.clearingStep, 1);
        assertEq(a.clearingPrice, 60);
        assertEq(a.aboveTotal, 700);
        assertEq(a.remaining, 300);
        assertEq(a.atDemand, 500);
        assertTrue(a.finalized);
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
        assertTrue(a.finalized);
    }

    function test_noBidsSellsNothingAtPriceZero() public {
        uint256 id = _create();
        _close(id, 0, 1);
        auction.settle(id);
        BlindAuctionV2.Auction memory a = auction.getAuction(id);
        assertEq(a.clearingPrice, 0);
        assertEq(a.totalSold, 0);
        assertTrue(a.finalized);
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

    function test_proRataDustStaysUnsold() public {
        BlindAuctionV2.CreateParams memory p = _params();
        p.supply = 10;
        uint256 id = _create(p);
        _bid(id, alice, 2, 4);
        _bid(id, bob, 2, 4);
        _bid(id, cara, 2, 4);
        _closeAndOpenAll(id);
        auction.settle(id);
        BlindAuctionV2.Auction memory a = auction.getAuction(id);
        assertEq(a.totalSold, 9);
        assertEq(auction.allocationOf(id, alice), 3);
        assertEq(auction.allocationOf(id, cara), 3);
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

    function test_largeProRataNeedsTally() public {
        BlindAuctionV2.CreateParams memory p = _params();
        p.supply = 100;
        uint256 id = _create(p);
        uint256 bidders = auction.TALLY_IN_SETTLE() + 4;
        for (uint256 i = 0; i < bidders; ++i) {
            _bid(id, address(uint160(0x10000 + i)), 0, 1);
        }
        _closeAndOpenAll(id);
        auction.settle(id);
        BlindAuctionV2.Auction memory a = auction.getAuction(id);
        assertFalse(a.finalized);
        assertEq(a.tallyCursor, auction.TALLY_IN_SETTLE());

        vm.expectRevert(BlindAuctionV2.NotFinalized.selector);
        vm.prank(authority);
        auction.reclaim(id);

        auction.tally(id, 2);
        assertFalse(auction.getAuction(id).finalized);
        auction.tally(id, 100);
        a = auction.getAuction(id);
        assertTrue(a.finalized);
        assertEq(a.totalSold, 0, "floor(100 * 1 / 260) = 0 for every bid");
        vm.expectRevert(BlindAuctionV2.NothingToTally.selector);
        auction.tally(id, 1);
    }

    function test_tallyBeforeSettleReverts() public {
        uint256 id = _create();
        vm.expectRevert(BlindAuctionV2.NothingToTally.selector);
        auction.tally(id, 1);
    }
}
