// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {BlindAuction} from "../src/BlindAuction.sol";

/// @notice Deploys the auction contract. Set MONAD_PRIVATE_KEY in the environment.
contract Deploy is Script {
    function run() external {
        uint256 key = vm.envUint("MONAD_PRIVATE_KEY");
        vm.startBroadcast(key);
        BlindAuction auction = new BlindAuction();
        vm.stopBroadcast();
        console2.log("BlindAuction", address(auction));
    }
}
