// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {BlindAuctionV2} from "../src/BlindAuctionV2.sol";
import {KeeperRegistry} from "../src/KeeperRegistry.sol";
import {MarketSeeder} from "../src/MarketSeeder.sol";
import {TestToken} from "../src/TestToken.sol";
import {TokenFactory} from "../src/TokenFactory.sol";
import {IKuruMarginAccount, IKuruRouter} from "../src/kuru/IKuru.sol";

/// @notice Deploys and wires the v2 contracts, then writes `deployments/<chainId>.json` at the repo root.
///
/// Environment:
///   MONAD_PRIVATE_KEY                         deployer
///   KEEPER0_OWNER, KEEPER1_OWNER, KEEPER2_OWNER
///   KURU_ROUTER, KURU_MARGIN                   Kuru addresses for this chain (docs/superpowers/spikes.md)
///   QUOTE_TOKEN                                existing quote token (mainnet USDC), or
///   DEPLOY_TEST_QUOTE=true                     deploy a public-mint 6-decimal tUSD (testnet only)
contract DeployV2 is Script {
    struct Config {
        address[3] keeperOwners;
        address kuruRouter;
        address kuruMargin;
        address quoteToken;
        bool deployTestQuote;
    }

    struct Deployment {
        address registry;
        address auction;
        address seeder;
        address factory;
        address quote;
    }

    function run() external returns (Deployment memory d) {
        Config memory config = Config({
            keeperOwners: [vm.envAddress("KEEPER0_OWNER"), vm.envAddress("KEEPER1_OWNER"), vm.envAddress("KEEPER2_OWNER")],
            kuruRouter: vm.envAddress("KURU_ROUTER"),
            kuruMargin: vm.envAddress("KURU_MARGIN"),
            quoteToken: vm.envOr("QUOTE_TOKEN", address(0)),
            deployTestQuote: vm.envOr("DEPLOY_TEST_QUOTE", false)
        });
        uint256 deployBlock = block.number;
        vm.startBroadcast(vm.envUint("MONAD_PRIVATE_KEY"));
        d = deploy(config);
        vm.stopBroadcast();
        // A dry run simulates addresses; only a real broadcast records them.
        if (vm.isContext(VmSafe.ForgeContext.ScriptBroadcast) || vm.isContext(VmSafe.ForgeContext.ScriptResume)) {
            _write(d, deployBlock);
        }
    }

    /// @notice Deploys and wires everything; the caller becomes the auction and registry deployer.
    function deploy(Config memory config) public returns (Deployment memory d) {
        require(config.deployTestQuote != (config.quoteToken != address(0)), "set exactly one of QUOTE_TOKEN, DEPLOY_TEST_QUOTE");
        require(config.kuruRouter.code.length != 0 && config.kuruMargin.code.length != 0, "Kuru not deployed here");

        KeeperRegistry registry = new KeeperRegistry(config.keeperOwners);
        BlindAuctionV2 auction = new BlindAuctionV2(registry);
        MarketSeeder seeder = new MarketSeeder(
            address(auction), IKuruRouter(config.kuruRouter), IKuruMarginAccount(config.kuruMargin)
        );
        auction.setSeeder(seeder);
        registry.setAuction(address(auction));
        TokenFactory factory = new TokenFactory();
        address quote =
            config.deployTestQuote ? address(new TestToken("Blindlaunch USD", "tUSD", 6)) : config.quoteToken;

        d = Deployment({
            registry: address(registry),
            auction: address(auction),
            seeder: address(seeder),
            factory: address(factory),
            quote: quote
        });
    }

    function _write(Deployment memory d, uint256 deployBlock) internal {
        string memory key = "deployment";
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeUint(key, "deployBlock", deployBlock);
        vm.serializeAddress(key, "registry", d.registry);
        vm.serializeAddress(key, "auction", d.auction);
        vm.serializeAddress(key, "seeder", d.seeder);
        vm.serializeAddress(key, "factory", d.factory);
        string memory json = vm.serializeAddress(key, "quote", d.quote);
        string memory path = string.concat(vm.projectRoot(), "/../deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(json, path);
        console2.log("wrote", path);
    }
}
