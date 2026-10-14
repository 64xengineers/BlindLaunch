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

    bool public cancelled;

    /// @notice Deposits everything the vault holds and posts the orders. A zero size skips that side.
    ///         The orders are not post-only: an existing order that crosses one fills first, at its own
    ///         price, which is at or above the ask or at or below the bid, so never worse for the
    ///         creator; whatever is left rests. Kuru reverts a post-only order that would cross, which
    ///         would make seeding a market with crossing liquidity impossible.
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
        if (askSize != 0) askId = _place(book, false, askPrice, askSize);
        if (bidSize != 0) bidId = _place(book, true, bidPrice, bidSize);
    }

    /// @notice Cancels whatever is still resting (the first time), then withdraws the vault's whole
    ///         balance of `token` and sends it to `to`. One token per call, so a token that cannot be
    ///         moved holds back only itself.
    function unwind(IKuruOrderBook book, address token, uint40 askId, uint40 bidId, address to)
        external
        onlySeeder
        returns (uint256 out)
    {
        if (!cancelled) {
            cancelled = true;
            _cancelIfLive(book, askId);
            _cancelIfLive(book, bidId);
        }
        out = _withdrawAll(token, to);
    }

    /// @dev Kuru gives an order an id only when part of it rests: a fully filled order gets none, and
    ///      filling someone's flip order can create an order of theirs. So the id is kept only when the
    ///      newest order is new, this vault's, on this side and still open.
    function _place(IKuruOrderBook book, bool isBuy, uint32 price, uint96 size) private returns (uint40 id) {
        uint40 before = book.s_orderIdCounter();
        if (isBuy) book.addBuyOrder(price, size, false);
        else book.addSellOrder(price, size, false);
        id = book.s_orderIdCounter();
        if (id == before) return 0;
        (address owner, uint96 left,,,,,, bool buy) = book.s_orders(id);
        if (owner != address(this) || left == 0 || buy != isBuy) return 0;
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
/// The position is then seeded (anyone, retryable, except that only the creator may pick a market
/// with other settings, below) by one of two paths, which differ only in where the market comes from:
///
/// - `seed` creates the Kuru market itself, once per (pair, params), through the Router's
///   `deployProxy`. That works where market creation is open (Monad testnet, local mocks).
///   Where it is not, it reverts `DeployFailed` and nothing moves.
/// - `seedInto` uses a market that already exists. On Monad mainnet only the Kuru Router's owner
///   may create markets (anyone else gets `Unauthorized()`), while trading in a market is open
///   to all, so the market is created by Kuru, with settings Kuru chooses, and handed in here.
///   The Router's `verifiedMarket(market)` must show a genuine Kuru market (else `NotAKuruMarket`)
///   for exactly this sale token and quote token (else `MarketMismatch`). The orders are priced
///   and sized with the market's own precisions, tick and size limits: the ask is the clearing
///   price rounded up to the market's tick (less than one tick above it) and the bid one tick
///   below that. A market whose tick leaves no positive bid, or whose ask does not fit uint32,
///   reverts `MarketMismatch`. Anyone may hand in a market whose settings exactly match the
///   declared `KuruParams` (both precisions, tick, minimum and maximum size, taker and maker fee;
///   the Router does not report the AMM spread). A market whose settings differ may be used only
///   by the position's authority, the launch creator, since it is their tokens and money that go
///   into it; anyone else gets `OnlyCreatorForOtherMarket`. Where anyone can create Kuru markets
///   (testnet), this stops a stranger from routing the seed into a hostile market for the pair,
///   such as one with a very coarse tick, high fees or a tiny maximum size.
///
/// Both paths then move the funds into a fresh `SeedVault` and post an ask at the clearing price
/// and a bid one tick below. Seeding (and the hand-off) is only possible before `lockUntil`, so a
/// stale price is never listed late. After `lockUntil`, `unwind` (anyone) cancels what is left and
/// pays everything, including fill proceeds, to the auction's authority; `unwindSale` and
/// `unwindQuote` do one token each, so a token that cannot move does not hold back the other. A
/// position that was never seeded is returned the same way, so seed funds cannot get stuck.
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
    error SeedExpired();
    error OnlyCreatorForOtherMarket();

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
    uint8 internal constant SALE_LEG = 1;
    uint8 internal constant QUOTE_LEG = 2;

    address public immutable auction;
    IKuruRouter public immutable router;
    IKuruMarginAccount public immutable margin;

    mapping(uint256 => Position) internal _positions;
    mapping(uint256 => bytes) internal _params;
    /// @notice The market used for each (pair, params), keyed by keccak256(abi.encode(sale, quote, kuruParams)):
    ///         created by `seed`, or the first one handed to `seedInto`.
    mapping(bytes32 => address) public marketOf;
    /// @notice Which tokens `unwind`, `unwindSale` and `unwindQuote` have paid out: 1 sale, 2 quote, 3 both.
    mapping(uint256 => uint8) public unwoundLegs;
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
        if (block.timestamp >= order.lockUntil) revert SeedExpired();
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
        address market = _marketFor(auctionId, pos, k);
        _seed(auctionId, pos, _orders(pos, k, false), market);
    }

    /// @notice Seeds into an existing Kuru market, such as one Kuru created on Monad mainnet. The
    ///         Router must vouch for `market` as a genuine market for this sale token and quote
    ///         token; the orders use the market's own settings. Anyone may call it with a market
    ///         whose settings exactly match the declared ones (precisions, tick, size limits and
    ///         fees), and only such a market is recorded in `marketOf` for `seed` to reuse. A market
    ///         whose settings differ may be used only by the position's authority (the launch
    ///         creator, whose tokens and money go into it); anyone else gets `OnlyCreatorForOtherMarket`.
    function seedInto(uint256 auctionId, address market) external nonReentrant {
        Position storage pos = _seedable(auctionId);
        KuruParams memory declared = _decode(_params[auctionId]);
        (KuruParams memory k, bool exact) = _marketParams(pos, declared, market);
        if (exact) {
            bytes32 key = _marketKey(auctionId, pos);
            if (marketOf[key] == address(0)) marketOf[key] = market;
        } else if (msg.sender != pos.authority) {
            revert OnlyCreatorForOtherMarket();
        }
        _seed(auctionId, pos, _orders(pos, k, true), market);
    }

    // ------------------------------------------------------------------ unwind

    /// @notice After the lock, pays whatever of the position is still unpaid to the authority:
    ///         unsold seed tokens, the quote left in the bid and all fill proceeds. Anyone may call it.
    function unwind(uint256 auctionId) external nonReentrant {
        Position storage pos = _unwindable(auctionId);
        uint8 legs = unwoundLegs[auctionId];
        uint256 saleOut;
        uint256 quoteOut;
        if ((legs & SALE_LEG) == 0) saleOut = _unwindLeg(auctionId, pos, SALE_LEG);
        if ((legs & QUOTE_LEG) == 0) quoteOut = _unwindLeg(auctionId, pos, QUOTE_LEG);
        emit SeedUnwound(auctionId, pos.authority, saleOut, quoteOut);
    }

    /// @notice `unwind` for the sale token only, so a quote token that cannot move does not hold it back.
    function unwindSale(uint256 auctionId) external nonReentrant {
        Position storage pos = _unwindable(auctionId);
        if ((unwoundLegs[auctionId] & SALE_LEG) != 0) revert AlreadyUnwound();
        emit SeedUnwound(auctionId, pos.authority, _unwindLeg(auctionId, pos, SALE_LEG), 0);
    }

    /// @notice `unwind` for the quote token only, so a paused or blocking sale token does not hold
    ///         back the seeded quote and the fill proceeds.
    function unwindQuote(uint256 auctionId) external nonReentrant {
        Position storage pos = _unwindable(auctionId);
        if ((unwoundLegs[auctionId] & QUOTE_LEG) != 0) revert AlreadyUnwound();
        emit SeedUnwound(auctionId, pos.authority, 0, _unwindLeg(auctionId, pos, QUOTE_LEG));
    }

    // ------------------------------------------------------------------ views

    function positionOf(uint256 auctionId) external view returns (Position memory) {
        return _positions[auctionId];
    }

    // ------------------------------------------------------------------ internals

    /// @dev Seeding is open from the hand-off until the lock; after it only `unwind` remains.
    function _seedable(uint256 auctionId) private view returns (Position storage pos) {
        pos = _positions[auctionId];
        if (!pos.accepted) revert NotAccepted();
        if (pos.seeded || pos.unwound || unwoundLegs[auctionId] != 0) revert AlreadySeeded();
        if (block.timestamp >= pos.lockUntil) revert SeedExpired();
    }

    function _unwindable(uint256 auctionId) private view returns (Position storage pos) {
        pos = _positions[auctionId];
        if (!pos.accepted) revert NotAccepted();
        if (pos.unwound) revert AlreadyUnwound();
        if (block.timestamp < pos.lockUntil) revert Locked();
    }

    /// @dev Pays one token of the position to the authority and marks that leg paid; `unwound` is
    ///      set once both are.
    function _unwindLeg(uint256 auctionId, Position storage pos, uint8 leg) private returns (uint256 out) {
        uint8 legs = unwoundLegs[auctionId] | leg;
        unwoundLegs[auctionId] = legs;
        if (legs == (SALE_LEG | QUOTE_LEG)) pos.unwound = true;
        address token = leg == SALE_LEG ? pos.saleToken : pos.quoteToken;
        if (pos.seeded) {
            out = SeedVault(pos.vault).unwind(IKuruOrderBook(pos.market), token, pos.askId, pos.bidId, pos.authority);
        } else {
            out = leg == SALE_LEG ? pos.saleAmount : pos.quoteAmount;
            _push(token, pos.authority, out);
        }
    }

    /// @dev The shared body of `seed` and `seedInto`: a fresh vault takes the funds and posts the
    ///      ask and the bid one tick below it in `market`.
    function _seed(uint256 auctionId, Position storage pos, Orders memory orders, address market) private {
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

    /// @dev Reverts unless the Router records `market` as a Kuru market for this position's pair.
    ///      Returns the market's own settings, which the orders use, and whether they are exactly
    ///      the declared ones (the Router does not report the AMM spread, so that is not compared).
    function _marketParams(Position storage pos, KuruParams memory declared, address market)
        private
        view
        returns (KuruParams memory k, bool exact)
    {
        (bool ok, bytes memory returned) =
            address(router).staticcall(abi.encodeCall(IKuruRouter.verifiedMarket, (market)));
        if (!ok || returned.length < 11 * 32) revert NotAKuruMarket();
        VerifiedMarket memory v = abi.decode(returned, (VerifiedMarket));
        if (v.baseAsset == address(0)) revert NotAKuruMarket();
        if (v.baseAsset != pos.saleToken || v.quoteAsset != pos.quoteToken) revert MarketMismatch();
        if (
            v.pricePrecision == 0 || v.pricePrecision > type(uint32).max || v.sizePrecision == 0
                || v.sizePrecision > type(uint96).max || v.tickSize == 0 || v.tickSize > type(uint32).max
                || v.minSize > type(uint96).max || v.maxSize > type(uint96).max
        ) revert MarketMismatch();
        k = KuruParams({
            sizePrecision: uint96(v.sizePrecision),
            pricePrecision: uint32(v.pricePrecision),
            tickSize: uint32(v.tickSize),
            minSize: uint96(v.minSize),
            maxSize: uint96(v.maxSize),
            takerFeeBps: v.takerFeeBps,
            makerFeeBps: v.makerFeeBps,
            kuruAmmSpread: declared.kuruAmmSpread
        });
        exact = keccak256(abi.encode(k)) == keccak256(abi.encode(declared));
    }

    function _marketKey(uint256 auctionId, Position storage pos) private view returns (bytes32) {
        return keccak256(abi.encode(pos.saleToken, pos.quoteToken, _params[auctionId]));
    }

    function _decode(bytes memory data) private pure returns (KuruParams memory k) {
        k = abi.decode(data, (KuruParams));
        // Kuru's Router rejects every one of these (test/spike/KuruSpike.t.sol, test_routerRejects...):
        // precisions that are not powers of ten, a zero tick or minimum size, a maximum size not above
        // the minimum, a maker fee above the taker fee, a taker fee of 100% or more, and an AMM spread
        // outside 10 to 490 bps in steps of 10.
        if (!_isPowerOfTen(k.sizePrecision) || !_isPowerOfTen(k.pricePrecision)) revert BadParams();
        if (k.tickSize == 0 || k.minSize == 0 || k.minSize >= k.maxSize) revert BadParams();
        if (k.makerFeeBps > k.takerFeeBps || k.takerFeeBps >= 10_000) revert BadParams();
        if (k.kuruAmmSpread < 10 || k.kuruAmmSpread >= 500 || k.kuruAmmSpread % 10 != 0) revert BadParams();
    }

    function _isPowerOfTen(uint256 x) private pure returns (bool) {
        if (x == 0) return false;
        while (x % 10 == 0) x /= 10;
        return x == 1;
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

    /// @dev quote base units per lot → the lowest on-tick Kuru price at or above it, for `seedInto`,
    ///      where the market's settings need not put the clearing price on a tick. The ask is then
    ///      less than one tick above the clearing price and the bid, one tick lower, below it.
    ///      Reverts `MarketMismatch` when that is no usable order pair: above uint32, or no room for
    ///      a positive bid.
    function _kuruPriceAtOrAbove(
        uint256 price,
        uint256 lotSize,
        uint8 saleDecimals,
        uint8 quoteDecimals,
        KuruParams memory k
    ) private pure returns (uint256 kuruPrice) {
        uint256 numerator = price * k.pricePrecision * 10 ** saleDecimals;
        uint256 denominator = 10 ** quoteDecimals * lotSize;
        uint256 ceiled = numerator == 0 ? 0 : (numerator - 1) / denominator + 1;
        kuruPrice = ceiled == 0 ? 0 : ((ceiled - 1) / k.tickSize + 1) * k.tickSize;
        if (kuruPrice > type(uint32).max || kuruPrice <= k.tickSize) revert MarketMismatch();
    }

    /// @dev `roundUp` is the `seedInto` pricing (the market's own tick); `seed` needs the exact price.
    function _orders(Position storage pos, KuruParams memory k, bool roundUp)
        private
        view
        returns (Orders memory orders)
    {
        uint8 saleDecimals = IERC20(pos.saleToken).decimals();
        uint8 quoteDecimals = IERC20(pos.quoteToken).decimals();
        uint256 ask = roundUp
            ? _kuruPriceAtOrAbove(pos.clearingPrice, pos.lotSize, saleDecimals, quoteDecimals, k)
            : _kuruPrice(pos.clearingPrice, pos.lotSize, saleDecimals, quoteDecimals, k);
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
