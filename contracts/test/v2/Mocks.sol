// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Secp256k1} from "../../src/Secp256k1.sol";

contract Secp256k1Harness {
    function isValid(Secp256k1.Point memory p) external pure returns (bool) {
        return Secp256k1.isValid(p);
    }

    function mulEquals(Secp256k1.Point memory p, uint256 k, Secp256k1.Point memory q) external pure returns (bool) {
        return Secp256k1.mulEquals(p, k, q);
    }

    function reconstruct(uint8 a, uint8 b, uint256 ya, uint256 yb) external pure returns (uint256) {
        return Secp256k1.reconstruct(a, b, ya, yb);
    }

    function shareKey(Secp256k1.Point memory s, uint8 index) external pure returns (uint256) {
        return Secp256k1.shareKey(s, index);
    }
}
