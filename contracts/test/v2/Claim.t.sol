// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BlindAuctionV2} from "../../src/BlindAuctionV2.sol";
import {ReentrantToken} from "./Mocks.sol";
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

    function test_dustReturnsToAuthority() public {
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
        _claim(id, cara, 3, DEPOSIT - 70 * 3);
        uint256 before = sale.balanceOf(authority);
        vm.prank(authority);
        auction.reclaim(id);
        assertEq(sale.balanceOf(authority) - before, 1);
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

    function test_claimToAnotherAddress() public {
        uint256 id = _reference();
        address vault = makeAddr("vault");
        vm.prank(alice);
        auction.claimTo(id, vault);
        assertEq(sale.balanceOf(vault), 400);
        vm.prank(alice);
        vm.expectRevert(BlindAuctionV2.AlreadyClaimed.selector);
        auction.claim(id);
        vm.prank(bob);
        vm.expectRevert(BlindAuctionV2.ZeroAddress.selector);
        auction.claimTo(id, address(0));
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

    function test_claimsOpenBeforeTallyFinishes() public {
        BlindAuctionV2.CreateParams memory p = _params();
        p.supply = 100;
        uint256 id = _create(p);
        uint256 bidders = auction.TALLY_IN_SETTLE() + 4;
        for (uint256 i = 0; i < bidders; ++i) {
            _bid(id, address(uint160(0x10000 + i)), 0, 1);
        }
        _closeAndOpenAll(id);
        auction.settle(id);
        assertFalse(auction.getAuction(id).finalized);
        _claim(id, address(uint160(0x10000)), 0, DEPOSIT);
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
        vm.prank(authority);
        auction.reclaimTo(id, makeAddr("treasury"));
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
