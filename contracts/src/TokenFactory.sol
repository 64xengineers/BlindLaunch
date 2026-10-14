// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {LaunchToken} from "./LaunchToken.sol";

/// @notice Deploys fixed-supply launch tokens so a team can create a token and its auction from one page.
contract TokenFactory {
    error BadToken();

    event TokenCreated(
        address indexed token, address indexed creator, string name, string symbol, uint8 decimals, uint256 supply
    );

    function createToken(string calldata name, string calldata symbol, uint8 decimals, uint256 supply, address to)
        external
        returns (address token)
    {
        uint256 nameLength = bytes(name).length;
        uint256 symbolLength = bytes(symbol).length;
        if (nameLength == 0 || nameLength > 64 || symbolLength == 0 || symbolLength > 16) revert BadToken();
        if (decimals > 36 || supply == 0 || to == address(0)) revert BadToken();
        token = address(new LaunchToken(name, symbol, decimals, supply, to));
        emit TokenCreated(token, msg.sender, name, symbol, decimals, supply);
    }
}
