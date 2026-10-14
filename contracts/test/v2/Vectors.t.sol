// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BlindAuctionV2} from "../../src/BlindAuctionV2.sol";
import {Secp256k1} from "../../src/Secp256k1.sol";
import {V2Base} from "./V2Base.sol";

/// @notice Bids sealed by packages/sealed-bid open on chain to the same step and quantity.
contract VectorsTest is V2Base {
    function test_typeScriptSealedBidsOpenOnChain() public {
        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/test/vectors/sealed-bid.json"));
        uint256 count = vm.parseJsonUint(json, ".count");
        assertGt(count, 0);
        for (uint256 k = 0; k < count; ++k) {
            // Every case uses the same contract address, so each runs in a clean copy of the state.
            uint256 snapshot = vm.snapshotState();
            _runCase(json, string.concat(".cases[", vm.toString(k), "]"));
            vm.revertToState(snapshot);
        }
    }

    function _runCase(string memory json, string memory at) internal {
        assertEq(block.chainid, vm.parseJsonUint(json, ".chainId"), "vectors sealed for this chain id");
        _deployAt(vm.parseJsonAddress(json, ".contract"));
        uint256[] memory secretKeys = vm.parseJsonUintArray(json, string.concat(at, ".secretKeys"));
        _enqueueVectorKeys(secretKeys);
        uint256 id = _createWideAuction();
        _commitFromJson(json, at, id);
        _publishAndOpen(json, at, id, secretKeys);
        _assertOpened(json, at, id);
    }

    function _enqueueVectorKeys(uint256[] memory secretKeys) internal {
        for (uint8 i = 0; i < 3; ++i) {
            Secp256k1.Point[] memory keys = new Secp256k1.Point[](1);
            keys[0] = _pub(secretKeys[i]);
            vm.prank(keeperOwners[i]);
            registry.enqueue(i, keys);
        }
    }

    /// Every step valid and no notional limit, so validity depends only on the hash check.
    function _createWideAuction() internal returns (uint256 id) {
        BlindAuctionV2.CreateParams memory p = _params();
        p.stepCount = 64;
        p.stepSize = 1;
        p.minPrice = 1;
        p.deposit = type(uint128).max;
        p.maxNotional = type(uint128).max;
        vm.prank(authority);
        id = auction.createAuction(p);
        assertEq(id, 1);
    }

    function _commitFromJson(string memory json, string memory at, uint256 id) internal {
        address bidder = vm.parseJsonAddress(json, string.concat(at, ".bidder"));
        Secp256k1.Point memory ephemeral = Secp256k1.Point(
            vm.parseJsonUint(json, string.concat(at, ".Rx")), vm.parseJsonUint(json, string.concat(at, ".Ry"))
        );
        uint256[] memory cList = vm.parseJsonUintArray(json, string.concat(at, ".c"));
        uint256[3] memory c = [cList[0], cList[1], cList[2]];
        bytes32 h = vm.parseJsonBytes32(json, string.concat(at, ".h"));
        uint256 deposit = auction.getAuction(id).deposit;
        quote.mint(bidder, deposit);
        vm.startPrank(bidder);
        quote.approve(address(auction), deposit);
        auction.commit(id, ephemeral, c, h);
        vm.stopPrank();
    }

    function _publishAndOpen(string memory json, string memory at, uint256 id, uint256[] memory secretKeys) internal {
        uint8 pairA = uint8(vm.parseJsonUint(json, string.concat(at, ".pairA")));
        uint8 pairB = uint8(vm.parseJsonUint(json, string.concat(at, ".pairB")));
        vm.warp(auction.getAuction(id).commitDeadline);
        auction.publishKey(id, pairA, secretKeys[pairA]);
        auction.publishKey(id, pairB, secretKeys[pairB]);
        uint256[] memory sx = vm.parseJsonUintArray(json, string.concat(at, ".Sx"));
        uint256[] memory sy = vm.parseJsonUintArray(json, string.concat(at, ".Sy"));
        auction.open(id, 0, Secp256k1.Point(sx[pairA], sy[pairA]), Secp256k1.Point(sx[pairB], sy[pairB]));
    }

    function _assertOpened(string memory json, string memory at, uint256 id) internal view {
        BlindAuctionV2.Bid memory b = auction.getBid(id, 0);
        bool counted = vm.parseJsonBool(json, string.concat(at, ".counted"));
        string memory label = vm.parseJsonString(json, string.concat(at, ".label"));
        assertEq(b.counted, counted, label);
        assertEq(b.forfeited, vm.parseJsonBool(json, string.concat(at, ".forfeited")), label);
        if (counted) {
            assertEq(b.step, vm.parseJsonUint(json, string.concat(at, ".step")));
            assertEq(b.quantity, vm.parseJsonUint(json, string.concat(at, ".quantity")));
        }
    }
}
