// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {BlindAuction} from "../src/BlindAuction.sol";
import {TestERC20} from "../src/TestERC20.sol";

/// @notice Deploys test tokens and opens one reference auction on Monad testnet.
///         Tokens use 0 decimals. Supply is 1000. The price grid is 50, 60, 70, 80, 90, 100.
///         Set MONAD_PRIVATE_KEY. Do not point this at mainnet.
contract Demo is Script {
    function run() external {
        uint256 key = vm.envUint("MONAD_PRIVATE_KEY");
        address authority = vm.addr(key);
        vm.startBroadcast(key);

        TestERC20 sale = new TestERC20("Blindlaunch Sale", "SALE");
        TestERC20 quote = new TestERC20("Blindlaunch Quote", "QUOTE");
        BlindAuction auction = new BlindAuction();

        sale.mint(authority, 1000);
        sale.approve(address(auction), 1000);
        quote.mint(authority, 10_000_000);

        uint256 auctionId = auction.createAuction(
            BlindAuction.CreateParams({
                saleToken: address(sale),
                quoteToken: address(quote),
                supply: 1000,
                minPrice: 50,
                stepSize: 10,
                stepCount: 6,
                deposit: 1_000_000,
                maxNotional: 1_000_000,
                maxSlots: 8,
                commitDeadline: uint64(block.timestamp + 1 hours),
                revealDeadline: uint64(block.timestamp + 2 hours),
                cancelAfter: uint64(block.timestamp + 3 hours)
            })
        );

        vm.stopBroadcast();

        console2.log("BlindAuction", address(auction));
        console2.log("SaleToken", address(sale));
        console2.log("QuoteToken", address(quote));
        console2.log("auctionId", auctionId);
        console2.log("authority", authority);
    }
}
