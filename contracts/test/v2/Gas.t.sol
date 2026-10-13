// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {console2} from "forge-std/console2.sol";
import {BlindAuctionV2} from "../../src/BlindAuctionV2.sol";
import {Secp256k1} from "../../src/Secp256k1.sol";
import {V2Base} from "./V2Base.sol";

contract GasTest is V2Base {
    uint256 internal constant BIDS = 200;

    function test_gasForTwoHundredBidsAtTheClearingStep() public {
        BlindAuctionV2.CreateParams memory p = _params();
        p.supply = 100;
        uint256 id = _create(p);
        for (uint256 i = 0; i < BIDS; ++i) {
            _bid(id, address(uint160(0x20000 + i)), 0, 1);
        }
        _close(id, 0, 1);

        uint256 openGas;
        for (uint32 start = 0; start < BIDS; start += 50) {
            uint32[] memory slots = new uint32[](50);
            Secp256k1.Point[] memory sharedA = new Secp256k1.Point[](50);
            Secp256k1.Point[] memory sharedB = new Secp256k1.Point[](50);
            for (uint32 j = 0; j < 50; ++j) {
                slots[j] = start + j;
                sharedA[j] = sealedOf[id][start + j].shared[0];
                sharedB[j] = sealedOf[id][start + j].shared[1];
            }
            uint256 before = gasleft();
            auction.openMany(id, slots, sharedA, sharedB);
            openGas += before - gasleft();
        }
        uint256 settleBefore = gasleft();
        auction.settle(id);
        uint256 settleGas = settleBefore - gasleft();

        console2.log("openMany gas per bid", openGas / BIDS);
        console2.log("settle + tally of 200 at-step bids", settleGas);
        assertTrue(auction.getAuction(id).finalized);
        assertLt(openGas / BIDS, OPEN_BOUND);
        assertLt(settleGas, SETTLE_BOUND);
    }

    uint256 internal constant OPEN_BOUND = 57_000;
    uint256 internal constant SETTLE_BOUND = 370_000;
}
