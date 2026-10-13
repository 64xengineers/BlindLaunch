// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BlindAuctionV2} from "../../src/BlindAuctionV2.sol";
import {Secp256k1} from "../../src/Secp256k1.sol";
import {FeeOnTransferToken} from "./Mocks.sol";
import {V2Base} from "./V2Base.sol";

contract CommitTest is V2Base {
    event BidCommitted(uint256 indexed auctionId, uint32 slot, address indexed bidder);

    function _tryCommit(uint256 id, address bidder, Sealed memory s, bytes4 selector) internal {
        quote.mint(bidder, DEPOSIT);
        vm.startPrank(bidder);
        quote.approve(address(auction), DEPOSIT);
        vm.expectRevert(selector);
        auction.commit(id, s.ephemeral, s.c, s.h);
        vm.stopPrank();
    }

    function test_commitStoresSealedBidAndPullsDeposit() public {
        uint256 id = _create();
        Sealed memory s = _seal(id, alice, 3, 100);
        quote.mint(alice, DEPOSIT);
        vm.startPrank(alice);
        quote.approve(address(auction), DEPOSIT);
        vm.expectEmit(address(auction));
        emit BidCommitted(id, 0, alice);
        auction.commit(id, s.ephemeral, s.c, s.h);
        vm.stopPrank();

        assertEq(quote.balanceOf(address(auction)), DEPOSIT);
        assertEq(auction.bidderSlot(id, alice), 1);
        BlindAuctionV2.Bid memory b = auction.getBid(id, 0);
        assertEq(b.bidder, alice);
        assertEq(b.h, s.h);
        assertEq(b.ephemeral.x, s.ephemeral.x);
        assertEq(b.c[2], s.c[2]);
        assertFalse(b.opened);
        assertEq(auction.getAuction(id).bidCount, 1);
    }

    function test_windowIsEnforced() public {
        BlindAuctionV2.CreateParams memory p = _params();
        p.commitStart = uint64(block.timestamp + 10);
        p.commitDeadline = p.commitStart + 1 hours;
        p.cancelAfter = p.commitDeadline + 1 hours;
        uint256 id = _create(p);
        _tryCommit(id, alice, _seal(id, alice, 0, 1), BlindAuctionV2.TooEarly.selector);
        vm.warp(p.commitDeadline);
        _tryCommit(id, bob, _seal(id, bob, 0, 1), BlindAuctionV2.TooLate.selector);
    }

    function test_authorityCannotBid() public {
        uint256 id = _create();
        _tryCommit(id, authority, _seal(id, authority, 0, 1), BlindAuctionV2.AuthorityBid.selector);
    }

    function test_oneBidPerWallet() public {
        uint256 id = _create();
        _bid(id, alice, 0, 1);
        _tryCommit(id, alice, _seal(id, alice, 1, 1), BlindAuctionV2.AlreadyBid.selector);
    }

    function test_maxBidsIsEnforced() public {
        BlindAuctionV2.CreateParams memory p = _params();
        p.maxBids = 1;
        uint256 id = _create(p);
        _bid(id, alice, 0, 1);
        _tryCommit(id, bob, _seal(id, bob, 0, 1), BlindAuctionV2.AuctionFull.selector);
    }

    function test_rejectsBadEphemeralPoints() public {
        uint256 id = _create();
        Sealed memory s = _seal(id, alice, 0, 1);
        s.ephemeral = Secp256k1.Point(s.ephemeral.x, s.ephemeral.y + 1);
        _tryCommit(id, alice, s, BlindAuctionV2.BadPoint.selector);
        s.ephemeral = Secp256k1.Point(0, 1);
        _tryCommit(id, alice, s, BlindAuctionV2.BadPoint.selector);
        s.ephemeral = Secp256k1.Point(N, 1);
        _tryCommit(id, alice, s, BlindAuctionV2.BadPoint.selector);
    }

    function test_missingAuction() public {
        uint256 id = _create();
        _tryCommit(99, alice, _seal(id, alice, 0, 1), BlindAuctionV2.MissingAuction.selector);
    }

    function test_feeOnTransferQuoteRejected() public {
        FeeOnTransferToken fee = new FeeOnTransferToken();
        BlindAuctionV2.CreateParams memory p = _params();
        p.quoteToken = address(fee);
        uint256 id = _create(p);
        Sealed memory s = _seal(id, alice, 0, 1);
        fee.mint(alice, DEPOSIT);
        vm.startPrank(alice);
        fee.approve(address(auction), DEPOSIT);
        vm.expectRevert(BlindAuctionV2.TransferFailed.selector);
        auction.commit(id, s.ephemeral, s.c, s.h);
        vm.stopPrank();
    }
}
