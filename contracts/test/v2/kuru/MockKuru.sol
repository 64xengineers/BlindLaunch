// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "../../../src/IERC20.sol";

/// @dev In-memory stand-ins for Kuru's Router, MarginAccount and OrderBook, faithful to the
///      units the testnet spike measured: price = human quote-per-base × pricePrecision,
///      size = human base × sizePrecision. No matching engine: `fill` simulates a taker.
contract MockMarginAccount {
    mapping(address => mapping(address => uint256)) public getBalance;

    function deposit(address user, address token, uint256 amount) external payable {
        require(IERC20(token).transferFrom(msg.sender, address(this), amount), "pull");
        getBalance[user][token] += amount;
    }

    function withdraw(uint256 amount, address token) external {
        getBalance[msg.sender][token] -= amount;
        require(IERC20(token).transfer(msg.sender, amount), "push");
    }

    function debit(address user, address token, uint256 amount) external {
        getBalance[user][token] -= amount;
    }

    function credit(address user, address token, uint256 amount) external {
        getBalance[user][token] += amount;
    }
}

contract MockOrderBook {
    struct Config {
        address base;
        address quote;
        uint8 baseDecimals;
        uint8 quoteDecimals;
        uint96 sizePrecision;
        uint32 pricePrecision;
        uint32 tickSize;
        uint96 minSize;
        uint96 maxSize;
    }

    struct Order {
        address owner;
        uint96 size;
        uint32 price;
        bool isBuy;
    }

    MockMarginAccount public immutable margin;
    Config public config;
    uint40 public s_orderIdCounter;
    bool public revertOnPost;
    mapping(uint40 => Order) internal _orders;

    constructor(MockMarginAccount margin_, Config memory config_) {
        margin = margin_;
        config = config_;
    }

    function setRevertOnPost(bool value) external {
        revertOnPost = value;
    }

    function baseAmount(uint96 size) public view returns (uint256) {
        return (uint256(size) * 10 ** config.baseDecimals) / config.sizePrecision;
    }

    function quoteAmount(uint96 size, uint32 price) public view returns (uint256) {
        return (uint256(size) * price * 10 ** config.quoteDecimals) / (uint256(config.pricePrecision) * config.sizePrecision);
    }

    function _check(uint32 price, uint96 size) internal view {
        require(!revertOnPost, "post disabled");
        require(price % config.tickSize == 0, "tick");
        require(size >= config.minSize && size <= config.maxSize, "size");
    }

    function addSellOrder(uint32 price, uint96 size, bool) external {
        _check(price, size);
        margin.debit(msg.sender, config.base, baseAmount(size));
        _orders[++s_orderIdCounter] = Order(msg.sender, size, price, false);
    }

    function addBuyOrder(uint32 price, uint96 size, bool) external {
        _check(price, size);
        margin.debit(msg.sender, config.quote, quoteAmount(size, price));
        _orders[++s_orderIdCounter] = Order(msg.sender, size, price, true);
    }

    function batchCancelOrders(uint40[] calldata orderIds) external {
        for (uint256 i = 0; i < orderIds.length; ++i) {
            Order memory order = _orders[orderIds[i]];
            require(order.owner == msg.sender, "owner");
            if (order.isBuy) margin.credit(order.owner, config.quote, quoteAmount(order.size, order.price));
            else margin.credit(order.owner, config.base, baseAmount(order.size));
            delete _orders[orderIds[i]];
        }
    }

    function s_orders(uint40 orderId)
        external
        view
        returns (address owner, uint96 size, uint40 prev, uint40 next, uint40 flippedId, uint32 price, uint32 flippedPrice, bool isBuy)
    {
        Order memory order = _orders[orderId];
        return (order.owner, order.size, 0, 0, 0, order.price, 0, order.isBuy);
    }

    /// @dev A taker fills `size` of a resting order; the maker is credited the counter asset.
    ///      The test must have funded the margin account with that asset.
    function fill(uint40 orderId, uint96 size) external {
        Order storage order = _orders[orderId];
        order.size -= size;
        if (order.isBuy) margin.credit(order.owner, config.base, baseAmount(size));
        else margin.credit(order.owner, config.quote, quoteAmount(size, order.price));
        if (order.size == 0) delete _orders[orderId];
    }
}

contract MockKuruRouter {
    MockMarginAccount public immutable margin;
    uint256 public deployCount;
    MockOrderBook public lastMarket;
    bool public failDeploy;

    constructor(MockMarginAccount margin_) {
        margin = margin_;
    }

    function setFailDeploy(bool value) external {
        failDeploy = value;
    }

    function deployProxy(
        uint8,
        address base,
        address quote,
        uint96 sizePrecision,
        uint32 pricePrecision,
        uint32 tickSize,
        uint96 minSize,
        uint96 maxSize,
        uint256,
        uint256,
        uint96
    ) external returns (address) {
        require(!failDeploy, "deploy disabled");
        deployCount += 1;
        lastMarket = new MockOrderBook(
            margin,
            MockOrderBook.Config({
                base: base,
                quote: quote,
                baseDecimals: IERC20(base).decimals(),
                quoteDecimals: IERC20(quote).decimals(),
                sizePrecision: sizePrecision,
                pricePrecision: pricePrecision,
                tickSize: tickSize,
                minSize: minSize,
                maxSize: maxSize
            })
        );
        return address(lastMarket);
    }
}
