// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BlindAuctionV2} from "../../src/BlindAuctionV2.sol";
import {IMarketSeeder} from "../../src/IMarketSeeder.sol";
import {GreedySeeder, MockSeeder, RevertingAcceptSeeder} from "./Mocks.sol";
import {V2Base} from "./V2Base.sol";

contract SeedTest is V2Base {
    event SeedRequested(uint256 indexed auctionId, uint256 saleAmount, uint256 quoteAmount);
    event SeedFailed(uint256 indexed auctionId);

    function _withSeeder(MockSeeder seeder) internal {
        auction.setSeeder(IMarketSeeder(address(seeder)));
    }

    function _seededParams() internal view returns (BlindAuctionV2.CreateParams memory p) {
        p = _params();
        p.seedSaleLots = 100;
        p.seedQuoteBps = 2_000;
        p.seedLockUntil = p.cancelAfter + 30 days;
        p.kuruParams = hex"c0ffee";
    }

    /// Undersubscribed: sold 150 at 50, unsold 850, seed 100 sale and 20% of 7,500 = 1,500 quote.
    function _prepareUndersubscribed() internal returns (uint256 id) {
        id = _create(_seededParams());
        _bid(id, alice, 5, 100);
        _bid(id, bob, 0, 50);
        _closeAndOpenAll(id);
    }

    function _settleUndersubscribed() internal returns (uint256 id) {
        id = _prepareUndersubscribed();
        auction.settle(id);
    }

    function test_setSeederOnlyDeployerOnlyOnce() public {
        MockSeeder seeder = new MockSeeder();
        vm.prank(alice);
        vm.expectRevert(BlindAuctionV2.NotDeployer.selector);
        auction.setSeeder(IMarketSeeder(address(seeder)));
        _withSeeder(seeder);
        vm.expectRevert(BlindAuctionV2.SeederAlreadySet.selector);
        auction.setSeeder(IMarketSeeder(address(seeder)));
    }

    function test_validateRunsAtCreate() public {
        MockSeeder seeder = new MockSeeder();
        _withSeeder(seeder);
        seeder.setRejectConfig(true);
        _enqueueKeys();
        vm.prank(authority);
        vm.expectRevert(bytes("config"));
        auction.createAuction(_seededParams());
    }

    function test_rejectsBadSeedConfig() public {
        _withSeeder(new MockSeeder());
        BlindAuctionV2.CreateParams memory p = _seededParams();
        p.seedSaleLots = 1001;
        _enqueueKeys();
        vm.prank(authority);
        vm.expectRevert(BlindAuctionV2.BadSeed.selector);
        auction.createAuction(p);
        p = _seededParams();
        p.seedQuoteBps = 10_001;
        vm.prank(authority);
        vm.expectRevert(BlindAuctionV2.BadSeed.selector);
        auction.createAuction(p);
        p = _seededParams();
        p.seedLockUntil = p.cancelAfter - 1;
        vm.prank(authority);
        vm.expectRevert(BlindAuctionV2.BadSeed.selector);
        auction.createAuction(p);
    }

    function test_handOffMovesExactAmountsAndReclaimExcludesThem() public {
        MockSeeder seeder = new MockSeeder();
        _withSeeder(seeder);
        uint256 id = _prepareUndersubscribed();
        vm.expectEmit(address(auction));
        emit SeedRequested(id, 100, 1_500);
        auction.settle(id);

        assertEq(sale.balanceOf(address(seeder)), 100);
        assertEq(quote.balanceOf(address(seeder)), 1_500);
        assertEq(seeder.lastPrice(), 50);
        assertEq(seeder.seedCalls(), 1);
        assertEq(sale.allowance(address(auction), address(seeder)), 0);
        assertEq(quote.allowance(address(auction), address(seeder)), 0);
        BlindAuctionV2.Auction memory a = auction.getAuction(id);
        assertEq(a.seedSale, 100);
        assertEq(a.seedQuote, 1_500);
        assertEq(auction.kuruParamsOf(id), hex"c0ffee");

        _claim(id, alice, 100, DEPOSIT - 5_000);
        _claim(id, bob, 50, DEPOSIT - 2_500);
        uint256 saleBefore = sale.balanceOf(authority);
        vm.prank(authority);
        auction.reclaim(id);
        assertEq(sale.balanceOf(authority) - saleBefore, 750);
        assertEq(quote.balanceOf(authority), 6_000);
        assertEq(sale.balanceOf(address(auction)), 0);
        assertEq(quote.balanceOf(address(auction)), 0);
    }

    function test_acceptRevertLeavesFundsWithAuthority() public {
        _withSeeder(new RevertingAcceptSeeder());
        uint256 id = _prepareUndersubscribed();
        vm.expectEmit(address(auction));
        emit SeedFailed(id);
        auction.settle(id);
        assertEq(auction.getAuction(id).seedSale, 0);
        vm.prank(authority);
        auction.reclaim(id);
        assertEq(quote.balanceOf(authority), 7_500);
    }

    function test_seedRevertLeavesFundsPendingAtSeeder() public {
        MockSeeder seeder = new MockSeeder();
        seeder.setRevertSeed(true);
        _withSeeder(seeder);
        uint256 id = _settleUndersubscribed();
        assertEq(seeder.seedCalls(), 0);
        assertEq(quote.balanceOf(address(seeder)), 1_500);
        assertEq(auction.getAuction(id).seedQuote, 1_500);
    }

    function test_seederCannotPullMoreThanApproved() public {
        _withSeeder(new GreedySeeder());
        uint256 id = _prepareUndersubscribed();
        vm.expectEmit(address(auction));
        emit SeedFailed(id);
        auction.settle(id);
    }

    function test_lowGasSettleCannotSkipTheHandOff() public {
        _withSeeder(new MockSeeder());
        uint256 id = _create(_seededParams());
        _bid(id, alice, 5, 100);
        _closeAndOpenAll(id);
        vm.expectRevert(BlindAuctionV2.InsufficientGas.selector);
        auction.settle{gas: 1_000_000}(id);
    }

    function test_nothingSoldMeansNoHandOff() public {
        MockSeeder seeder = new MockSeeder();
        _withSeeder(seeder);
        uint256 id = _create(_seededParams());
        _close(id, 0, 1);
        auction.settle(id);
        assertEq(seeder.lastQuote(), 0);
        assertEq(auction.getAuction(id).seedSale, 0);
    }
}
