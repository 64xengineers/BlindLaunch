// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {DeployV2} from "../../script/DeployV2.s.sol";
import {BlindAuctionV2} from "../../src/BlindAuctionV2.sol";
import {KeeperRegistry} from "../../src/KeeperRegistry.sol";
import {MarketSeeder} from "../../src/MarketSeeder.sol";
import {TestToken} from "../../src/TestToken.sol";
import {MockKuruRouter, MockMarginAccount} from "./kuru/MockKuru.sol";

contract DeployV2Test is Test {
    DeployV2 internal script;
    DeployV2.Config internal config;

    function setUp() public {
        script = new DeployV2();
        MockMarginAccount margin = new MockMarginAccount();
        config.keeperOwners = [makeAddr("k0"), makeAddr("k1"), makeAddr("k2")];
        config.kuruRouter = address(new MockKuruRouter(margin));
        config.kuruMargin = address(margin);
        config.deployTestQuote = true;
    }

    function test_deploysAndWiresEverything() public {
        DeployV2.Deployment memory d = script.deploy(config);
        BlindAuctionV2 auction = BlindAuctionV2(d.auction);
        KeeperRegistry registry = KeeperRegistry(d.registry);
        MarketSeeder seeder = MarketSeeder(d.seeder);

        assertEq(address(auction.registry()), d.registry);
        assertEq(address(auction.seeder()), d.seeder);
        assertEq(registry.auction(), d.auction);
        assertEq(seeder.auction(), d.auction);
        assertEq(address(seeder.router()), config.kuruRouter);
        assertEq(address(seeder.margin()), config.kuruMargin);
        assertEq(registry.owners(0), config.keeperOwners[0]);
        assertEq(registry.owners(2), config.keeperOwners[2]);
        assertEq(TestToken(d.quote).decimals(), 6);
        assertEq(TestToken(d.quote).symbol(), "tUSD");
        assertTrue(d.factory.code.length != 0);
    }

    function test_usesAnExistingQuoteTokenOnMainnet() public {
        TestToken usdc = new TestToken("USD Coin", "USDC", 6);
        config.deployTestQuote = false;
        config.quoteToken = address(usdc);
        assertEq(script.deploy(config).quote, address(usdc));
    }

    function test_requiresExactlyOneQuoteChoice() public {
        config.quoteToken = makeAddr("usdc");
        vm.expectRevert(bytes("set exactly one of QUOTE_TOKEN, DEPLOY_TEST_QUOTE"));
        script.deploy(config);
        config.deployTestQuote = false;
        config.quoteToken = address(0);
        vm.expectRevert(bytes("set exactly one of QUOTE_TOKEN, DEPLOY_TEST_QUOTE"));
        script.deploy(config);
    }

    function test_refusesAChainWithoutKuru() public {
        config.kuruRouter = makeAddr("nothing");
        vm.expectRevert(bytes("Kuru not deployed here"));
        script.deploy(config);
    }
}
