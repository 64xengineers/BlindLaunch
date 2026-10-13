// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "./ERC20.sol";

/// @notice Public-mint token for Monad testnet. Anyone can mint.
///         Never deploy to mainnet and never treat it as an asset with value.
contract TestToken is ERC20 {
    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_, decimals_) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
