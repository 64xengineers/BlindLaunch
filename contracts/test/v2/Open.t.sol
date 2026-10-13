// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BlindAuctionV2} from "../../src/BlindAuctionV2.sol";
import {Secp256k1} from "../../src/Secp256k1.sol";
import {V2Base} from "./V2Base.sol";

contract OpenTest is V2Base {
    event BidOpened(
        uint256 indexed auctionId, uint32 slot, address indexed bidder, uint8 step, uint96 quantity, bool counted
    );

    function _openOne(uint256 id, uint32 slot) internal {
        BlindAuctionV2.Auction memory a = auction.getAuction(id);
        Sealed storage s = sealedOf[id][slot];
        auction.open(id, slot, s.shared[a.pairA], s.shared[a.pairB]);
    }

    function test_opensWithEveryPair() public {
        uint8[2][3] memory pairs = [[0, 1], [0, 2], [1, 2]];
        for (uint256 k = 0; k < 3; ++k) {
            uint256 id = _create();
            _bid(id, alice, 4, 321);
            _close(id, pairs[k][1], pairs[k][0]);
            vm.expectEmit(address(auction));
            emit BidOpened(id, 0, alice, 4, 321, true);
            _openOne(id, 0);
            BlindAuctionV2.Bid memory b = auction.getBid(id, 0);
            assertTrue(b.opened && b.counted);
            assertEq(b.step, 4);
            assertEq(b.quantity, 321);
            assertEq(auction.qtyAtStepOf(id)[4], 321);
            assertEq(auction.slotsAtStepLength(id, 4), 1);
        }
    }

    function test_needsTwoKeys() public {
        uint256 id = _create();
        _bid(id, alice, 0, 1);
        vm.warp(auction.getAuction(id).commitDeadline);
        _publish(id, 0);
        Sealed storage s = sealedOf[id][0];
        vm.expectRevert(BlindAuctionV2.NotEnoughKeys.selector);
        auction.open(id, 0, s.shared[0], s.shared[1]);
    }

    function test_rejectsWrongSharedPoint() public {
        uint256 id = _create();
        _bid(id, alice, 0, 1);
        _close(id, 0, 1);
        Sealed storage s = sealedOf[id][0];
        vm.expectRevert(BlindAuctionV2.BadShare.selector);
        auction.open(id, 0, s.shared[0], s.shared[2]);
    }

    function test_onlyOnceAndOnlyKnownSlots() public {
        uint256 id = _create();
        _bid(id, alice, 0, 1);
        _close(id, 0, 1);
        _openOne(id, 0);
        Sealed storage s = sealedOf[id][0];
        vm.expectRevert(BlindAuctionV2.AlreadyOpened.selector);
        auction.open(id, 0, s.shared[0], s.shared[1]);
        vm.expectRevert(BlindAuctionV2.UnknownSlot.selector);
        auction.open(id, 1, s.shared[0], s.shared[1]);
    }

    function test_invalidBidsAreOpenedButNotCounted() public {
        BlindAuctionV2.CreateParams memory p = _params();
        p.maxNotional = 5_000;
        uint256 id = _create(p);
        _bid(id, alice, 6, 1); // step out of range
        _bid(id, bob, 0, 0); // zero quantity
        _bid(id, cara, 0, 101); // 50 * 101 > maxNotional 5,000
        _commitSealed(id, dan, _sealRaw(id, dan, 1 << 240)); // m >= 2^232
        address eve = makeAddr("eve");
        Sealed memory wrongHash = _seal(id, eve, 0, 1);
        wrongHash.h = keccak256("not the commitment");
        _commitSealed(id, eve, wrongHash);
        _closeAndOpenAll(id);
        for (uint32 slot = 0; slot < 5; ++slot) {
            BlindAuctionV2.Bid memory b = auction.getBid(id, slot);
            assertTrue(b.opened);
            assertFalse(b.counted);
        }
        assertEq(auction.getAuction(id).openedCount, 5);
    }

    function test_notionalAboveDepositIsNotCounted() public {
        BlindAuctionV2.CreateParams memory p = _params();
        p.deposit = 5_000;
        uint256 id = _create(p);
        _bid(id, alice, 0, 101);
        _closeAndOpenAll(id);
        assertFalse(auction.getBid(id, 0).counted);
    }

    function test_copiedCiphertextIsNotCounted() public {
        uint256 id = _create();
        Sealed memory original = _seal(id, alice, 2, 50);
        _commitSealed(id, alice, original);
        _commitSealed(id, bob, original);
        _closeAndOpenAll(id);
        assertTrue(auction.getBid(id, 0).counted);
        assertFalse(auction.getBid(id, 1).counted);
    }

    function test_inconsistentSharesDependOnTheFrozenPairOnly() public {
        uint256 first = _create();
        Sealed memory s1 = _seal(first, alice, 1, 10);
        s1.c[2] ^= 1;
        _commitSealed(first, alice, s1);
        _close(first, 0, 1);
        _openAll(first);
        assertTrue(auction.getBid(first, 0).counted, "valid under (0,1)");

        uint256 second = _create();
        Sealed memory s2 = _seal(second, alice, 1, 10);
        s2.c[2] ^= 1;
        _commitSealed(second, alice, s2);
        _close(second, 2, 1);
        _openAll(second);
        assertFalse(auction.getBid(second, 0).counted, "invalid under (1,2)");
    }

    function test_openManySkipsOpenedSlots() public {
        uint256 id = _create();
        _bid(id, alice, 1, 10);
        _bid(id, bob, 2, 20);
        _close(id, 0, 1);
        _openAllPrefix(id, 1);
        uint32[] memory slots = new uint32[](2);
        Secp256k1.Point[] memory sharedA = new Secp256k1.Point[](2);
        Secp256k1.Point[] memory sharedB = new Secp256k1.Point[](2);
        for (uint32 slot = 0; slot < 2; ++slot) {
            slots[slot] = slot;
            sharedA[slot] = sealedOf[id][slot].shared[0];
            sharedB[slot] = sealedOf[id][slot].shared[1];
        }
        auction.openMany(id, slots, sharedA, sharedB);
        assertEq(auction.getAuction(id).openedCount, 2);
    }

    function test_openManyChecksLengths() public {
        uint256 id = _create();
        _bid(id, alice, 1, 10);
        _close(id, 0, 1);
        vm.expectRevert(BlindAuctionV2.LengthMismatch.selector);
        auction.openMany(id, new uint32[](1), new Secp256k1.Point[](0), new Secp256k1.Point[](1));
    }

    function _openAllPrefix(uint256 id, uint32 count) internal {
        for (uint32 slot = 0; slot < count; ++slot) {
            _openOne(id, slot);
        }
    }
}
