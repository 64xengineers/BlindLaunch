// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "./IERC20.sol";
import {IMarketSeeder} from "./IMarketSeeder.sol";
import {IKuruMarginAccount, IKuruOrderBook, IKuruRouter} from "./kuru/IKuru.sol";

/// @title SeedVault
/// @notice Holds one auction's Kuru position. Kuru margin balances are per address, so one vault
///         per auction keeps every auction's deposits, orders and fill proceeds apart.
contract SeedVault {
    error NotSeeder();
    error TransferFailed();

    address public immutable seeder;
    IKuruMarginAccount public immutable margin;

    constructor(IKuruMarginAccount margin_) {
        seeder = msg.sender;
        margin = margin_;
    }

    modifier onlySeeder() {
        if (msg.sender != seeder) revert NotSeeder();
        _;
    }

    /// @notice Deposits everything the vault holds and posts the resting orders. A zero size skips that side.
    function post(
        IKuruOrderBook book,
        address saleToken,
        address quoteToken,
        uint32 askPrice,
        uint96 askSize,
        uint32 bidPrice,
        uint96 bidSize
    ) external onlySeeder returns (uint40 askId, uint40 bidId) {
        _deposit(saleToken);
        _deposit(quoteToken);
        if (askSize != 0) {
            book.addSellOrder(askPrice, askSize, true);
            askId = book.s_orderIdCounter();
        }
        if (bidSize != 0) {
            book.addBuyOrder(bidPrice, bidSize, true);
            bidId = book.s_orderIdCounter();
        }
    }

    /// @notice Cancels whatever is still resting, withdraws every balance and sends it to `to`.
    function unwind(
        IKuruOrderBook book,
        address saleToken,
        address quoteToken,
        uint40 askId,
        uint40 bidId,
        address to
    ) external onlySeeder returns (uint256 saleOut, uint256 quoteOut) {
        _cancelIfLive(book, askId);
        _cancelIfLive(book, bidId);
        saleOut = _withdrawAll(saleToken, to);
        quoteOut = _withdrawAll(quoteToken, to);
    }

    function _deposit(address token) private {
        uint256 amount = IERC20(token).balanceOf(address(this));
        if (amount == 0) return;
        _call(token, abi.encodeCall(IERC20.approve, (address(margin), amount)));
        margin.deposit(address(this), token, amount);
    }

    function _cancelIfLive(IKuruOrderBook book, uint40 orderId) private {
        if (orderId == 0) return;
        (address owner, uint96 size,,,,,,) = book.s_orders(orderId);
        if (owner != address(this) || size == 0) return;
        uint40[] memory ids = new uint40[](1);
        ids[0] = orderId;
        book.batchCancelOrders(ids);
    }

    function _withdrawAll(address token, address to) private returns (uint256 amount) {
        uint256 held = margin.getBalance(address(this), token);
        if (held != 0) margin.withdraw(held, token);
        amount = IERC20(token).balanceOf(address(this));
        if (amount != 0) _call(token, abi.encodeCall(IERC20.transfer, (to, amount)));
    }

    function _call(address token, bytes memory data) private {
        (bool ok, bytes memory returned) = token.call(data);
        if (!ok) revert TransferFailed();
        if (returned.length > 0 && !abi.decode(returned, (bool))) revert TransferFailed();
    }
}

