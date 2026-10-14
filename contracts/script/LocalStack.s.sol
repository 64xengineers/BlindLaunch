// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {VmSafe} from "forge-std/Vm.sol";
import {MockKuruRouter, MockMarginAccount} from "../test/v2/kuru/MockKuru.sol";
import {DeployV2} from "./DeployV2.s.sol";

/// @notice Local anvil stack for keeper and web end-to-end tests: mock Kuru, then the v2 contracts
///         with a public-mint tUSD. Writes `deployments/31337.json` (gitignored). Never use on a real chain.
///
/// Environment: MONAD_PRIVATE_KEY, KEEPER0_OWNER, KEEPER1_OWNER, KEEPER2_OWNER.
contract LocalStack is DeployV2 {
    function runLocal() external returns (Deployment memory d) {
        require(block.chainid == 31337, "LocalStack is for anvil only");
        uint256 deployBlock = block.number;
        vm.startBroadcast(vm.envUint("MONAD_PRIVATE_KEY"));
        MockMarginAccount margin = new MockMarginAccount();
        MockKuruRouter router = new MockKuruRouter(margin);
        d = deploy(
            Config({
                keeperOwners: [vm.envAddress("KEEPER0_OWNER"), vm.envAddress("KEEPER1_OWNER"), vm.envAddress("KEEPER2_OWNER")],
                kuruRouter: address(router),
                kuruMargin: address(margin),
                quoteToken: address(0),
                deployTestQuote: true
            })
        );
        vm.stopBroadcast();
        if (vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) {
            _write(d, deployBlock);
        }
    }
}
