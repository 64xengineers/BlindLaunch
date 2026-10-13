// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BlindAuctionV2} from "../../src/BlindAuctionV2.sol";
import {MarketSeeder} from "../../src/MarketSeeder.sol";
import {IKuruMarginAccount, IKuruRouter} from "../../src/kuru/IKuru.sol";
import {TestToken} from "../../src/TestToken.sol";
import {V2Base} from "../v2/V2Base.sol";
import {IKuruMarginAccount as SpikeMargin, IKuruOrderBook as SpikeBook, SpikeToken, SpikeTrader} from "./KuruSpike.t.sol";

/// @notice The whole v2 flow against Kuru's real testnet contracts on a fork: auction, bids,
///         settle, hand-off, market at the clearing price, a third party buying from the seeded
///         ask, and the unwind paying the authority. Skipped without MONAD_TESTNET_RPC.
contract MarketSeederForkTest is V2Base {
    IKuruRouter internal constant ROUTER = IKuruRouter(0x7EFbE105Ca7415dE98F96622173458ac1c054630);
    IKuruMarginAccount internal constant MARGIN = IKuruMarginAccount(0xd029C2D98ff85D8F64799017fE00a59B1159CE02);
    uint256 internal constant TOKEN = 1e18;
    uint256 internal constant USD = 1e6;

    MarketSeeder internal seeder;

    function setUp() public override {
        string memory rpc = vm.envOr("MONAD_TESTNET_RPC", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc);
        _deploy();
        sale = new TestToken("Fork Moon", "FMOON", 18);
        quote = new TestToken("Fork USD", "fUSD", 6);
        sale.mint(authority, 10_000 * TOKEN);
        vm.prank(authority);
        sale.approve(address(auction), type(uint256).max);
        seeder = new MarketSeeder(address(auction), ROUTER, MARGIN);
        auction.setSeeder(seeder);
    }

    function test_auctionOpensARealKuruMarketAtTheClearingPrice() public {
        BlindAuctionV2.CreateParams memory p = _params();
        p.supply = 1000 * TOKEN;
        p.lotSize = TOKEN;
        p.minPrice = 2_500_000;
        p.stepSize = 100_000;
        p.stepCount = 6;
        p.deposit = 10_000 * USD;
        p.maxNotional = 10_000 * USD;
        p.seedSaleLots = 100;
        p.seedQuoteBps = 2_000;
        p.seedLockUntil = p.cancelAfter + 7 days;
        p.kuruParams = abi.encode(
            MarketSeeder.KuruParams({
                sizePrecision: 1e8,
                pricePrecision: 1e4,
                tickSize: 10,
                minSize: 1e6,
                maxSize: 1e16,
                takerFeeBps: 0,
                makerFeeBps: 0,
                kuruAmmSpread: 100
            })
        );
        uint256 id = _create(p);
        _bid(id, alice, 5, 300);
        _bid(id, bob, 0, 200);
        _closeAndOpenAll(id);
        auction.settle(id);
        auction.handOffSeed(id);
        seeder.seed(id);

        MarketSeeder.Position memory pos = seeder.positionOf(id);
        assertTrue(pos.seeded, "seeded on real Kuru");
        SpikeBook book = SpikeBook(pos.market);
        (address askOwner, uint96 askSize,,,, uint32 askPrice,,) = book.s_orders(pos.askId);
        assertEq(askOwner, pos.vault);
        assertEq(askPrice, 25_000);
        assertEq(askSize, 100e8);

        // A third party buys 40 tokens at the clearing price, 2.5 fUSD each.
        SpikeTrader buyer = new SpikeTrader(SpikeMargin(address(MARGIN)));
        quote.mint(address(buyer), 100 * USD);
        buyer.deposit(SpikeToken(address(quote)), 100 * USD);
        buyer.buy(book, 25_000, 40e8);
        buyer.withdraw(SpikeToken(address(sale)), 40 * TOKEN);
        assertEq(sale.balanceOf(address(buyer)), 40 * TOKEN, "bought from the seeded ask");

        uint256 saleBefore = sale.balanceOf(authority);
        uint256 quoteBefore = quote.balanceOf(authority);
        vm.warp(pos.lockUntil);
        seeder.unwind(id);
        assertEq(sale.balanceOf(authority) - saleBefore, 60 * TOKEN, "unsold seed returned");
        assertEq(quote.balanceOf(authority) - quoteBefore, 350 * USD, "seeded quote plus the 100 fUSD fill");
        assertEq(MARGIN.getBalance(pos.vault, address(sale)), 0);
        assertEq(MARGIN.getBalance(pos.vault, address(quote)), 0);
    }
}
