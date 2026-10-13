// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {Secp256k1} from "../../src/Secp256k1.sol";
import {Secp256k1Harness} from "./Mocks.sol";

contract Secp256k1Test is Test {
    uint256 internal constant N = Secp256k1.N;
    Secp256k1Harness internal lib;

    function setUp() public {
        lib = new Secp256k1Harness();
    }

    function _pub(uint256 k) internal returns (Secp256k1.Point memory) {
        Vm.Wallet memory wallet = vm.createWallet(k);
        return Secp256k1.Point(wallet.publicKeyX, wallet.publicKeyY);
    }

    function test_constantsMatchTheCurve() public pure {
        assertEq(Secp256k1.P, type(uint256).max - (2 ** 32) - 976, "p = 2^256 - 2^32 - 977");
        assertEq(mulmod(2, Secp256k1.INV2, N), 1, "INV2 * 2 = 1 mod n");
    }

    function test_generatorIsValid() public view {
        assertTrue(lib.isValid(Secp256k1.generator()));
    }

    function test_rejectsBadPoints() public view {
        Secp256k1.Point memory g = Secp256k1.generator();
        assertFalse(lib.isValid(Secp256k1.Point(0, g.y)));
        assertFalse(lib.isValid(Secp256k1.Point(N, g.y)));
        assertFalse(lib.isValid(Secp256k1.Point(g.x, g.y + 1)));
        assertFalse(lib.isValid(Secp256k1.Point(g.x, 0)));
        assertFalse(lib.isValid(Secp256k1.Point(g.x, Secp256k1.P)));
    }

    function testFuzz_mulEqualsOnGenerator(uint256 k) public {
        k = bound(k, 1, N - 1);
        assertTrue(lib.mulEquals(Secp256k1.generator(), k, _pub(k)));
        assertFalse(lib.mulEquals(Secp256k1.generator(), k, _pub(k == N - 1 ? 1 : k + 1)));
    }

    function testFuzz_mulEqualsOnEphemeral(uint256 r, uint256 sk) public {
        r = bound(r, 1, N - 1);
        sk = bound(sk, 1, N - 1);
        Secp256k1.Point memory ephemeral = _pub(r);
        vm.assume(ephemeral.x < N);
        assertTrue(lib.mulEquals(ephemeral, sk, _pub(mulmod(r, sk, N))));
    }

    function test_mulEqualsRejectsZeroAndOrder() public {
        Secp256k1.Point memory g = Secp256k1.generator();
        assertFalse(lib.mulEquals(g, 0, _pub(1)));
        assertFalse(lib.mulEquals(g, N, _pub(1)));
    }

    function testFuzz_reconstructsFromEveryPair(uint256 m, uint256 slope) public view {
        m = bound(m, 0, N - 1);
        slope = bound(slope, 1, N - 1);
        uint256 y0 = addmod(m, slope, N);
        uint256 y1 = addmod(m, mulmod(slope, 2, N), N);
        uint256 y2 = addmod(m, mulmod(slope, 3, N), N);
        assertEq(lib.reconstruct(0, 1, y0, y1), m);
        assertEq(lib.reconstruct(0, 2, y0, y2), m);
        assertEq(lib.reconstruct(1, 2, y1, y2), m);
    }

    function test_reconstructReducesInputsAboveN() public view {
        uint256 slope = 5;
        uint256 y0 = addmod(42, slope, N);
        uint256 y1 = addmod(42, 2 * slope, N);
        assertEq(lib.reconstruct(0, 1, y0 + N, y1), 42);
    }

    function test_reconstructRejectsOtherPairs() public {
        vm.expectRevert(Secp256k1.BadPair.selector);
        lib.reconstruct(1, 0, 1, 1);
        vm.expectRevert(Secp256k1.BadPair.selector);
        lib.reconstruct(0, 0, 1, 1);
        vm.expectRevert(Secp256k1.BadPair.selector);
        lib.reconstruct(2, 3, 1, 1);
    }

    function test_shareKeyMatchesTypeScript() public view {
        // Same constant as packages/sealed-bid/tests/seal.test.ts
        assertEq(lib.shareKey(Secp256k1.generator(), 1), 0xe328175e66eda9cbe0529a0e5053288264e027fbb4751ab5e64a82ffb3a1208b);
    }
}
