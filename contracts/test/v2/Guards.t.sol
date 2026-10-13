// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BlindAuctionV2} from "../../src/BlindAuctionV2.sol";
import {KeeperRegistry} from "../../src/KeeperRegistry.sol";
import {Secp256k1} from "../../src/Secp256k1.sol";
import {V2Base} from "./V2Base.sol";

/// @notice Revert paths, events and boundaries not covered by the per-phase suites.
contract GuardsTest is V2Base {
    event AuctionCancelled(uint256 indexed auctionId);
    event RefundClaimed(uint256 indexed auctionId, address indexed bidder, address to, uint256 amount);
    event TokensClaimed(uint256 indexed auctionId, address indexed bidder, address to, uint256 amount);
    event UnsoldReclaimed(uint256 indexed auctionId, address to, uint256 amount);
    event ProceedsReclaimed(uint256 indexed auctionId, address to, uint256 amount);
    event ForfeitsBurned(uint256 indexed auctionId, uint256 amount);

    function test_everyEntryPointRejectsAMissingAuction() public {
        Secp256k1.Point memory g = Secp256k1.generator();
        bytes4 missing = BlindAuctionV2.MissingAuction.selector;
        vm.expectRevert(missing);
        auction.publishKey(9, 0, 1);
        vm.expectRevert(missing);
        auction.open(9, 0, g, g);
        vm.expectRevert(missing);
        auction.openMany(9, new uint32[](0), new Secp256k1.Point[](0), new Secp256k1.Point[](0));
        vm.expectRevert(missing);
        auction.settle(9);
        vm.expectRevert(missing);
        auction.cancel(9);
        vm.expectRevert(missing);
        auction.burnForfeits(9);
        vm.expectRevert(missing);
        auction.handOffSeed(9);
        vm.expectRevert(missing);
        auction.releaseSeed(9);
        vm.expectRevert(missing);
        auction.claim(9);
        vm.expectRevert(missing);
        auction.reclaim(9);
        vm.expectRevert(missing);
        auction.quotePrice(9, 0);
    }

    function test_noOpeningAfterSettle() public {
        uint256 id = _create();
        _bid(id, alice, 0, 1);
        _closeAndOpenAll(id);
        auction.settle(id);
        Sealed storage s = sealedOf[id][0];
        vm.expectRevert(BlindAuctionV2.NotOpen.selector);
        auction.open(id, 0, s.shared[0], s.shared[1]);
        uint32[] memory slots = new uint32[](1);
        Secp256k1.Point[] memory a = new Secp256k1.Point[](1);
        Secp256k1.Point[] memory b = new Secp256k1.Point[](1);
        a[0] = s.shared[0];
        b[0] = s.shared[1];
        vm.expectRevert(BlindAuctionV2.NotOpen.selector);
        auction.openMany(id, slots, a, b);
    }

    function test_oneBadShareRevertsTheWholeBatch() public {
        uint256 id = _create();
        _bid(id, alice, 0, 1);
        _bid(id, bob, 1, 1);
        _close(id, 0, 1);
        uint32[] memory slots = new uint32[](2);
        Secp256k1.Point[] memory a = new Secp256k1.Point[](2);
        Secp256k1.Point[] memory b = new Secp256k1.Point[](2);
        slots[1] = 1;
        a[0] = sealedOf[id][0].shared[0];
        b[0] = sealedOf[id][0].shared[1];
        a[1] = sealedOf[id][1].shared[0];
        b[1] = sealedOf[id][0].shared[1]; // alice's point for bob's bid
        vm.expectRevert(BlindAuctionV2.BadShare.selector);
        auction.openMany(id, slots, a, b);
        assertEq(auction.getAuction(id).openedCount, 0);
        vm.expectRevert(BlindAuctionV2.UnknownSlot.selector);
        slots[1] = 7;
        auction.openMany(id, slots, a, b);
    }

    function test_swappedSharedPointsAreRejected() public {
        uint256 id = _create();
        _bid(id, alice, 0, 1);
        _close(id, 0, 1);
        Sealed storage s = sealedOf[id][0];
        vm.expectRevert(BlindAuctionV2.BadShare.selector);
        auction.open(id, 0, s.shared[1], s.shared[0]);
    }

    function test_publishRejectsZeroAndOutOfRangeKeys() public {
        uint256 id = _create();
        vm.warp(auction.getAuction(id).commitDeadline);
        vm.expectRevert(BlindAuctionV2.BadKey.selector);
        auction.publishKey(id, 0, 0);
        vm.expectRevert(BlindAuctionV2.BadKey.selector);
        auction.publishKey(id, 0, N);
    }

    function test_cancelOnlyOnceAndEmits() public {
        uint256 id = _create();
        vm.warp(auction.getAuction(id).cancelAfter);
        vm.expectEmit(address(auction));
        emit AuctionCancelled(id);
        auction.cancel(id);
        vm.expectRevert(BlindAuctionV2.NotOpen.selector);
        auction.cancel(id);
    }

    function test_eoaSaleTokenRejected() public {
        BlindAuctionV2.CreateParams memory p = _params();
        p.saleToken = makeAddr("eoa");
        _enqueueKeys();
        vm.prank(authority);
        vm.expectRevert(BlindAuctionV2.NotAContract.selector);
        auction.createAuction(p);
    }

    function test_oneEmptyQueueRollsBackTheOtherKeys() public {
        for (uint8 i = 0; i < 2; ++i) {
            Secp256k1.Point[] memory keys = new Secp256k1.Point[](1);
            keys[0] = _pub(_scalar(keccak256(abi.encode("lonely", i))));
            vm.prank(keeperOwners[i]);
            registry.enqueue(i, keys);
        }
        vm.prank(authority);
        vm.expectRevert(KeeperRegistry.NoKeeperKeys.selector);
        auction.createAuction(_params());
        assertEq(registry.available(0), 1);
        assertEq(registry.available(1), 1);
        assertEq(auction.nextAuctionId(), 1);
    }

    function test_payoutEvents() public {
        uint256 id = _create();
        _bid(id, alice, 5, 400);
        Sealed memory bad = _seal(id, bob, 0, 1);
        bad.h = bytes32(uint256(1));
        _commitSealed(id, bob, bad);
        _closeAndOpenAll(id);
        auction.settle(id);

        vm.startPrank(alice);
        vm.expectEmit(address(auction));
        emit RefundClaimed(id, alice, alice, DEPOSIT - 50 * 400);
        vm.expectEmit(address(auction));
        emit TokensClaimed(id, alice, alice, 400);
        auction.claim(id);
        vm.stopPrank();

        vm.expectEmit(address(auction));
        emit ForfeitsBurned(id, DEPOSIT);
        auction.burnForfeits(id);

        vm.startPrank(authority);
        vm.expectEmit(address(auction));
        emit UnsoldReclaimed(id, authority, 600);
        vm.expectEmit(address(auction));
        emit ProceedsReclaimed(id, authority, 50 * 400);
        auction.reclaim(id);
        vm.stopPrank();
    }

    function test_boundariesAreAccepted() public {
        BlindAuctionV2.CreateParams memory p = _params();
        p.maxBids = 65_535;
        p.stepCount = 2;
        p.minPrice = 1;
        p.stepSize = type(uint128).max - 1;
        p.deposit = type(uint128).max;
        p.maxNotional = type(uint128).max;
        uint256 id = _create(p);
        assertEq(auction.quotePrice(id, 1), type(uint128).max);

        uint256 maxQuantity = type(uint96).max;
        _bid(id, alice, 0, maxQuantity);
        _closeAndOpenAll(id);
        BlindAuctionV2.Bid memory b = auction.getBid(id, 0);
        assertTrue(b.counted);
        assertEq(b.quantity, maxQuantity);
    }
}
