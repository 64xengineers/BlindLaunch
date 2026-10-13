// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "../../../src/IERC20.sol";

/// @dev In-memory stand-ins for Kuru's Router, MarginAccount and OrderBook, faithful to the
///      units the testnet spike measured: price = human quote-per-base × pricePrecision,
///      size = human base × sizePrecision. A small matching engine mirrors what the spike saw:
///      an order that crosses resting ones fills against them at their prices, best first; a
///      post-only order that would cross reverts `PostOnlyError`; only a remainder that rests gets
///      an id. Fees are not modelled. `fill` simulates an outside taker.
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
    error PostOnlyError();

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

    function addSellOrder(uint32 price, uint96 size, bool postOnly) external {
        _check(price, size);
        uint96 left = _match(msg.sender, false, price, size, postOnly);
        if (left == 0) return;
        margin.debit(msg.sender, config.base, baseAmount(left));
        _orders[++s_orderIdCounter] = Order(msg.sender, left, price, false);
    }

    function addBuyOrder(uint32 price, uint96 size, bool postOnly) external {
        _check(price, size);
        uint96 left = _match(msg.sender, true, price, size, postOnly);
        if (left == 0) return;
        margin.debit(msg.sender, config.quote, quoteAmount(left, price));
        _orders[++s_orderIdCounter] = Order(msg.sender, left, price, true);
    }

    /// @dev Fills the incoming order against crossing resting orders at their prices, best first,
    ///      and returns what is left to rest.
    function _match(address taker, bool isBuy, uint32 price, uint96 size, bool postOnly)
        internal
        returns (uint96 left)
    {
        left = size;
        while (left != 0) {
            uint40 best = _bestCrossing(isBuy, price);
            if (best == 0) break;
            if (postOnly) revert PostOnlyError();
            Order storage maker = _orders[best];
            uint96 filled = left < maker.size ? left : maker.size;
            uint256 base = baseAmount(filled);
            uint256 quoteValue = quoteAmount(filled, maker.price);
            if (isBuy) {
                margin.debit(taker, config.quote, quoteValue);
                margin.credit(taker, config.base, base);
                margin.credit(maker.owner, config.quote, quoteValue);
            } else {
                margin.debit(taker, config.base, base);
                margin.credit(taker, config.quote, quoteValue);
                margin.credit(maker.owner, config.base, base);
            }
            maker.size -= filled;
            if (maker.size == 0) delete _orders[best];
            left -= filled;
        }
    }

    function _bestCrossing(bool isBuy, uint32 price) internal view returns (uint40 best) {
        uint32 bestPrice;
        for (uint40 id = 1; id <= s_orderIdCounter; ++id) {
            Order storage order = _orders[id];
            if (order.size == 0 || order.isBuy == isBuy) continue;
            if (isBuy ? order.price > price : order.price < price) continue;
            if (best == 0 || (isBuy ? order.price < bestPrice : order.price > bestPrice)) {
                best = id;
                bestPrice = order.price;
            }
        }
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

/// @dev Market creation is open by default, as on Monad testnet. `setOwnerOnly(true)` switches to
///      Monad mainnet's rule: only `owner` may call `deployProxy`, anyone else gets Solady's
///      `Unauthorized()` (0x82b42900). `verifiedMarket` has the real Router's 11-field shape and
///      is all zero for any address this router did not create.
contract MockKuruRouter {
    error Unauthorized();

    struct MarketParams {
        uint32 pricePrecision;
        uint96 sizePrecision;
        address baseAssetAddress;
        uint256 baseAssetDecimals;
        address quoteAssetAddress;
        uint256 quoteAssetDecimals;
        uint32 tickSize;
        uint96 minSize;
        uint96 maxSize;
        uint256 takerFeeBps;
        uint256 makerFeeBps;
    }

    MockMarginAccount public immutable margin;
    address public owner;
    bool public ownerOnly;
    uint256 public deployCount;
    MockOrderBook public lastMarket;
    bool public failDeploy;
    mapping(address => MarketParams) public verifiedMarket;

    constructor(MockMarginAccount margin_) {
        margin = margin_;
        owner = msg.sender;
    }

    function setFailDeploy(bool value) external {
        failDeploy = value;
    }

    function setOwnerOnly(bool value) external {
        ownerOnly = value;
    }

    function setOwner(address value) external {
        owner = value;
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
        uint256 takerFeeBps,
        uint256 makerFeeBps,
        uint96
    ) external returns (address) {
        if (ownerOnly && msg.sender != owner) revert Unauthorized();
        require(!failDeploy, "deploy disabled");
        deployCount += 1;
        MockOrderBook.Config memory config = MockOrderBook.Config({
            base: base,
            quote: quote,
            baseDecimals: IERC20(base).decimals(),
            quoteDecimals: IERC20(quote).decimals(),
            sizePrecision: sizePrecision,
            pricePrecision: pricePrecision,
            tickSize: tickSize,
            minSize: minSize,
            maxSize: maxSize
        });
        lastMarket = new MockOrderBook(margin, config);
        _verify(address(lastMarket), config, takerFeeBps, makerFeeBps);
        return address(lastMarket);
    }

    function _verify(address market, MockOrderBook.Config memory c, uint256 takerFeeBps, uint256 makerFeeBps)
        internal
    {
        verifiedMarket[market] = MarketParams({
            pricePrecision: c.pricePrecision,
            sizePrecision: c.sizePrecision,
            baseAssetAddress: c.base,
            baseAssetDecimals: c.baseDecimals,
            quoteAssetAddress: c.quote,
            quoteAssetDecimals: c.quoteDecimals,
            tickSize: c.tickSize,
            minSize: c.minSize,
            maxSize: c.maxSize,
            takerFeeBps: takerFeeBps,
            makerFeeBps: makerFeeBps
        });
    }
}