/// @title MarketSeeder
/// @notice Opens a Kuru order-book market at an auction's clearing price.
///
/// `BlindAuctionV2.handOffSeed` approves the reserved amounts and calls `accept`, which pulls them.
/// The position is then seeded (anyone, retryable) by one of two paths, which differ only in
/// where the market comes from:
///
/// - `seed` creates the Kuru market itself, once per (pair, params), through the Router's
///   `deployProxy`. That works where market creation is open (Monad testnet, local mocks).
///   Where it is not, it reverts `DeployFailed` and nothing moves.
/// - `seedInto` uses a market that already exists. On Monad mainnet only the Kuru Router's owner
///   may create markets (anyone else gets `Unauthorized()`), while trading in a market is open
///   to all, so the market is created by Kuru and handed in here. The Router's
///   `verifiedMarket(market)` must show a genuine Kuru market for exactly this sale token and
///   quote token with every setting the auction declared (price and size precision, tick size,
///   min and max size, taker and maker fee); anything else reverts `NotAKuruMarket` or
///   `MarketMismatch`. The Router does not report the AMM spread, so that one is not checked.
///
/// Both paths then move the funds into a fresh `SeedVault` and post an ask at the clearing price
/// and a bid one tick below. After `lockUntil`, `unwind` (anyone) cancels what is left and pays
/// everything, including fill proceeds, to the auction's authority. A position that was never
/// seeded is returned the same way, so seed funds cannot get stuck.
contract MarketSeeder is IMarketSeeder {
    struct KuruParams {
        uint96 sizePrecision;
        uint32 pricePrecision;
        uint32 tickSize;
        uint96 minSize;
        uint96 maxSize;
        uint256 takerFeeBps;
        uint256 makerFeeBps;
        uint96 kuruAmmSpread;
    }

    struct Position {
        address authority;
        address saleToken;
        address quoteToken;
        uint256 saleAmount;
        uint256 quoteAmount;
        uint256 clearingPrice;
        uint256 lotSize;
        uint64 lockUntil;
        bool accepted;
        bool seeded;
        bool unwound;
        address market;
        address vault;
        uint40 askId;
        uint40 bidId;
    }

    struct Orders {
        uint32 askPrice;
        uint96 askSize;
        uint32 bidPrice;
        uint96 bidSize;
    }

    /// @dev The Router's `verifiedMarket(market)` record, one word per field; all zero for an
    ///      address the Router did not create.
    struct VerifiedMarket {
        uint256 pricePrecision;
        uint256 sizePrecision;
        address baseAsset;
        uint256 baseDecimals;
        address quoteAsset;
        uint256 quoteDecimals;
        uint256 tickSize;
        uint256 minSize;
        uint256 maxSize;
        uint256 takerFeeBps;
        uint256 makerFeeBps;
    }

    error NotAuction();
    error AlreadyAccepted();
    error NotAccepted();
    error AlreadySeeded();
    error Locked();
    error AlreadyUnwound();
    error BadParams();
    error OffTick();
    error PriceTooLow();
    error PriceTooHigh();
    error DeployFailed();
    error NotAKuruMarket();
    error MarketMismatch();
    error TransferFailed();
    error Reentrancy();

    event SeedAccepted(uint256 indexed auctionId, uint256 saleAmount, uint256 quoteAmount);
    event MarketSeeded(
        uint256 indexed auctionId,
        address indexed market,
        address vault,
        uint32 askPrice,
        uint96 askSize,
        uint32 bidPrice,
        uint96 bidSize
    );
    event SeedUnwound(uint256 indexed auctionId, address indexed authority, uint256 saleOut, uint256 quoteOut);

    uint8 internal constant MAX_DECIMALS = 36;

    address public immutable auction;
    IKuruRouter public immutable router;
    IKuruMarginAccount public immutable margin;

    mapping(uint256 => Position) internal _positions;
    mapping(uint256 => bytes) internal _params;
    /// @notice The market used for each (pair, params), keyed by keccak256(abi.encode(sale, quote, kuruParams)):
    ///         created by `seed`, or the first one handed to `seedInto`.
    mapping(bytes32 => address) public marketOf;
    uint256 private _locked = 1;

    modifier nonReentrant() {
        if (_locked != 1) revert Reentrancy();
        _locked = 2;
        _;
        _locked = 1;
    }

    constructor(address auction_, IKuruRouter router_, IKuruMarginAccount margin_) {
        auction = auction_;
        router = router_;
        margin = margin_;
    }

    // ------------------------------------------------------------------ IMarketSeeder

    /// @notice Every ladder price must map to a whole, on-tick Kuru price that fits uint32,
    ///         and the floor must be at least two ticks so the bid one tick below is positive.
    function validate(SeedConfig calldata config) external view {
        KuruParams memory k = _decode(config.kuruParams);
        uint8 saleDecimals = IERC20(config.saleToken).decimals();
        uint8 quoteDecimals = IERC20(config.quoteToken).decimals();
        if (saleDecimals > MAX_DECIMALS || quoteDecimals > MAX_DECIMALS) revert BadParams();
        for (uint256 step = 0; step < config.stepCount; ++step) {
            uint256 price = config.minPrice + step * config.stepSize;
            uint256 kuruPrice = _kuruPrice(price, config.lotSize, saleDecimals, quoteDecimals, k);
            if (step == 0 && kuruPrice < 2 * uint256(k.tickSize)) revert PriceTooLow();
        }
    }

    function accept(SeedOrder calldata order) external nonReentrant {
        if (msg.sender != auction) revert NotAuction();
        Position storage pos = _positions[order.auctionId];
        if (pos.accepted) revert AlreadyAccepted();
        pos.accepted = true;
        pos.authority = order.authority;
        pos.saleToken = order.saleToken;
        pos.quoteToken = order.quoteToken;
        pos.saleAmount = order.saleAmount;
        pos.quoteAmount = order.quoteAmount;
        pos.clearingPrice = order.clearingPrice;
        pos.lotSize = order.lotSize;
        pos.lockUntil = order.lockUntil;
        _params[order.auctionId] = order.kuruParams;
        _pull(order.saleToken, order.saleAmount);
        _pull(order.quoteToken, order.quoteAmount);
        emit SeedAccepted(order.auctionId, order.saleAmount, order.quoteAmount);
    }

    /// @notice Seeds into the market for this (pair, params), creating it through the Kuru Router
    ///         the first time. Reverts `DeployFailed` where the Router does not let this contract
    ///         create markets (Monad mainnet); use `seedInto` there.
    function seed(uint256 auctionId) external nonReentrant {
        Position storage pos = _seedable(auctionId);
        KuruParams memory k = _decode(_params[auctionId]);
        _seed(auctionId, pos, k, _marketFor(auctionId, pos, k));
    }

    /// @notice Seeds into an existing Kuru market, such as one Kuru created on Monad mainnet. The
    ///         Router must vouch for `market` as a genuine market for this sale token and quote
    ///         token with every setting the auction declared.
    function seedInto(uint256 auctionId, address market) external nonReentrant {
        Position storage pos = _seedable(auctionId);
        KuruParams memory k = _decode(_params[auctionId]);
        _checkMarket(pos, k, market);
        bytes32 key = _marketKey(auctionId, pos);
        if (marketOf[key] == address(0)) marketOf[key] = market;
        _seed(auctionId, pos, k, market);
    }

    // ------------------------------------------------------------------ unwind

    function unwind(uint256 auctionId) external nonReentrant {
        Position storage pos = _positions[auctionId];
        if (!pos.accepted) revert NotAccepted();
        if (pos.unwound) revert AlreadyUnwound();
        if (block.timestamp < pos.lockUntil) revert Locked();
        pos.unwound = true;
        uint256 saleOut;
        uint256 quoteOut;
        if (pos.seeded) {
            (saleOut, quoteOut) = SeedVault(pos.vault).unwind(
                IKuruOrderBook(pos.market), pos.saleToken, pos.quoteToken, pos.askId, pos.bidId, pos.authority
            );
        } else {
            saleOut = pos.saleAmount;
            quoteOut = pos.quoteAmount;
            _push(pos.saleToken, pos.authority, saleOut);
            _push(pos.quoteToken, pos.authority, quoteOut);
        }
        emit SeedUnwound(auctionId, pos.authority, saleOut, quoteOut);
    }

    // ------------------------------------------------------------------ views

    function positionOf(uint256 auctionId) external view returns (Position memory) {
        return _positions[auctionId];
    }

    // ------------------------------------------------------------------ internals

    function _seedable(uint256 auctionId) private view returns (Position storage pos) {
        pos = _positions[auctionId];
        if (!pos.accepted) revert NotAccepted();
        if (pos.seeded || pos.unwound) revert AlreadySeeded();
    }

    /// @dev The shared body of `seed` and `seedInto`: a fresh vault takes the funds and posts an
    ///      ask at the clearing price and a bid one tick below in `market`.
    function _seed(uint256 auctionId, Position storage pos, KuruParams memory k, address market) private {
        Orders memory orders = _orders(pos, k);
        SeedVault vault = new SeedVault(margin);
        _push(pos.saleToken, address(vault), pos.saleAmount);
        _push(pos.quoteToken, address(vault), pos.quoteAmount);
        (pos.askId, pos.bidId) = vault.post(
            IKuruOrderBook(market),
            pos.saleToken,
            pos.quoteToken,
            orders.askPrice,
            orders.askSize,
            orders.bidPrice,
            orders.bidSize
        );
        pos.seeded = true;
        pos.market = market;
        pos.vault = address(vault);
        emit MarketSeeded(
            auctionId, market, address(vault), orders.askPrice, orders.askSize, orders.bidPrice, orders.bidSize
        );
    }

    /// @dev Reverts unless the Router records `market` as a Kuru market for this position's pair
    ///      with exactly the declared settings.
    function _checkMarket(Position storage pos, KuruParams memory k, address market) private view {
        (bool ok, bytes memory returned) =
            address(router).staticcall(abi.encodeCall(IKuruRouter.verifiedMarket, (market)));
        if (!ok || returned.length < 11 * 32) revert NotAKuruMarket();
        VerifiedMarket memory v = abi.decode(returned, (VerifiedMarket));
        if (v.baseAsset == address(0)) revert NotAKuruMarket();
        if (v.baseAsset != pos.saleToken || v.quoteAsset != pos.quoteToken) revert MarketMismatch();
        if (
            v.pricePrecision != k.pricePrecision || v.sizePrecision != k.sizePrecision || v.tickSize != k.tickSize
                || v.minSize != k.minSize || v.maxSize != k.maxSize || v.takerFeeBps != k.takerFeeBps
                || v.makerFeeBps != k.makerFeeBps
        ) revert MarketMismatch();
    }

    function _marketKey(uint256 auctionId, Position storage pos) private view returns (bytes32) {
        return keccak256(abi.encode(pos.saleToken, pos.quoteToken, _params[auctionId]));
    }

    function _decode(bytes memory data) private pure returns (KuruParams memory k) {
        k = abi.decode(data, (KuruParams));
        if (k.sizePrecision == 0 || k.pricePrecision == 0 || k.tickSize == 0 || k.minSize == 0) revert BadParams();
        if (k.minSize > k.maxSize) revert BadParams();
        if (k.takerFeeBps > 10_000 || k.makerFeeBps > 10_000) revert BadParams();
        if (k.kuruAmmSpread < 10 || k.kuruAmmSpread > 500 || k.kuruAmmSpread % 10 != 0) revert BadParams();
    }

    /// @dev quote base units per lot → Kuru price: price · pricePrecision · 10^saleDecimals / (10^quoteDecimals · lotSize).
    function _kuruPrice(uint256 price, uint256 lotSize, uint8 saleDecimals, uint8 quoteDecimals, KuruParams memory k)
        private
        pure
        returns (uint256 kuruPrice)
    {
        uint256 numerator = price * k.pricePrecision * 10 ** saleDecimals;
        uint256 denominator = 10 ** quoteDecimals * lotSize;
        if (numerator % denominator != 0) revert OffTick();
        kuruPrice = numerator / denominator;
        if (kuruPrice > type(uint32).max) revert PriceTooHigh();
        if (kuruPrice % k.tickSize != 0) revert OffTick();
    }

    function _orders(Position storage pos, KuruParams memory k) private view returns (Orders memory orders) {
        uint8 saleDecimals = IERC20(pos.saleToken).decimals();
        uint8 quoteDecimals = IERC20(pos.quoteToken).decimals();
        uint256 ask = _kuruPrice(pos.clearingPrice, pos.lotSize, saleDecimals, quoteDecimals, k);
        orders.askPrice = uint32(ask);
        orders.bidPrice = uint32(ask - k.tickSize);
        orders.askSize = _clamp((pos.saleAmount * k.sizePrecision) / 10 ** saleDecimals, k);
        // Floor keeps size·price·10^qd/(pp·sp) ≤ quoteAmount, so the bid never needs more than was seeded.
        uint256 bidSize =
            (pos.quoteAmount * k.pricePrecision * k.sizePrecision) / (10 ** quoteDecimals * uint256(orders.bidPrice));
        // Kuru debits a bid's quote rounded up and refunds it rounded down, in units of size·price/sizePrecision.
        // A size that makes size·price a multiple of sizePrecision round-trips exactly (spikes.md).
        uint256 unit = k.sizePrecision / _gcd(orders.bidPrice, k.sizePrecision);
        orders.bidSize = _clamp((bidSize / unit) * unit, k);
    }

    function _gcd(uint256 a, uint256 b) private pure returns (uint256) {
        while (b != 0) {
            (a, b) = (b, a % b);
        }
        return a;
    }

    function _clamp(uint256 size, KuruParams memory k) private pure returns (uint96) {
        if (size < k.minSize) return 0;
        return size > k.maxSize ? k.maxSize : uint96(size);
    }

    function _marketFor(uint256 auctionId, Position storage pos, KuruParams memory k) private returns (address market) {
        bytes32 key = _marketKey(auctionId, pos);
        market = marketOf[key];
        if (market != address(0)) return market;
        // Encoded in two halves: every argument is static, so this equals abi.encode of all eleven.
        (bool ok, bytes memory returned) = address(router).call(
            abi.encodePacked(
                IKuruRouter.deployProxy.selector,
                abi.encode(uint8(0), pos.saleToken, pos.quoteToken, k.sizePrecision, k.pricePrecision, k.tickSize),
                abi.encode(k.minSize, k.maxSize, k.takerFeeBps, k.makerFeeBps, k.kuruAmmSpread)
            )
        );
        if (!ok || returned.length < 32) revert DeployFailed();
        market = abi.decode(returned, (address));
        if (market.code.length == 0) revert DeployFailed();
        marketOf[key] = market;
    }

    function _pull(address token, uint256 amount) private {
        if (amount == 0) return;
        uint256 beforeBalance = IERC20(token).balanceOf(address(this));
        _call(token, abi.encodeCall(IERC20.transferFrom, (msg.sender, address(this), amount)));
        if (IERC20(token).balanceOf(address(this)) != beforeBalance + amount) revert TransferFailed();
    }

    function _push(address token, address to, uint256 amount) private {
        if (amount == 0) return;
        _call(token, abi.encodeCall(IERC20.transfer, (to, amount)));
    }

    function _call(address token, bytes memory data) private {
        (bool ok, bytes memory returned) = token.call(data);
        if (!ok) revert TransferFailed();
        if (returned.length > 0 && !abi.decode(returned, (bool))) revert TransferFailed();
    }
}
