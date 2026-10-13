// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BlindAuctionV2} from "../../src/BlindAuctionV2.sol";
import {IMarketSeeder} from "../../src/IMarketSeeder.sol";
import {MarketSeeder} from "../../src/MarketSeeder.sol";
import {IKuruMarginAccount, IKuruRouter} from "../../src/kuru/IKuru.sol";
import {TestToken} from "../../src/TestToken.sol";
import {MockKuruRouter, MockMarginAccount, MockOrderBook} from "./kuru/MockKuru.sol";
import {V2Base} from "./V2Base.sol";

/// @notice MarketSeeder against a Kuru mock with an 18-decimal sale token and a 6-decimal quote.
///         Reference sale: ladder 2.5 to 3.0 tUSD per token, 1,000 tokens, bids 300 @ 3.0 and
///         200 @ 2.5, so it clears at 2.5 with 500 sold; seed 100 tokens and 20% of 1,250 tUSD.
contract MarketSeederTest is V2Base {
    event MarketSeeded(
        uint256 indexed auctionId,
        address indexed market,
        address vault,
        uint32 askPrice,
        uint96 askSize,
        uint32 bidPrice,
        uint96 bidSize
    );

    uint256 internal constant TOKEN = 1e18;
    uint256 internal constant USD = 1e6;

    MockMarginAccount internal kuruMargin;
    MockKuruRouter internal kuruRouter;
    MarketSeeder internal seeder;
    address internal kuruOwner = makeAddr("kuru router owner");

    function setUp() public override {
        super.setUp();
        sale = new TestToken("Moon", "MOON", 18);
        quote = new TestToken("Test USD", "tUSD", 6);
        sale.mint(authority, 10_000 * TOKEN);
        vm.prank(authority);
        sale.approve(address(auction), type(uint256).max);
        kuruMargin = new MockMarginAccount();
        kuruRouter = new MockKuruRouter(kuruMargin);
        kuruRouter.setOwner(kuruOwner);
        seeder = new MarketSeeder(
            address(auction), IKuruRouter(address(kuruRouter)), IKuruMarginAccount(address(kuruMargin))
        );
        auction.setSeeder(seeder);
    }

    function _kuru() internal pure returns (MarketSeeder.KuruParams memory) {
        return MarketSeeder.KuruParams({
            sizePrecision: 1e8,
            pricePrecision: 1e4,
            tickSize: 10,
            minSize: 1e6,
            maxSize: 1e16,
            takerFeeBps: 0,
            makerFeeBps: 0,
            kuruAmmSpread: 100
        });
    }

    function _seededParams() internal view returns (BlindAuctionV2.CreateParams memory p) {
        p = _params();
        p.supply = 1000 * TOKEN;
        p.lotSize = TOKEN;
        p.minPrice = 2_500_000; // 2.5 tUSD per token
        p.stepSize = 100_000; // 0.1 tUSD
        p.stepCount = 6;
        p.deposit = 10_000 * USD;
        p.maxNotional = 10_000 * USD;
        p.seedSaleLots = 100;
        p.seedQuoteBps = 2_000;
        p.seedLockUntil = p.cancelAfter + 7 days;
        p.kuruParams = abi.encode(_kuru());
    }

    function _config(BlindAuctionV2.CreateParams memory p) internal view returns (IMarketSeeder.SeedConfig memory) {
        return IMarketSeeder.SeedConfig({
            saleToken: address(sale),
            quoteToken: address(quote),
            lotSize: p.lotSize,
            minPrice: p.minPrice,
            stepSize: p.stepSize,
            stepCount: p.stepCount,
            kuruParams: p.kuruParams
        });
    }

    function _settled(BlindAuctionV2.CreateParams memory p) internal returns (uint256 id) {
        id = _create(p);
        _bid(id, alice, 5, 300);
        _bid(id, bob, 0, 200);
        _closeAndOpenAll(id);
        auction.settle(id);
    }

    function _settled() internal returns (uint256) {
        return _settled(_seededParams());
    }

    function _withKuru(BlindAuctionV2.CreateParams memory p, MarketSeeder.KuruParams memory k)
        internal
        pure
        returns (BlindAuctionV2.CreateParams memory)
    {
        p.kuruParams = abi.encode(k);
        return p;
    }

    function _open(uint256 id) internal {
        auction.handOffSeed(id);
        seeder.seed(id);
    }

    /// @dev Monad mainnet: only the Router's owner may create a market, so Kuru makes it.
    function _ownerMarket(address base, address quoteToken, MarketSeeder.KuruParams memory k)
        internal
        returns (address market)
    {
        kuruRouter.setOwnerOnly(true);
        vm.prank(kuruOwner);
        market = kuruRouter.deployProxy(
            0,
            base,
            quoteToken,
            k.sizePrecision,
            k.pricePrecision,
            k.tickSize,
            k.minSize,
            k.maxSize,
            k.takerFeeBps,
            k.makerFeeBps,
            k.kuruAmmSpread
        );
    }

    function _handedOff() internal returns (uint256 id) {
        id = _settled();
        auction.handOffSeed(id);
    }

    // ------------------------------------------------------------------ validate (S1 to S4)

    function test_validateAcceptsAnOnTickLadder() public view {
        seeder.validate(_config(_seededParams()));
    }

    function test_validateRejectsOffTickLadders() public {
        BlindAuctionV2.CreateParams memory p = _seededParams();
        MarketSeeder.KuruParams memory k = _kuru();
        k.tickSize = 300;
        vm.expectRevert(MarketSeeder.OffTick.selector);
        seeder.validate(_config(_withKuru(p, k)));

        p = _seededParams();
        p.minPrice = 2_500_001; // 25,000.01 in Kuru units: not a whole price
        vm.expectRevert(MarketSeeder.OffTick.selector);
        seeder.validate(_config(p));
    }

    function test_validateRejectsAFloorBelowTwoTicks() public {
        BlindAuctionV2.CreateParams memory p = _seededParams();
        p.minPrice = 100;
        p.stepSize = 100;
        MarketSeeder.KuruParams memory k = _kuru();
        k.tickSize = 1;
        vm.expectRevert(MarketSeeder.PriceTooLow.selector);
        seeder.validate(_config(_withKuru(p, k)));
    }

    function test_validateRejectsPricesAboveUint32() public {
        BlindAuctionV2.CreateParams memory p = _seededParams();
        p.minPrice = 500_000 * USD;
        vm.expectRevert(MarketSeeder.PriceTooHigh.selector);
        seeder.validate(_config(p));
    }

    function test_validateRejectsBadKuruParams() public {
        BlindAuctionV2.CreateParams memory p = _seededParams();
        MarketSeeder.KuruParams memory k = _kuru();
        k.sizePrecision = 0;
        vm.expectRevert(MarketSeeder.BadParams.selector);
        seeder.validate(_config(_withKuru(p, k)));
        k = _kuru();
        k.minSize = k.maxSize + 1;
        vm.expectRevert(MarketSeeder.BadParams.selector);
        seeder.validate(_config(_withKuru(p, k)));
        k = _kuru();
        k.kuruAmmSpread = 15;
        vm.expectRevert(MarketSeeder.BadParams.selector);
        seeder.validate(_config(_withKuru(p, k)));
    }

    function test_createRunsValidate() public {
        BlindAuctionV2.CreateParams memory p = _seededParams();
        MarketSeeder.KuruParams memory k = _kuru();
        k.tickSize = 300;
        _enqueueKeys();
        vm.prank(authority);
        vm.expectRevert(MarketSeeder.OffTick.selector);
        auction.createAuction(_withKuru(p, k));
    }

    // ------------------------------------------------------------------ accept and seed (S5 to S11, S14)

    function test_onlyTheAuctionCanHandOff() public {
        IMarketSeeder.SeedOrder memory order;
        vm.expectRevert(MarketSeeder.NotAuction.selector);
        seeder.accept(order);
    }

    function test_handOffSeedsTheMarketAtTheClearingPrice() public {
        uint256 id = _settled();
        uint32 bidPrice = 24_990;
        // Floor of 250 tUSD at 2.499 is 10,004,001,600; rounded down to a multiple of
        // 1e8 / gcd(24_990, 1e8) = 1e7 so Kuru can refund it exactly: 100 tokens.
        uint96 bidSize = 10_000_000_000;

        auction.handOffSeed(id);
        vm.expectEmit(false, false, false, false, address(seeder));
        emit MarketSeeded(id, address(0), address(0), 25_000, 100e8, bidPrice, bidSize);
        seeder.seed(id);

        MarketSeeder.Position memory pos = seeder.positionOf(id);
        assertTrue(pos.seeded);
        assertEq(pos.saleAmount, 100 * TOKEN);
        assertEq(pos.quoteAmount, 250 * USD);
        MockOrderBook market = MockOrderBook(pos.market);
        assertEq(address(market), address(kuruRouter.lastMarket()));

        (address askOwner, uint96 askSize,,,, uint32 askPrice,, bool askIsBuy) = market.s_orders(pos.askId);
        assertEq(askOwner, pos.vault);
        assertEq(askPrice, 25_000, "ask at the clearing price, 2.5 tUSD");
        assertEq(askSize, 100e8, "all 100 seeded tokens");
        assertFalse(askIsBuy);

        (address bidOwner, uint96 postedBidSize,,,, uint32 postedBidPrice,, bool bidIsBuy) = market.s_orders(pos.bidId);
        assertEq(bidOwner, pos.vault);
        assertEq(postedBidPrice, bidPrice, "bid one tick below");
        assertEq(postedBidSize, bidSize);
        assertTrue(bidIsBuy);
        assertLe(market.quoteAmount(bidSize, bidPrice), 250 * USD, "bid never needs more quote than seeded");
        assertEq((uint256(bidSize) * bidPrice) % 1e8, 0, "size x price is a whole number of Kuru quote units");

        assertEq(sale.balanceOf(address(seeder)), 0);
        assertEq(quote.balanceOf(address(seeder)), 0);
        assertEq(sale.balanceOf(pos.vault), 0, "everything deposited into the margin account");
    }

    /// A try/catch around seed let wallet gas estimates pick a limit at which seed silently ran out
    /// of gas (found rendering the app on anvil). The hand-off now never opens the market itself.
    function test_handOffNeverOpensTheMarketItself() public {
        uint256 id = _settled();
        auction.handOffSeed(id);
        assertFalse(seeder.positionOf(id).seeded);
        assertEq(quote.balanceOf(address(seeder)), 250 * USD, "funds wait in the seeder");
        seeder.seed(id);
        assertTrue(seeder.positionOf(id).seeded);
    }

    function test_acceptOnlyOncePerAuction() public {
        uint256 id = _settled();
        _open(id);
        IMarketSeeder.SeedOrder memory order;
        order.auctionId = id;
        vm.prank(address(auction));
        vm.expectRevert(MarketSeeder.AlreadyAccepted.selector);
        seeder.accept(order);
    }

    function test_reusesTheMarketForTheSamePairAndParams() public {
        uint256 first = _settled();
        _open(first);
        uint256 second = _create(_seededParams());
        _bid(second, cara, 1, 400);
        _closeAndOpenAll(second);
        auction.settle(second);
        _open(second);
        assertEq(kuruRouter.deployCount(), 1);
        assertEq(seeder.positionOf(first).market, seeder.positionOf(second).market);
        assertTrue(seeder.positionOf(first).vault != seeder.positionOf(second).vault, "one vault per auction");
    }

    function test_skipsASideBelowTheMinimumSize() public {
        BlindAuctionV2.CreateParams memory p = _seededParams();
        p.seedSaleLots = 5;
        MarketSeeder.KuruParams memory k = _kuru();
        k.minSize = 1e9; // 10 tokens
        uint256 id = _settled(_withKuru(p, k));
        _open(id);
        MarketSeeder.Position memory pos = seeder.positionOf(id);
        assertEq(pos.askId, 0, "5 tokens is below the minimum size");
        assertTrue(pos.bidId != 0);
    }

    function test_seedOnlyOnce() public {
        uint256 id = _settled();
        _open(id);
        vm.expectRevert(MarketSeeder.AlreadySeeded.selector);
        seeder.seed(id);
    }

    function test_kuruFailureDoesNotBlockTheHandOffAndSeedCanBeRetried() public {
        uint256 id = _settled();
        kuruRouter.setFailDeploy(true);
        auction.handOffSeed(id);
        assertEq(uint256(auction.getAuction(id).seedState), uint256(BlindAuctionV2.SeedState.HandedOff));
        vm.expectRevert(MarketSeeder.DeployFailed.selector);
        seeder.seed(id);
        assertFalse(seeder.positionOf(id).seeded);
        assertEq(quote.balanceOf(address(seeder)), 250 * USD, "funds wait in the seeder");

        kuruRouter.setFailDeploy(false);
        vm.prank(makeAddr("keeper"));
        seeder.seed(id);
        assertTrue(seeder.positionOf(id).seeded);
    }

    // ------------------------------------------------------------------ seedInto (Monad mainnet: Kuru creates the market)

    function test_seedIntoAnOwnerCreatedMarket() public {
        address market = _ownerMarket(address(sale), address(quote), _kuru());
        uint256 id = _handedOff();
        vm.prank(makeAddr("keeper"));
        seeder.seedInto(id, market);

        MarketSeeder.Position memory pos = seeder.positionOf(id);
        assertTrue(pos.seeded);
        assertEq(pos.market, market);
        assertEq(kuruRouter.deployCount(), 1, "only Kuru's own deploy");
        bytes32 key = keccak256(abi.encode(address(sale), address(quote), abi.encode(_kuru())));
        assertEq(seeder.marketOf(key), market, "recorded for the pair and params");

        MockOrderBook book = MockOrderBook(market);
        (address askOwner, uint96 askSize,,,, uint32 askPrice,, bool askIsBuy) = book.s_orders(pos.askId);
        assertEq(askOwner, pos.vault);
        assertEq(askPrice, 25_000, "ask at the clearing price, 2.5 tUSD");
        assertEq(askSize, 100e8, "all 100 seeded tokens");
        assertFalse(askIsBuy);
        (address bidOwner, uint96 bidSize,,,, uint32 bidPrice,, bool bidIsBuy) = book.s_orders(pos.bidId);
        assertEq(bidOwner, pos.vault);
        assertEq(bidPrice, 24_990, "bid one tick below");
        assertEq(bidSize, 10_000_000_000);
        assertTrue(bidIsBuy);

        // The vault holds the whole seed in Kuru: 100 tokens on the ask, 250 tUSD on the bid and as change.
        assertEq(book.baseAmount(askSize), 100 * TOKEN);
        assertEq(book.quoteAmount(bidSize, bidPrice) + kuruMargin.getBalance(pos.vault, address(quote)), 250 * USD);
        assertEq(sale.balanceOf(address(seeder)), 0);
        assertEq(quote.balanceOf(address(seeder)), 0);
    }

    function test_onMainnetSeedRevertsAndSeedIntoWorks() public {
        kuruRouter.setOwnerOnly(true);
        uint256 id = _handedOff();
        vm.expectRevert(MarketSeeder.DeployFailed.selector);
        seeder.seed(id);
        assertFalse(seeder.positionOf(id).seeded);
        assertEq(quote.balanceOf(address(seeder)), 250 * USD, "funds wait in the seeder");

        address market = _ownerMarket(address(sale), address(quote), _kuru());
        seeder.seedInto(id, market);
        assertTrue(seeder.positionOf(id).seeded);
        assertEq(seeder.positionOf(id).market, market);
    }

    function test_seedReusesAMarketHandedToSeedInto() public {
        address market = _ownerMarket(address(sale), address(quote), _kuru());
        seeder.seedInto(_handedOff(), market);
        uint256 second = _create(_seededParams());
        _bid(second, cara, 1, 400);
        _closeAndOpenAll(second);
        auction.settle(second);
        _open(second);
        assertEq(seeder.positionOf(second).market, market, "no deploy needed for the same pair and params");
        assertEq(kuruRouter.deployCount(), 1);
    }

    function test_seedIntoRejectsAnAddressKuruDidNotCreate() public {
        uint256 id = _handedOff();
        vm.expectRevert(MarketSeeder.NotAKuruMarket.selector);
        seeder.seedInto(id, makeAddr("not a market"));

        // A look-alike book with the right settings that the Router never made.
        MockOrderBook fake = new MockOrderBook(
            kuruMargin,
            MockOrderBook.Config({
                base: address(sale),
                quote: address(quote),
                baseDecimals: 18,
                quoteDecimals: 6,
                sizePrecision: 1e8,
                pricePrecision: 1e4,
                tickSize: 10,
                minSize: 1e6,
                maxSize: 1e16
            })
        );
        vm.expectRevert(MarketSeeder.NotAKuruMarket.selector);
        seeder.seedInto(id, address(fake));
        assertFalse(seeder.positionOf(id).seeded);
    }

    function test_seedIntoRejectsAMarketForAnotherPair() public {
        uint256 id = _handedOff();
        address[3] memory wrong = [
            _ownerMarket(address(new TestToken("Other", "OTHER", 18)), address(quote), _kuru()),
            _ownerMarket(address(sale), address(new TestToken("Other USD", "oUSD", 6)), _kuru()),
            _ownerMarket(address(quote), address(sale), _kuru())
        ];
        for (uint256 i = 0; i < wrong.length; ++i) {
            vm.expectRevert(MarketSeeder.MarketMismatch.selector);
            seeder.seedInto(id, wrong[i]);
        }
        assertFalse(seeder.positionOf(id).seeded);
    }

    function test_seedIntoRejectsAMarketWithOtherSettings() public {
        uint256 id = _handedOff();
        for (uint256 i = 0; i < 7; ++i) {
            MarketSeeder.KuruParams memory k = _kuru();
            if (i == 0) k.pricePrecision = 1e5;
            else if (i == 1) k.sizePrecision = 1e9;
            else if (i == 2) k.tickSize = 20;
            else if (i == 3) k.minSize = 2e6;
            else if (i == 4) k.maxSize = 1e15;
            else if (i == 5) k.takerFeeBps = 30;
            else k.makerFeeBps = 10;
            address market = _ownerMarket(address(sale), address(quote), k);
            vm.expectRevert(MarketSeeder.MarketMismatch.selector);
            seeder.seedInto(id, market);
        }
        assertFalse(seeder.positionOf(id).seeded);

        // The Router does not report the AMM spread, so that is the one setting that may differ.
        MarketSeeder.KuruParams memory spread = _kuru();
        spread.kuruAmmSpread = 200;
        seeder.seedInto(id, _ownerMarket(address(sale), address(quote), spread));
        assertTrue(seeder.positionOf(id).seeded);
    }

    function test_seedIntoOnlyOnce() public {
        address market = _ownerMarket(address(sale), address(quote), _kuru());
        uint256 id = _handedOff();
        seeder.seedInto(id, market);
        vm.expectRevert(MarketSeeder.AlreadySeeded.selector);
        seeder.seedInto(id, market);
        vm.expectRevert(MarketSeeder.AlreadySeeded.selector);
        seeder.seed(id);
    }

    function test_unwindAfterSeedIntoPaysTheAuthority() public {
        address market = _ownerMarket(address(sale), address(quote), _kuru());
        uint256 id = _handedOff();
        seeder.seedInto(id, market);
        MarketSeeder.Position memory pos = seeder.positionOf(id);

        // A taker buys 40 of the 100 seeded tokens at 2.5: the vault earns 100 tUSD.
        quote.mint(address(kuruMargin), 100 * USD);
        MockOrderBook(market).fill(pos.askId, 40e8);

        uint256 saleBefore = sale.balanceOf(authority);
        uint256 quoteBefore = quote.balanceOf(authority);
        vm.warp(pos.lockUntil);
        vm.prank(makeAddr("anyone"));
        seeder.unwind(id);
        assertEq(sale.balanceOf(authority) - saleBefore, 60 * TOKEN, "unsold seed tokens back");
        assertEq(quote.balanceOf(authority) - quoteBefore, 350 * USD, "seeded quote plus fill proceeds");
        assertEq(kuruMargin.getBalance(pos.vault, address(sale)), 0);
        assertEq(kuruMargin.getBalance(pos.vault, address(quote)), 0);
    }

    // ------------------------------------------------------------------ unwind (S12, S13, S15)

    function test_unwindWaitsForTheLock() public {
        uint256 id = _settled();
        _open(id);
        vm.expectRevert(MarketSeeder.Locked.selector);
        seeder.unwind(id);
    }

    function test_unwindAfterAPartialFillPaysEverythingToTheAuthority() public {
        uint256 id = _settled();
        _open(id);
        MarketSeeder.Position memory pos = seeder.positionOf(id);
        MockOrderBook market = MockOrderBook(pos.market);

        // A taker buys 40 of the 100 seeded tokens at 2.5: the vault earns 100 tUSD.
        quote.mint(address(kuruMargin), 100 * USD);
        market.fill(pos.askId, 40e8);

        uint256 saleBefore = sale.balanceOf(authority);
        uint256 quoteBefore = quote.balanceOf(authority);
        vm.warp(pos.lockUntil);
        vm.prank(makeAddr("anyone"));
        seeder.unwind(id);

        assertEq(sale.balanceOf(authority) - saleBefore, 60 * TOKEN, "unsold seed tokens back");
        assertEq(quote.balanceOf(authority) - quoteBefore, 350 * USD, "seeded quote plus fill proceeds");
        assertEq(sale.balanceOf(pos.vault), 0);
        assertEq(quote.balanceOf(pos.vault), 0);
        assertEq(kuruMargin.getBalance(pos.vault, address(sale)), 0);
        assertEq(kuruMargin.getBalance(pos.vault, address(quote)), 0);
        vm.expectRevert(MarketSeeder.AlreadyUnwound.selector);
        seeder.unwind(id);
    }

    function test_unwindReturnsANeverSeededPosition() public {
        uint256 id = _settled();
        kuruRouter.setFailDeploy(true);
        auction.handOffSeed(id);
        uint256 saleBefore = sale.balanceOf(authority);
        vm.warp(seeder.positionOf(id).lockUntil);
        seeder.unwind(id);
        assertEq(sale.balanceOf(authority) - saleBefore, 100 * TOKEN);
        assertEq(quote.balanceOf(authority), 250 * USD);
        assertEq(quote.balanceOf(address(seeder)), 0);
        vm.expectRevert(MarketSeeder.AlreadySeeded.selector);
        seeder.seed(id);
        vm.expectRevert(MarketSeeder.AlreadySeeded.selector);
        seeder.seedInto(id, address(0));
    }

    function test_unwindOfAnUnknownAuctionReverts() public {
        vm.expectRevert(MarketSeeder.NotAccepted.selector);
        seeder.unwind(42);
        vm.expectRevert(MarketSeeder.NotAccepted.selector);
        seeder.seed(42);
        vm.expectRevert(MarketSeeder.NotAccepted.selector);
        seeder.seedInto(42, address(0));
    }

    // ------------------------------------------------------------------ solvency end to end

    function test_everyoneIsPaidAndNothingIsLeftBehind() public {
        uint256 id = _settled();
        _open(id);
        _claim(id, alice, 300 * TOKEN, 10_000 * USD - 300 * 2_500_000);
        _claim(id, bob, 200 * TOKEN, 10_000 * USD - 200 * 2_500_000);
        vm.prank(authority);
        auction.reclaim(id);
        vm.warp(seeder.positionOf(id).lockUntil);
        seeder.unwind(id);
        assertEq(sale.balanceOf(address(auction)), 0);
        assertEq(quote.balanceOf(address(auction)), 0);
        assertEq(sale.balanceOf(authority), 10_000 * TOKEN - 500 * TOKEN, "authority keeps everything unsold");
        assertEq(quote.balanceOf(authority), 500 * 2_500_000, "and all proceeds, after the unwind");
    }
}
