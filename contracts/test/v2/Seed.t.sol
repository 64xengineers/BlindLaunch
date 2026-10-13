// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BlindAuctionV2} from "../../src/BlindAuctionV2.sol";
import {IMarketSeeder} from "../../src/IMarketSeeder.sol";
import {GreedySeeder, HostileToken, MockSeeder, RevertingAcceptSeeder} from "./Mocks.sol";
import {V2Base} from "./V2Base.sol";

contract SeedTest is V2Base {
    event SeederSet(address seeder);
    event SeedReserved(uint256 indexed auctionId, uint256 saleAmount, uint256 quoteAmount);
    event SeedHandedOff(uint256 indexed auctionId);
    event SeedReleased(uint256 indexed auctionId);
    event SeedSaleReleased(uint256 indexed auctionId, address to, uint256 amount);
    event SeedQuoteReleased(uint256 indexed auctionId, address to, uint256 amount);

    function _withSeeder(MockSeeder seeder) internal {
        vm.expectEmit(address(auction));
        emit SeederSet(address(seeder));
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
    function _prepareUndersubscribed(BlindAuctionV2.CreateParams memory p) internal returns (uint256 id) {
        id = _create(p);
        _bid(id, alice, 5, 100);
        _bid(id, bob, 0, 50);
        _closeAndOpenAll(id);
    }

    function _settleUndersubscribed() internal returns (uint256 id) {
        id = _prepareUndersubscribed(_seededParams());
        auction.settle(id);
    }

    function _claimAll(uint256 id) internal {
        _claim(id, alice, 100, DEPOSIT - 5_000);
        _claim(id, bob, 50, DEPOSIT - 2_500);
    }

    function test_setSeederOnlyDeployerOnlyOnceNonZero() public {
        MockSeeder seeder = new MockSeeder();
        vm.prank(alice);
        vm.expectRevert(BlindAuctionV2.NotDeployer.selector);
        auction.setSeeder(IMarketSeeder(address(seeder)));
        vm.expectRevert(BlindAuctionV2.SeederAlreadySet.selector);
        auction.setSeeder(IMarketSeeder(address(0)));
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
        _enqueueKeys();
        BlindAuctionV2.CreateParams memory p = _seededParams();
        p.seedSaleLots = 1001;
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

    function test_settleReservesWithoutCallingTheSeeder() public {
        MockSeeder seeder = new MockSeeder();
        _withSeeder(seeder);
        uint256 id = _prepareUndersubscribed(_seededParams());
        vm.expectEmit(address(auction));
        emit SeedReserved(id, 100, 1_500);
        auction.settle(id);
        BlindAuctionV2.Auction memory a = auction.getAuction(id);
        assertEq(uint256(a.seedState), uint256(BlindAuctionV2.SeedState.Reserved));
        assertEq(a.seedSale, 100);
        assertEq(a.seedQuote, 1_500);
        assertEq(seeder.lastQuote(), 0, "settle made no seeder call");
        assertEq(quote.balanceOf(address(seeder)), 0);
    }

    function test_handOffMovesExactAmountsAndReclaimExcludesThem() public {
        MockSeeder seeder = new MockSeeder();
        _withSeeder(seeder);
        uint256 id = _settleUndersubscribed();

        vm.prank(makeAddr("anyone"));
        vm.expectEmit(address(auction));
        emit SeedHandedOff(id);
        auction.handOffSeed(id);

        assertEq(sale.balanceOf(address(seeder)), 100);
        assertEq(quote.balanceOf(address(seeder)), 1_500);
        assertEq(seeder.lastPrice(), 50);
        assertEq(seeder.lastLockUntil(), auction.getAuction(id).seedLockUntil);
        assertEq(seeder.seedCalls(), 0, "opening the market is a separate call");
        assertEq(sale.allowance(address(auction), address(seeder)), 0);
        assertEq(quote.allowance(address(auction), address(seeder)), 0);
        assertEq(uint256(auction.getAuction(id).seedState), uint256(BlindAuctionV2.SeedState.HandedOff));
        assertEq(auction.kuruParamsOf(id), hex"c0ffee");
        vm.expectRevert(BlindAuctionV2.NoSeed.selector);
        auction.handOffSeed(id);
        vm.expectRevert(BlindAuctionV2.NoSeed.selector);
        auction.releaseSeed(id);
        vm.warp(auction.getAuction(id).seedLockUntil);
        vm.startPrank(authority);
        vm.expectRevert(BlindAuctionV2.NoSeed.selector);
        auction.releaseSeedSale(id, authority);
        vm.expectRevert(BlindAuctionV2.NoSeed.selector);
        auction.releaseSeedQuote(id, authority);
        vm.stopPrank();

        _claimAll(id);
        uint256 saleBefore = sale.balanceOf(authority);
        vm.prank(authority);
        auction.reclaim(id);
        assertEq(sale.balanceOf(authority) - saleBefore, 750);
        assertEq(quote.balanceOf(authority), 6_000);
        assertEq(sale.balanceOf(address(auction)), 0);
        assertEq(quote.balanceOf(address(auction)), 0);
    }

    function test_failedHandOffStaysReservedAndIsReleasedAfterTheLock() public {
        _withSeeder(new RevertingAcceptSeeder());
        uint256 id = _settleUndersubscribed();
        vm.expectRevert(bytes("accept"));
        auction.handOffSeed(id);
        assertEq(uint256(auction.getAuction(id).seedState), uint256(BlindAuctionV2.SeedState.Reserved));

        _claimAll(id);
        uint256 saleBefore = sale.balanceOf(authority);
        vm.prank(authority);
        auction.reclaim(id);
        assertEq(sale.balanceOf(authority) - saleBefore, 750, "reserved seed excluded until released");
        assertEq(quote.balanceOf(authority), 6_000);

        vm.expectRevert(BlindAuctionV2.TooEarly.selector);
        auction.releaseSeed(id);
        vm.warp(auction.getAuction(id).seedLockUntil);
        vm.expectEmit(address(auction));
        emit SeedReleased(id);
        auction.releaseSeed(id);
        assertEq(sale.balanceOf(authority) - saleBefore, 850);
        assertEq(quote.balanceOf(authority), 7_500);
        assertEq(sale.balanceOf(address(auction)), 0);
        assertEq(quote.balanceOf(address(auction)), 0);
        vm.expectRevert(BlindAuctionV2.NoSeed.selector);
        auction.handOffSeed(id);
    }

    function test_failingSeedLeavesFundsAtSeederForRetry() public {
        MockSeeder seeder = new MockSeeder();
        seeder.setRevertSeed(true);
        _withSeeder(seeder);
        uint256 id = _settleUndersubscribed();
        auction.handOffSeed(id);
        assertEq(quote.balanceOf(address(seeder)), 1_500);
        vm.expectRevert(bytes("seed"));
        seeder.seed(id);
        seeder.setRevertSeed(false);
        seeder.seed(id);
        assertEq(seeder.seedCalls(), 1);
    }

    function test_seederCannotPullMoreThanApproved() public {
        _withSeeder(new GreedySeeder());
        uint256 id = _settleUndersubscribed();
        vm.expectRevert();
        auction.handOffSeed(id);
        assertEq(uint256(auction.getAuction(id).seedState), uint256(BlindAuctionV2.SeedState.Reserved));
    }

    function test_nothingSoldReservesNothing() public {
        MockSeeder seeder = new MockSeeder();
        _withSeeder(seeder);
        uint256 id = _create(_seededParams());
        _close(id, 0, 1);
        auction.settle(id);
        assertEq(uint256(auction.getAuction(id).seedState), uint256(BlindAuctionV2.SeedState.None));
        vm.expectRevert(BlindAuctionV2.NoSeed.selector);
        auction.handOffSeed(id);
    }

    function test_soldOutSeedsQuoteOnly() public {
        MockSeeder seeder = new MockSeeder();
        _withSeeder(seeder);
        uint256 id = _create(_seededParams());
        _bid(id, alice, 2, 1000);
        _closeAndOpenAll(id);
        auction.settle(id);
        BlindAuctionV2.Auction memory a = auction.getAuction(id);
        assertEq(a.seedSale, 0, "no unsold lots to seed");
        assertEq(a.seedQuote, (70 * 1000 * 2_000) / 10_000);
        auction.handOffSeed(id);
        assertEq(quote.balanceOf(address(seeder)), 14_000);
    }

    function test_zeroQuoteShareSeedsSaleOnly() public {
        MockSeeder seeder = new MockSeeder();
        _withSeeder(seeder);
        BlindAuctionV2.CreateParams memory p = _seededParams();
        p.seedQuoteBps = 0;
        uint256 id = _prepareUndersubscribed(p);
        auction.settle(id);
        assertEq(auction.getAuction(id).seedQuote, 0);
        auction.handOffSeed(id);
        assertEq(sale.balanceOf(address(seeder)), 100);
        assertEq(quote.balanceOf(address(seeder)), 0);
    }

    /// Audit H1: a sale token that starts reverting cannot block settlement or any quote refund.
    function test_hostileSaleTokenCannotLockDeposits() public {
        _withSeeder(new MockSeeder());
        HostileToken token = new HostileToken();
        token.mint(authority, 1000);
        vm.prank(authority);
        token.approve(address(auction), 1000);
        BlindAuctionV2.CreateParams memory p = _seededParams();
        p.saleToken = address(token);
        uint256 id = _prepareUndersubscribed(p);

        token.setBreakBalanceOf(true);
        auction.settle(id);
        assertEq(uint256(auction.getAuction(id).status), uint256(BlindAuctionV2.Status.Settled));

        vm.prank(alice);
        auction.claimRefund(id, alice);
        vm.prank(bob);
        auction.claimRefund(id, bob);
        assertEq(quote.balanceOf(alice), DEPOSIT - 5_000);
        assertEq(quote.balanceOf(bob), DEPOSIT - 2_500);

        vm.expectRevert();
        auction.handOffSeed(id);
        vm.prank(authority);
        auction.reclaimProceeds(id, authority);
        assertEq(quote.balanceOf(authority), 6_000);
        assertEq(quote.balanceOf(address(auction)), 1_500, "only the reserved quote seed remains");
    }
    /// Review finding: a paused sale token held back the reserved quote too. Each leg now moves on its own,
    /// and the authority can send it to another address.
    function test_blockedSaleTokenCannotHoldBackTheQuoteSeed() public {
        _withSeeder(new MockSeeder());
        HostileToken token = new HostileToken();
        token.mint(authority, 1000);
        vm.prank(authority);
        token.approve(address(auction), 1000);
        BlindAuctionV2.CreateParams memory p = _seededParams();
        p.saleToken = address(token);
        uint256 id = _prepareUndersubscribed(p);
        auction.settle(id);

        token.setPaused(true);
        vm.warp(auction.getAuction(id).seedLockUntil);
        vm.expectRevert(BlindAuctionV2.TransferFailed.selector);
        auction.releaseSeed(id);

        address vault = makeAddr("vault");
        vm.prank(alice);
        vm.expectRevert(BlindAuctionV2.NotAuthority.selector);
        auction.releaseSeedQuote(id, vault);
        vm.prank(authority);
        vm.expectRevert(BlindAuctionV2.ZeroAddress.selector);
        auction.releaseSeedQuote(id, address(0));

        vm.prank(authority);
        vm.expectEmit(address(auction));
        emit SeedReleased(id);
        vm.expectEmit(address(auction));
        emit SeedQuoteReleased(id, vault, 1_500);
        auction.releaseSeedQuote(id, vault);
        assertEq(quote.balanceOf(vault), 1_500);
        assertEq(uint256(auction.getAuction(id).seedState), uint256(BlindAuctionV2.SeedState.Released));
        (bool saleOut, bool quoteOut) = auction.seedReleasedOf(id);
        assertFalse(saleOut);
        assertTrue(quoteOut);

        vm.prank(authority);
        vm.expectRevert(BlindAuctionV2.AlreadyReclaimed.selector);
        auction.releaseSeedQuote(id, vault);
        vm.expectRevert(BlindAuctionV2.NoSeed.selector);
        auction.handOffSeed(id);

        token.setPaused(false);
        vm.expectEmit(address(auction));
        emit SeedSaleReleased(id, authority, 100);
        vm.prank(makeAddr("anyone"));
        auction.releaseSeed(id);
        assertEq(token.balanceOf(authority), 100, "only the unpaid sale leg");
        assertEq(quote.balanceOf(vault), 1_500, "quote leg paid once");
        (saleOut, quoteOut) = auction.seedReleasedOf(id);
        assertTrue(saleOut && quoteOut);
        vm.expectRevert(BlindAuctionV2.NoSeed.selector);
        auction.releaseSeed(id);
        vm.prank(authority);
        vm.expectRevert(BlindAuctionV2.AlreadyReclaimed.selector);
        auction.releaseSeedSale(id, authority);
    }

    function test_authorityReleasesEachSeedLegToAnAddressItChooses() public {
        _withSeeder(new MockSeeder());
        uint256 id = _settleUndersubscribed();
        address vault = makeAddr("vault");
        vm.prank(authority);
        vm.expectRevert(BlindAuctionV2.TooEarly.selector);
        auction.releaseSeedSale(id, vault);

        vm.warp(auction.getAuction(id).seedLockUntil);
        vm.prank(authority);
        vm.expectEmit(address(auction));
        emit SeedSaleReleased(id, vault, 100);
        auction.releaseSeedSale(id, vault);
        vm.prank(authority);
        auction.releaseSeedQuote(id, vault);
        assertEq(sale.balanceOf(vault), 100);
        assertEq(quote.balanceOf(vault), 1_500);
        vm.expectRevert(BlindAuctionV2.NoSeed.selector);
        auction.releaseSeed(id);

        _claimAll(id);
        vm.prank(authority);
        auction.reclaim(id);
        assertEq(sale.balanceOf(address(auction)), 0, "seed paid exactly once");
        assertEq(quote.balanceOf(address(auction)), 0, "seed paid exactly once");
    }
}
