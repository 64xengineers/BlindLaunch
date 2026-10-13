// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {KeeperRegistry} from "../../src/KeeperRegistry.sol";
import {Secp256k1} from "../../src/Secp256k1.sol";

contract KeeperRegistryTest is Test {
    event KeysEnqueued(uint8 indexed keeper, uint256 count);
    event KeyConsumed(uint8 indexed keeper, uint256 indexed auctionId, uint256 x, uint256 y);

    KeeperRegistry internal registry;
    address[3] internal owners;
    address internal auction = makeAddr("auction");

    function setUp() public {
        owners = [makeAddr("k0"), makeAddr("k1"), makeAddr("k2")];
        registry = new KeeperRegistry(owners);
        registry.setAuction(auction);
    }

    function _keys(uint256 first, uint256 count) internal returns (Secp256k1.Point[] memory keys) {
        keys = new Secp256k1.Point[](count);
        for (uint256 i = 0; i < count; ++i) {
            Vm.Wallet memory wallet = vm.createWallet(first + i);
            keys[i] = Secp256k1.Point(wallet.publicKeyX, wallet.publicKeyY);
        }
    }

    function test_enqueueAndConsumeFifo() public {
        Secp256k1.Point[] memory keys = _keys(100, 2);
        vm.prank(owners[1]);
        vm.expectEmit(address(registry));
        emit KeysEnqueued(1, 2);
        registry.enqueue(1, keys);
        assertEq(registry.available(1), 2);

        vm.prank(auction);
        vm.expectEmit(address(registry));
        emit KeyConsumed(1, 7, keys[0].x, keys[0].y);
        Secp256k1.Point memory got = registry.consume(1, 7);
        assertEq(got.x, keys[0].x);
        assertEq(registry.available(1), 1);

        vm.prank(auction);
        got = registry.consume(1, 8);
        assertEq(got.x, keys[1].x);
        assertEq(registry.available(1), 0);
    }

    function test_onlyOwnerEnqueues() public {
        Secp256k1.Point[] memory keys = _keys(100, 1);
        vm.prank(owners[0]);
        vm.expectRevert(KeeperRegistry.NotKeeper.selector);
        registry.enqueue(1, keys);
    }

    function test_rejectsBadIndexAndBadPoint() public {
        vm.prank(owners[0]);
        vm.expectRevert(KeeperRegistry.BadKeeper.selector);
        registry.enqueue(3, _keys(100, 1));

        Secp256k1.Point[] memory bad = new Secp256k1.Point[](1);
        bad[0] = Secp256k1.Point(1, 1);
        vm.prank(owners[0]);
        vm.expectRevert(KeeperRegistry.BadPoint.selector);
        registry.enqueue(0, bad);
    }

    function test_onlyAuctionConsumes() public {
        vm.prank(owners[0]);
        registry.enqueue(0, _keys(100, 1));
        vm.expectRevert(KeeperRegistry.NotAuction.selector);
        registry.consume(0, 1);
    }

    function test_consumeFromEmptyQueueReverts() public {
        vm.prank(auction);
        vm.expectRevert(KeeperRegistry.NoKeeperKeys.selector);
        registry.consume(2, 1);
    }

    function test_setAuctionOnceByDeployer() public {
        KeeperRegistry fresh = new KeeperRegistry(owners);
        vm.prank(owners[0]);
        vm.expectRevert(KeeperRegistry.NotDeployer.selector);
        fresh.setAuction(auction);
        fresh.setAuction(auction);
        vm.expectRevert(KeeperRegistry.AuctionAlreadySet.selector);
        fresh.setAuction(auction);
    }

    function test_ownerRotation() public {
        address next = makeAddr("k0-next");
        vm.prank(owners[0]);
        registry.setOwner(0, next);
        vm.prank(owners[0]);
        vm.expectRevert(KeeperRegistry.NotKeeper.selector);
        registry.enqueue(0, _keys(100, 1));
        vm.prank(next);
        registry.enqueue(0, _keys(100, 1));
        assertEq(registry.available(0), 1);
    }
}
