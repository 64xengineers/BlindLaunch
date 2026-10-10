// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice The ERC-20 surface BlindAuction uses for sale and quote tokens.
interface IERC20Minimal {
    function balanceOf(address account) external view returns (uint256);

    function transfer(address to, uint256 amount) external returns (bool);

    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}
