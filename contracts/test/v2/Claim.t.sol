// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BlindAuctionV2} from "../../src/BlindAuctionV2.sol";
import {HostileToken, ReentrantToken} from "./Mocks.sol";
import {V2Base} from "./V2Base.sol";

contract ClaimTest is V2Base {
    function _reference() internal returns (uint256 id) {
        id = _create();
        _bid(id, alice, 5, 400);
        _bid(id, bob, 3, 300);
        _bid(id, cara, 1, 500);
        _bid(id, dan, 0, 400);
        _closeAndOpenAll(id);
        auction.settle(id);
    }

    function test_referencePayoutsLeaveNothingBehind() public {
        uint256 id = _reference();
        _claim(id, alice, 400, DEPOSIT - 60 * 400);
        _claim(id, bob, 300, DEPOSIT - 60 * 300);
        _claim(id, cara, 300, DEPOSIT - 60 * 300);
        _claim(id, dan, 0, DEPOSIT);
        vm.prank(authority);
        auction.reclaim(id);
        assertEq(sale.balanceOf(authority), 10_000_000 - 1000);
        assertEq(quote.balanceOf(authority), 60 * 1000);
        assertEq(sale.balanceOf(address(auction)), 0);
        assertEq(quote.balanceOf(address(auction)), 0);
    }

    function test_invalidBidGetsFullRefund() public {
        uint256 id = _create();
        _bid(id, alice, 9, 1);
        _bid(id, bob, 0, 10);
        _closeAndOpenAll(id);
        auction.settle(id);
        _claim(id, alice, 0, DEPOSIT);
        _claim(id, bob, 10, DEPOSIT - 500);
    }

    function test_proRataLeavesNothingUnsold() public {
        BlindAuctionV2.CreateParams memory p = _params();
        p.supply = 10;
        uint256 id = _create(p);
        _bid(id, alice, 2, 4);
        _bid(id, bob, 2, 4);
        _bid(id, cara, 2, 4);
        _closeAndOpenAll(id);
        auction.settle(id);
        _claim(id, alice, 3, DEPOSIT - 70 * 3);
        _claim(id, bob, 3, DEPOSIT - 70 * 3);
        _claim(id, cara, 4, DEPOSIT - 70 * 4);
        uint256 before = sale.balanceOf(authority);
        vm.prank(authority);
        auction.reclaim(id);
        assertEq(sale.balanceOf(authority) - before, 0);
        assertEq(quote.balanceOf(authority), 70 * 10);
        assertEq(sale.balanceOf(address(auction)), 0);
        assertEq(quote.balanceOf(address(auction)), 0);
    }

    function test_lotsPayInBaseUnits() public {
        BlindAuctionV2.CreateParams memory p = _params();
        p.supply = 1000e18;
        p.lotSize = 1e18;
        sale.mint(authority, 1000e18);
        uint256 id = _create(p);
        _bid(id, alice, 5, 2);
        _closeAndOpenAll(id);
        auction.settle(id);
        _claim(id, alice, 2e18, DEPOSIT - 50 * 2);
    }

    function test_claimLegsSeparatelyToAnotherAddress() public {
        uint256 id = _reference();
        address vault = makeAddr("vault");
        vm.startPrank(alice);
        auction.claimTokens(id, vault);
        assertEq(sale.balanceOf(vault), 400);
        vm.expectRevert(BlindAuctionV2.AlreadyClaimed.selector);
        auction.claimTokens(id, vault);
        auction.claim(id);
        assertEq(quote.balanceOf(alice), DEPOSIT - 60 * 400, "claim pays the remaining leg");
        vm.expectRevert(BlindAuctionV2.AlreadyClaimed.selector);
        auction.claim(id);
        vm.stopPrank();
        vm.prank(bob);
        vm.expectRevert(BlindAuctionV2.ZeroAddress.selector);
        auction.claimRefund(id, address(0));
    }

    /// Audit M1: a paused sale token must not hold back the winner's quote refund.
    function test_pausedSaleTokenDoesNotBlockRefund() public {
        HostileToken token = new HostileToken();
        token.mint(authority, 1000);
        vm.prank(authority);
        token.approve(address(auction), 1000);
        BlindAuctionV2.CreateParams memory p = _params();
        p.saleToken = address(token);
        uint256 id = _create(p);
        _bid(id, alice, 5, 1000);
        _closeAndOpenAll(id);
        auction.settle(id);

        token.setPaused(true);
        vm.startPrank(alice);
        vm.expectRevert(BlindAuctionV2.TransferFailed.selector);
        auction.claim(id);
        auction.claimRefund(id, alice);
        vm.stopPrank();
        assertEq(quote.balanceOf(alice), DEPOSIT - 100 * 1000);

        token.setPaused(false);
        vm.prank(alice);
        auction.claimTokens(id, alice);
        assertEq(token.balanceOf(alice), 1000);
    }

    function test_forfeitedBidGetsNothingAndIsBurned() public {
        uint256 id = _create();
        _bid(id, alice, 1, 10);
        Sealed memory bad = _seal(id, bob, 1, 10);
        bad.h = keccak256("mismatch");
        _commitSealed(id, bob, bad);
        _closeAndOpenAll(id);
        vm.expectRevert(BlindAuctionV2.NothingToBurn.selector);
        auction.burnForfeits(id);
        auction.settle(id);
        _claim(id, bob, 0, 0);
        _claim(id, alice, 10, DEPOSIT - 50 * 10);
        auction.burnForfeits(id);
        assertEq(quote.balanceOf(auction.FORFEIT_SINK()), DEPOSIT);
        vm.expectRevert(BlindAuctionV2.NothingToBurn.selector);
        auction.burnForfeits(id);
        vm.prank(authority);
        auction.reclaim(id);
        assertEq(quote.balanceOf(address(auction)), 0);
        assertEq(sale.balanceOf(address(auction)), 0);
    }

    function test_claimGuards() public {
        uint256 id = _create();
        _bid(id, alice, 0, 1);
        vm.prank(alice);
        vm.expectRevert(BlindAuctionV2.BadStatus.selector);
        auction.claim(id);
        vm.prank(bob);
        vm.expectRevert(BlindAuctionV2.UnknownBidder.selector);
        auction.claim(id);
    }

    function test_reclaimGuards() public {
        uint256 id = _reference();
        vm.prank(alice);
        vm.expectRevert(BlindAuctionV2.NotAuthority.selector);
        auction.reclaim(id);
        vm.prank(authority);
        auction.reclaim(id);
        vm.prank(authority);
        vm.expectRevert(BlindAuctionV2.AlreadyReclaimed.selector);
        auction.reclaim(id);

        uint256 open = _create();
        vm.prank(authority);
        vm.expectRevert(BlindAuctionV2.BadStatus.selector);
        auction.reclaim(open);
    }

    function test_cancelRefundsEveryoneAndReturnsSupply() public {
        uint256 id = _create();
        _bid(id, alice, 5, 400);
        _bid(id, bob, 0, 1);
        vm.warp(auction.getAuction(id).commitDeadline);
        _publish(id, 0);
        assertFalse(auction.canCancel(id));
        vm.expectRevert(BlindAuctionV2.TooEarly.selector);
        auction.cancel(id);
        vm.warp(auction.getAuction(id).cancelAfter);
        assertTrue(auction.canCancel(id));
        auction.cancel(id);
        _claim(id, alice, 0, DEPOSIT);
        _claim(id, bob, 0, DEPOSIT);
        vm.startPrank(authority);
        auction.reclaimUnsold(id, makeAddr("treasury"));
        vm.expectRevert(BlindAuctionV2.ZeroAddress.selector);
        auction.reclaimProceeds(id, address(0));
        auction.reclaimProceeds(id, authority);
        vm.expectRevert(BlindAuctionV2.AlreadyReclaimed.selector);
        auction.reclaim(id);
        vm.stopPrank();
        assertEq(sale.balanceOf(makeAddr("treasury")), 1000);
        assertEq(quote.balanceOf(address(auction)), 0);
    }

    function test_cannotCancelOnceAPairExists() public {
        uint256 id = _create();
        _bid(id, alice, 0, 1);
        _close(id, 0, 1);
        vm.warp(auction.getAuction(id).cancelAfter);
        assertFalse(auction.canCancel(id));
        vm.expectRevert(BlindAuctionV2.KeysComplete.selector);
        auction.cancel(id);
        _openAll(id);
        auction.settle(id);
        _claim(id, alice, 1, DEPOSIT - 50);
    }

    function test_reentrantTokenCannotDoubleClaim() public {
        ReentrantToken hostile = new ReentrantToken();
        BlindAuctionV2.CreateParams memory p = _params();
        p.quoteToken = address(hostile);
        uint256 id = _create(p);
        Sealed memory s = _seal(id, alice, 0, 1);
        hostile.mint(alice, DEPOSIT);
        vm.startPrank(alice);
        hostile.approve(address(auction), DEPOSIT);
        auction.commit(id, s.ephemeral, s.c, s.h);
        vm.stopPrank();
        _store(id, 0, s);
        _closeAndOpenAll(id);
        auction.settle(id);
        hostile.arm(address(auction), abi.encodeCall(BlindAuctionV2.claim, (id)));
        vm.prank(alice);
        auction.claim(id);
        assertTrue(hostile.reentered());
        assertFalse(hostile.reentryOk());
        assertEq(bytes4(hostile.reentryError()), BlindAuctionV2.Reentrancy.selector);
        assertEq(hostile.balanceOf(alice), DEPOSIT - 50);
    }

    function test_claimableView() public {
        uint256 id = _reference();
        (uint256 saleOut, uint256 quoteOut) = auction.claimable(id, bob);
        assertEq(saleOut, 300);
        assertEq(quoteOut, DEPOSIT - 60 * 300);
    }
}
