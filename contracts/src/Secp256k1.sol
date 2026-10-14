// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title Secp256k1
/// @notice The curve operations BlindAuctionV2 needs, without on-chain point multiplication.
///
/// `mulEquals(P, k, Q)` checks `Q == k·P` with one ecrecover call:
/// ecrecover(0, v, P.x, k·P.x mod n) recovers `(P.x)^-1 · (k·P.x) · P = k·P`
/// and returns its address, which is compared to the address of `Q`.
/// See ethresear.ch/t/you-can-kinda-abuse-ecrecover-to-do-ecmul-in-secp256k1-today/2384.
/// Callers must only pass points that satisfy `isValid`.
library Secp256k1 {
    error BadPair();

    struct Point {
        uint256 x;
        uint256 y;
    }

    uint256 internal constant P = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F;
    uint256 internal constant N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;
    uint256 internal constant GX = 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798;
    uint256 internal constant GY = 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8;
    /// @dev Inverse of 2 modulo N.
    uint256 internal constant INV2 = 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A1;

    function generator() internal pure returns (Point memory) {
        return Point(GX, GY);
    }

    /// @dev 0 < x < N (ecrecover needs r < N), 0 < y < P, and y² = x³ + 7.
    function isValid(Point memory p) internal pure returns (bool) {
        if (p.x == 0 || p.x >= N || p.y == 0 || p.y >= P) return false;
        return mulmod(p.y, p.y, P) == addmod(mulmod(mulmod(p.x, p.x, P), p.x, P), 7, P);
    }

    function toAddress(Point memory q) internal pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(q.x, q.y)))));
    }

    function mulEquals(Point memory p, uint256 k, Point memory q) internal pure returns (bool) {
        if (k == 0 || k >= N) return false;
        uint8 v = (p.y & 1) == 0 ? 27 : 28;
        address recovered = ecrecover(bytes32(0), v, bytes32(p.x), bytes32(mulmod(k, p.x, N)));
        return recovered != address(0) && recovered == toAddress(q);
    }

    /// @dev Lagrange interpolation at 0 for shares at x = a+1 and x = b+1.
    function reconstruct(uint8 a, uint8 b, uint256 ya, uint256 yb) internal pure returns (uint256) {
        ya %= N;
        yb %= N;
        if (a == 0 && b == 1) return addmod(mulmod(2, ya, N), N - yb, N);
        if (a == 0 && b == 2) return mulmod(addmod(mulmod(3, ya, N), N - yb, N), INV2, N);
        if (a == 1 && b == 2) return addmod(mulmod(3, ya, N), N - mulmod(2, yb, N), N);
        revert BadPair();
    }

    function shareKey(Point memory s, uint8 index) internal pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(s.x, s.y, index)));
    }
}
