// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Secp256k1} from "../../src/Secp256k1.sol";
import {IERC20} from "../../src/IERC20.sol";
import {IMarketSeeder} from "../../src/IMarketSeeder.sol";
import {UniformClearing} from "../../src/UniformClearing.sol";

contract Secp256k1Harness {
    function isValid(Secp256k1.Point memory p) external pure returns (bool) {
        return Secp256k1.isValid(p);
    }

    function mulEquals(Secp256k1.Point memory p, uint256 k, Secp256k1.Point memory q) external pure returns (bool) {
        return Secp256k1.mulEquals(p, k, q);
    }

    function reconstruct(uint8 a, uint8 b, uint256 ya, uint256 yb) external pure returns (uint256) {
        return Secp256k1.reconstruct(a, b, ya, yb);
    }

    function shareKey(Secp256k1.Point memory s, uint8 index) external pure returns (uint256) {
        return Secp256k1.shareKey(s, index);
    }
}

contract MockSeeder is IMarketSeeder {
    bool public rejectConfig;
    bool public revertSeed;
    uint256 public seedCalls;
    uint256 public lastSale;
    uint256 public lastQuote;
    uint256 public lastPrice;
    uint64 public lastLockUntil;

    function setRejectConfig(bool value) external {
        rejectConfig = value;
    }

    function setRevertSeed(bool value) external {
        revertSeed = value;
    }

    function validate(SeedConfig calldata) external view {
        require(!rejectConfig, "config");
    }

    function accept(SeedOrder calldata order) external virtual {
        IERC20(order.saleToken).transferFrom(msg.sender, address(this), order.saleAmount);
        IERC20(order.quoteToken).transferFrom(msg.sender, address(this), order.quoteAmount);
        lastSale = order.saleAmount;
        lastQuote = order.quoteAmount;
        lastPrice = order.clearingPrice;
        lastLockUntil = order.lockUntil;
    }

    function seed(uint256) external {
        require(!revertSeed, "seed");
        seedCalls += 1;
    }
}

contract RevertingAcceptSeeder is MockSeeder {
    function accept(SeedOrder calldata) external pure override {
        revert("accept");
    }
}

contract GreedySeeder is MockSeeder {
    function accept(SeedOrder calldata order) external override {
        IERC20(order.quoteToken).transferFrom(msg.sender, address(this), order.quoteAmount + 1);
    }
}

contract FeeOnTransferToken {
    uint8 public constant decimals = 0;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount - 1;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount - 1;
        return true;
    }
}

/// @dev On `transfer`, calls back into `target` once with `data` and records whether that call succeeded.
contract ReentrantToken {
    uint8 public constant decimals = 0;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    address public target;
    bytes public data;
    bool public reentered;
    bool public reentryOk;
    bytes public reentryError;

    function arm(address target_, bytes calldata data_) external {
        target = target_;
        data = data_;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        if (target != address(0) && !reentered) {
            reentered = true;
            (reentryOk, reentryError) = target.call(data);
        }
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract ClearingHarness {
    function clear(uint256 supply, uint256 minPrice, uint256 stepSize, uint32 stepCount, UniformClearing.Bid[] memory bids)
        external
        pure
        returns (UniformClearing.Outcome memory outcome, UniformClearing.Bid[] memory allocated)
    {
        outcome = UniformClearing.clear(supply, minPrice, stepSize, stepCount, bids);
        allocated = bids;
    }
}
