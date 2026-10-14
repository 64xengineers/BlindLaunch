// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {ERC20} from "../../src/ERC20.sol";
import {LaunchToken} from "../../src/LaunchToken.sol";
import {TestToken} from "../../src/TestToken.sol";
import {TokenFactory} from "../../src/TokenFactory.sol";

contract TokensTest is Test {
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event TokenCreated(
        address indexed token, address indexed creator, string name, string symbol, uint8 decimals, uint256 supply
    );

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function test_testTokenMetadataAndMint() public {
        TestToken token = new TestToken("Blindlaunch USD", "tUSD", 6);
        assertEq(token.name(), "Blindlaunch USD");
        assertEq(token.symbol(), "tUSD");
        assertEq(token.decimals(), 6);
        vm.expectEmit(address(token));
        emit Transfer(address(0), alice, 5e6);
        token.mint(alice, 5e6);
        assertEq(token.balanceOf(alice), 5e6);
        assertEq(token.totalSupply(), 5e6);
    }

    function test_transferFromSpendsAllowanceExceptMax() public {
        TestToken token = new TestToken("T", "T", 18);
        token.mint(alice, 100);
        vm.prank(alice);
        vm.expectEmit(address(token));
        emit Approval(alice, bob, 60);
        token.approve(bob, 60);
        vm.prank(bob);
        token.transferFrom(alice, bob, 40);
        assertEq(token.allowance(alice, bob), 20);
        vm.prank(alice);
        token.approve(bob, type(uint256).max);
        vm.prank(bob);
        token.transferFrom(alice, bob, 10);
        assertEq(token.allowance(alice, bob), type(uint256).max);
        assertEq(token.balanceOf(bob), 50);
    }

    function test_transferBeyondBalanceReverts() public {
        TestToken token = new TestToken("T", "T", 18);
        vm.prank(alice);
        vm.expectRevert();
        token.transfer(bob, 1);
    }

    function test_launchTokenMintsFixedSupplyOnce() public {
        LaunchToken token = new LaunchToken("Moon", "MOON", 18, 1_000_000e18, alice);
        assertEq(token.balanceOf(alice), 1_000_000e18);
        assertEq(token.totalSupply(), 1_000_000e18);
        assertEq(token.decimals(), 18);
        (bool ok,) = address(token).call(abi.encodeWithSignature("mint(address,uint256)", bob, 1));
        assertFalse(ok, "LaunchToken has no mint");
    }

    function test_factoryCreatesAndAnnounces() public {
        TokenFactory factory = new TokenFactory();
        vm.recordLogs();
        vm.prank(alice);
        address token = factory.createToken("Moon", "MOON", 18, 1e24, alice);
        assertEq(ERC20(token).balanceOf(alice), 1e24);
        assertEq(ERC20(token).name(), "Moon");
        assertEq(ERC20(token).symbol(), "MOON");
        Vm.Log[] memory logs = vm.getRecordedLogs();
        Vm.Log memory created = logs[logs.length - 1];
        assertEq(created.topics[0], TokenCreated.selector);
        assertEq(address(uint160(uint256(created.topics[1]))), token);
        assertEq(address(uint160(uint256(created.topics[2]))), alice);
    }

    function test_factoryRejectsBadInput() public {
        TokenFactory factory = new TokenFactory();
        vm.expectRevert(TokenFactory.BadToken.selector);
        factory.createToken("", "MOON", 18, 1, alice);
        vm.expectRevert(TokenFactory.BadToken.selector);
        factory.createToken("Moon", "", 18, 1, alice);
        vm.expectRevert(TokenFactory.BadToken.selector);
        factory.createToken("Moon", "ABCDEFGHIJKLMNOPQ", 18, 1, alice);
        vm.expectRevert(TokenFactory.BadToken.selector);
        factory.createToken("Moon", "MOON", 37, 1, alice);
        vm.expectRevert(TokenFactory.BadToken.selector);
        factory.createToken("Moon", "MOON", 18, 0, alice);
        vm.expectRevert(TokenFactory.BadToken.selector);
        factory.createToken("Moon", "MOON", 18, 1, address(0));
    }
}
