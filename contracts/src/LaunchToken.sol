// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "./ERC20.sol";

/// @notice Fixed-supply token created by `TokenFactory`. The whole supply is minted once.
contract LaunchToken is ERC20 {
    constructor(string memory name_, string memory symbol_, uint8 decimals_, uint256 supply, address to)
        ERC20(name_, symbol_, decimals_)
    {
        _mint(to, supply);
    }
}
