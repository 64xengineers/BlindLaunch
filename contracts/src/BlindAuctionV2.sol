// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "./IERC20.sol";
import {IMarketSeeder} from "./IMarketSeeder.sol";
import {KeeperRegistry} from "./KeeperRegistry.sol";
import {Secp256k1} from "./Secp256k1.sol";

/// @title BlindAuctionV2
/// @notice Sealed-bid, uniform-price token launch on Monad where bids open themselves.
///
/// A bid is `m = step << 224 | quantity << 128 | nonce`, split 2-of-3 with Shamir modulo the
/// secp256k1 order. Share i is XOR-encrypted under keccak256(r·P_i, i), where P_i is keeper i's
/// key for this auction and R = r·G is stored with the bid. After the commit deadline two keepers
/// publish their secret keys; the second publication freezes the pair. Anyone can then open each
/// bid: the contract checks the supplied shared points with ecrecover, decrypts two shares,
/// reconstructs m and checks keccak256(abi.encode(chainid, this, auctionId, bidder, m)) against
/// the commitment. Bidders never act after `commit`.
///
/// A bid whose reconstruction does not match its commitment forfeits its deposit to
/// `FORFEIT_SINK`. That is the only outcome that can depend on which keeper pair opens a bid, so
/// a bidder cannot gain an exit option from crafting inconsistent shares. Bids that match but
/// fall outside the ladder or the notional limits are refunded in full.
///
/// Quantities are lots of `lotSize` sale-token base units; prices are quote-token base units per
/// lot. Every winner pays the clearing price. At a pro-rata clearing step the shares use
/// cumulative rounding in opening order, so exactly the remaining supply is sold.
///
/// `settle` makes no external calls, so no token or seeder can block settlement. Payouts are
/// split per token so a misbehaving sale token cannot hold back a quote refund.
/// See docs/superpowers/specs/2026-10-13-blindlaunch-v2-design.md.
contract BlindAuctionV2 {
    uint32 public constant MAX_STEPS = 64;
    uint32 public constant MAX_BIDS = 65_535;
    uint64 public constant MIN_COMMIT = 60;
    uint64 public constant MAX_COMMIT = 30 days;
    uint64 public constant MIN_CANCEL_GAP = 10 minutes;
    uint64 public constant MAX_CANCEL_GAP = 30 days;
    uint256 public constant MAX_AMOUNT = type(uint128).max;
    uint256 public constant MAX_LOTS = type(uint96).max;
    address public constant FORFEIT_SINK = 0x000000000000000000000000000000000000dEaD;
    uint256 internal constant BID_LIMIT = 1 << 232;

    enum Status {
        None,
        Open,
        Settled,
        Cancelled
    }

    /// @dev `Released` means at least one reserved leg was returned, so the seed can no longer be handed
    ///      off; `seedReleasedOf` says which legs are paid.
    enum SeedState {
        None,
        Reserved,
        HandedOff,
        Released
    }

    struct CreateParams {
        address saleToken;
        address quoteToken;
        uint256 supply;
        uint256 lotSize;
        uint256 minPrice;
        uint256 stepSize;
        uint32 stepCount;
        uint256 deposit;
        uint256 maxNotional;
        uint32 maxBids;
        uint64 commitStart;
        uint64 commitDeadline;
        uint64 cancelAfter;
        uint96 seedSaleLots;
        uint16 seedQuoteBps;
        uint64 seedLockUntil;
        bytes kuruParams;
    }

    struct Auction {
        address authority;
        IERC20 saleToken;
        IERC20 quoteToken;
        uint256 supply;
        uint256 lotSize;
        uint256 supplyLots;
        uint256 minPrice;
        uint256 stepSize;
        uint32 stepCount;
        uint256 deposit;
        uint256 maxNotional;
        uint32 maxBids;
        uint64 commitStart;
        uint64 commitDeadline;
        uint64 cancelAfter;
        Status status;
        uint32 bidCount;
        uint32 openedCount;
        uint8 publishedCount;
        uint8 pairA;
        uint8 pairB;
        uint32 clearingStep;
        uint256 clearingPrice;
        uint256 aboveTotal;
        uint256 remaining;
        uint256 atDemand;
        uint256 totalSold;
        uint256 forfeitedTotal;
        bool forfeitsBurned;
        bool unsoldReclaimed;
        bool proceedsReclaimed;
        uint96 seedSaleLots;
        uint16 seedQuoteBps;
        uint64 seedLockUntil;
        SeedState seedState;
        uint256 seedSale;
        uint256 seedQuote;
    }

    struct Bid {
        address bidder;
        bool opened;
        bool counted;
        bool forfeited;
        bool refundClaimed;
        bool tokensClaimed;
        uint8 step;
        uint96 quantity;
        /// @dev Counted demand at the same step opened before this bid; drives cumulative rounding.
        uint128 prefix;
        bytes32 h;
        Secp256k1.Point ephemeral;
        uint256[3] c;
    }

    error ZeroAddress();
    error SameToken();
    error NotAContract();
    error BadSupply();
    error BadLot();
    error BadGrid();
    error BadDeposit();
    error BadBids();
    error BadSchedule();
    error BadSeed();
    error SeederNotSet();
    error SeederAlreadySet();
    error NotDeployer();
    error MissingAuction();
    error NotOpen();
    error TooEarly();
    error TooLate();
    error AuthorityBid();
    error AlreadyBid();
    error AuctionFull();
    error BadPoint();
    error BadKeeper();
    error KeysComplete();
    error AlreadyPublished();
    error BadKey();
    error NotEnoughKeys();
    error UnknownSlot();
    error AlreadyOpened();
    error BadShare();
    error LengthMismatch();
    error BidsUnopened();
    error BadStatus();
    error UnknownBidder();
    error AlreadyClaimed();
    error NotAuthority();
    error AlreadyReclaimed();
    error NothingToBurn();
    error NoSeed();
    error AllowanceLeft();
    error TransferFailed();
    error Reentrancy();
    /// @dev Raised by `KeeperRegistry.consume` inside `createAuction` and bubbled up unchanged. Declared
    ///      here so clients decode a failed creation with this contract's ABI alone.
    error NoKeeperKeys();

    event SeederSet(address seeder);
    event AuctionCreated(
        uint256 indexed auctionId,
        address indexed authority,
        address saleToken,
        address quoteToken,
        uint256 supply,
        uint64 commitStart,
        uint64 commitDeadline,
        uint64 cancelAfter
    );
    event BidCommitted(uint256 indexed auctionId, uint32 slot, address indexed bidder);
    event KeyPublished(uint256 indexed auctionId, uint8 keeper);
    event BidOpened(
        uint256 indexed auctionId,
        uint32 slot,
        address indexed bidder,
        uint8 step,
        uint96 quantity,
        bool counted,
        bool forfeited
    );
    event AuctionSettled(uint256 indexed auctionId, uint32 clearingStep, uint256 clearingPrice, uint256 totalSold);
    event AuctionCancelled(uint256 indexed auctionId);
    event RefundClaimed(uint256 indexed auctionId, address indexed bidder, address to, uint256 amount);
    event TokensClaimed(uint256 indexed auctionId, address indexed bidder, address to, uint256 amount);
    event UnsoldReclaimed(uint256 indexed auctionId, address to, uint256 amount);
    event ProceedsReclaimed(uint256 indexed auctionId, address to, uint256 amount);
    event ForfeitsBurned(uint256 indexed auctionId, uint256 amount);
    event SeedReserved(uint256 indexed auctionId, uint256 saleAmount, uint256 quoteAmount);
    event SeedHandedOff(uint256 indexed auctionId);
    event SeedReleased(uint256 indexed auctionId);
    event SeedSaleReleased(uint256 indexed auctionId, address to, uint256 amount);
    event SeedQuoteReleased(uint256 indexed auctionId, address to, uint256 amount);

    KeeperRegistry public immutable registry;
    address public immutable deployer;
    IMarketSeeder public seeder;
    uint256 public nextAuctionId = 1;
    uint256 private _locked = 1;

    mapping(uint256 => Auction) internal _auctions;
    mapping(uint256 => mapping(uint32 => Bid)) internal _bids;
    mapping(uint256 => mapping(address => uint32)) public bidderSlot;
    mapping(uint256 => Secp256k1.Point[3]) internal _keeperKeys;
    mapping(uint256 => uint256[3]) internal _publishedKeys;
    mapping(uint256 => uint256[64]) internal _qtyAtStep;
    mapping(uint256 => bytes) internal _kuruParams;
    /// @dev Reserved seed legs already returned: bit `SEED_SALE` the sale tokens, bit `SEED_QUOTE` the quote.
    mapping(uint256 => uint8) internal _seedReleased;

    uint8 internal constant SEED_SALE = 1;
    uint8 internal constant SEED_QUOTE = 2;

    modifier nonReentrant() {
        if (_locked != 1) revert Reentrancy();
        _locked = 2;
        _;
        _locked = 1;
    }

    constructor(KeeperRegistry registry_) {
        registry = registry_;
        deployer = msg.sender;
    }

    function setSeeder(IMarketSeeder seeder_) external {
        if (msg.sender != deployer) revert NotDeployer();
        if (address(seeder) != address(0) || address(seeder_) == address(0)) revert SeederAlreadySet();
        seeder = seeder_;
        emit SeederSet(address(seeder_));
    }

    // ------------------------------------------------------------------ create

    function createAuction(CreateParams calldata p) external nonReentrant returns (uint256 auctionId) {
        _validateTokens(p);
        _validateLadder(p);
        _validateSchedule(p);
        _validateSeed(p);

        auctionId = nextAuctionId++;
        Auction storage a = _auctions[auctionId];
        a.authority = msg.sender;
        a.saleToken = IERC20(p.saleToken);
        a.quoteToken = IERC20(p.quoteToken);
        a.supply = p.supply;
        a.lotSize = p.lotSize;
        a.supplyLots = p.supply / p.lotSize;
        a.minPrice = p.minPrice;
        a.stepSize = p.stepSize;
        a.stepCount = p.stepCount;
        a.deposit = p.deposit;
        a.maxNotional = p.maxNotional;
        a.maxBids = p.maxBids;
        a.commitStart = p.commitStart;
        a.commitDeadline = p.commitDeadline;
        a.cancelAfter = p.cancelAfter;
        a.seedSaleLots = p.seedSaleLots;
        a.seedQuoteBps = p.seedQuoteBps;
        a.seedLockUntil = p.seedLockUntil;
        a.status = Status.Open;
        if (p.kuruParams.length != 0) _kuruParams[auctionId] = p.kuruParams;

        for (uint8 i = 0; i < 3; ++i) {
            _keeperKeys[auctionId][i] = registry.consume(i, auctionId);
        }

        _pull(a.saleToken, msg.sender, p.supply);
        emit AuctionCreated(
            auctionId, msg.sender, p.saleToken, p.quoteToken, p.supply, p.commitStart, p.commitDeadline, p.cancelAfter
        );
    }

    function _validateTokens(CreateParams calldata p) private view {
        if (p.saleToken == address(0) || p.quoteToken == address(0)) revert ZeroAddress();
        if (p.saleToken == p.quoteToken) revert SameToken();
        if (p.saleToken.code.length == 0 || p.quoteToken.code.length == 0) revert NotAContract();
    }

    function _validateLadder(CreateParams calldata p) private pure {
        if (p.supply == 0) revert BadSupply();
        if (p.lotSize == 0 || p.supply % p.lotSize != 0 || p.supply / p.lotSize > MAX_LOTS) revert BadLot();
        if (p.stepCount == 0 || p.stepCount > MAX_STEPS || p.minPrice == 0) revert BadGrid();
        if (p.minPrice > MAX_AMOUNT || p.stepSize > MAX_AMOUNT) revert BadGrid();
        if (p.stepCount > 1 && p.stepSize == 0) revert BadGrid();
        if (p.minPrice + uint256(p.stepCount - 1) * p.stepSize > MAX_AMOUNT) revert BadGrid();
        if (p.deposit == 0 || p.deposit > MAX_AMOUNT || p.maxNotional == 0 || p.maxNotional > MAX_AMOUNT) {
            revert BadDeposit();
        }
        if (p.deposit < p.minPrice || p.maxNotional < p.minPrice) revert BadDeposit();
        if (p.maxBids == 0 || p.maxBids > MAX_BIDS) revert BadBids();
    }

    function _validateSchedule(CreateParams calldata p) private view {
        if (p.commitStart < block.timestamp) revert BadSchedule();
        if (p.commitDeadline < p.commitStart + MIN_COMMIT || p.commitDeadline > p.commitStart + MAX_COMMIT) {
            revert BadSchedule();
        }
        if (p.cancelAfter < p.commitDeadline + MIN_CANCEL_GAP || p.cancelAfter > p.commitDeadline + MAX_CANCEL_GAP) {
            revert BadSchedule();
        }
    }

    function _validateSeed(CreateParams calldata p) private view {
        if (p.seedSaleLots == 0 && p.seedQuoteBps == 0) {
            if (p.kuruParams.length != 0 || p.seedLockUntil != 0) revert BadSeed();
            return;
        }
        if (address(seeder) == address(0)) revert SeederNotSet();
        if (p.seedSaleLots > p.supply / p.lotSize || p.seedQuoteBps > 10_000 || p.seedLockUntil < p.cancelAfter) {
            revert BadSeed();
        }
        seeder.validate(
            IMarketSeeder.SeedConfig({
                saleToken: p.saleToken,
                quoteToken: p.quoteToken,
                lotSize: p.lotSize,
                minPrice: p.minPrice,
                stepSize: p.stepSize,
                stepCount: p.stepCount,
                kuruParams: p.kuruParams
            })
        );
    }

    // ------------------------------------------------------------------ commit

    function commit(uint256 auctionId, Secp256k1.Point calldata ephemeral, uint256[3] calldata c, bytes32 h)
        external
        nonReentrant
    {
        Auction storage a = _requireAuction(auctionId);
        if (a.status != Status.Open) revert NotOpen();
        if (block.timestamp < a.commitStart) revert TooEarly();
        if (block.timestamp >= a.commitDeadline) revert TooLate();
        if (msg.sender == a.authority) revert AuthorityBid();
        if (bidderSlot[auctionId][msg.sender] != 0) revert AlreadyBid();
        if (a.bidCount >= a.maxBids) revert AuctionFull();
        if (!Secp256k1.isValid(ephemeral)) revert BadPoint();

        uint32 slot = a.bidCount;
        a.bidCount = slot + 1;
        bidderSlot[auctionId][msg.sender] = slot + 1;
        Bid storage b = _bids[auctionId][slot];
        b.bidder = msg.sender;
        b.h = h;
        b.ephemeral = ephemeral;
        b.c = c;

        _pull(a.quoteToken, msg.sender, a.deposit);
        emit BidCommitted(auctionId, slot, msg.sender);
    }

    // ------------------------------------------------------------------ keys

    function publishKey(uint256 auctionId, uint8 keeper, uint256 secretKey) external nonReentrant {
        Auction storage a = _requireAuction(auctionId);
        if (a.status != Status.Open) revert NotOpen();
        if (block.timestamp < a.commitDeadline) revert TooEarly();
        if (block.timestamp >= a.cancelAfter) revert TooLate();
        if (keeper > 2) revert BadKeeper();
        if (a.publishedCount >= 2) revert KeysComplete();
        if (_publishedKeys[auctionId][keeper] != 0) revert AlreadyPublished();
        if (!Secp256k1.mulEquals(Secp256k1.generator(), secretKey, _keeperKeys[auctionId][keeper])) revert BadKey();

        _publishedKeys[auctionId][keeper] = secretKey;
        if (a.publishedCount == 0) {
            a.pairA = keeper;
        } else if (keeper < a.pairA) {
            a.pairB = a.pairA;
            a.pairA = keeper;
        } else {
            a.pairB = keeper;
        }
        a.publishedCount += 1;
        emit KeyPublished(auctionId, keeper);
    }

    // ------------------------------------------------------------------ open

    function open(uint256 auctionId, uint32 slot, Secp256k1.Point calldata sharedA, Secp256k1.Point calldata sharedB)
        external
        nonReentrant
    {
        Auction storage a = _openable(auctionId);
        if (slot >= a.bidCount) revert UnknownSlot();
        if (_bids[auctionId][slot].opened) revert AlreadyOpened();
        _open(auctionId, a, slot, sharedA, sharedB);
    }

    /// @notice Opens many bids; slots already opened (for example by a racing keeper) are skipped.
    function openMany(
        uint256 auctionId,
        uint32[] calldata slots,
        Secp256k1.Point[] calldata sharedA,
        Secp256k1.Point[] calldata sharedB
    ) external nonReentrant {
        if (slots.length != sharedA.length || slots.length != sharedB.length) revert LengthMismatch();
        Auction storage a = _openable(auctionId);
        for (uint256 i = 0; i < slots.length; ++i) {
            uint32 slot = slots[i];
            if (slot >= a.bidCount) revert UnknownSlot();
            if (_bids[auctionId][slot].opened) continue;
            _open(auctionId, a, slot, sharedA[i], sharedB[i]);
        }
    }

    function _openable(uint256 auctionId) private view returns (Auction storage a) {
        a = _requireAuction(auctionId);
        if (a.status != Status.Open) revert NotOpen();
        if (a.publishedCount < 2) revert NotEnoughKeys();
    }

    function _open(
        uint256 auctionId,
        Auction storage a,
        uint32 slot,
        Secp256k1.Point calldata sharedA,
        Secp256k1.Point calldata sharedB
    ) private {
        Bid storage b = _bids[auctionId][slot];
        uint256 m = _decrypt(auctionId, a, b, sharedA, sharedB);
        b.opened = true;
        a.openedCount += 1;

        if (_commitment(auctionId, b.bidder, m) != b.h) {
            b.forfeited = true;
            a.forfeitedTotal += a.deposit;
            emit BidOpened(auctionId, slot, b.bidder, 0, 0, false, true);
            return;
        }

        (bool counted, uint8 step, uint96 quantity) = _parse(a, m);
        if (counted) {
            uint256[64] storage demand = _qtyAtStep[auctionId];
            b.counted = true;
            b.step = step;
            b.quantity = quantity;
            b.prefix = uint128(demand[step]);
            demand[step] += quantity;
        }
        emit BidOpened(auctionId, slot, b.bidder, step, quantity, counted, false);
    }

    function _decrypt(
        uint256 auctionId,
        Auction storage a,
        Bid storage b,
        Secp256k1.Point calldata sharedA,
        Secp256k1.Point calldata sharedB
    ) private view returns (uint256) {
        uint8 pa = a.pairA;
        uint8 pb = a.pairB;
        Secp256k1.Point memory ephemeral = b.ephemeral;
        if (!Secp256k1.mulEquals(ephemeral, _publishedKeys[auctionId][pa], sharedA)) revert BadShare();
        if (!Secp256k1.mulEquals(ephemeral, _publishedKeys[auctionId][pb], sharedB)) revert BadShare();
        uint256 ya = b.c[pa] ^ Secp256k1.shareKey(sharedA, pa);
        uint256 yb = b.c[pb] ^ Secp256k1.shareKey(sharedB, pb);
        return Secp256k1.reconstruct(pa, pb, ya, yb);
    }

    /// @dev Called only after the commitment matched. Never reverts: an unusable bid is refunded.
    function _parse(Auction storage a, uint256 m) private view returns (bool counted, uint8 step, uint96 quantity) {
        if (m >= BID_LIMIT) return (false, 0, 0);
        step = uint8(m >> 224);
        quantity = uint96(m >> 128);
        if (step >= a.stepCount || quantity == 0) return (false, step, quantity);
        uint256 notional = _price(a, step) * quantity;
        counted = notional <= a.deposit && notional <= a.maxNotional;
    }

    // ------------------------------------------------------------------ settle

    /// @notice Computes the clearing price and reserves the seed. Reads storage only: no token,
    ///         seeder or other external call can make it revert.
    function settle(uint256 auctionId) external nonReentrant {
        Auction storage a = _requireAuction(auctionId);
        if (a.status != Status.Open) revert NotOpen();
        if (a.publishedCount < 2) revert NotEnoughKeys();
        if (a.openedCount != a.bidCount) revert BidsUnopened();

        uint256[64] storage demand = _qtyAtStep[auctionId];
        uint256 supplyLots = a.supplyLots;
        uint256 above;
        uint32 clearing;
        bool found;
        for (uint32 step = a.stepCount; step > 0;) {
            unchecked {
                --step;
            }
            uint256 atStep = demand[step];
            if (above + atStep >= supplyLots) {
                clearing = step;
                found = true;
                break;
            }
            above += atStep;
        }

        uint256 atDemand;
        if (found) {
            atDemand = demand[clearing];
        } else {
            atDemand = demand[0];
            above -= atDemand;
        }

        uint256 remaining = supplyLots - above;
        a.status = Status.Settled;
        a.clearingStep = clearing;
        a.clearingPrice = above + atDemand == 0 ? 0 : _price(a, clearing);
        a.aboveTotal = above;
        a.remaining = remaining;
        a.atDemand = atDemand;
        a.totalSold = above + (atDemand < remaining ? atDemand : remaining);
        emit AuctionSettled(auctionId, clearing, a.clearingPrice, a.totalSold);
        _reserveSeed(auctionId, a);
    }

    function cancel(uint256 auctionId) external nonReentrant {
        Auction storage a = _requireAuction(auctionId);
        if (a.status != Status.Open) revert NotOpen();
        if (block.timestamp < a.cancelAfter) revert TooEarly();
        if (a.publishedCount >= 2) revert KeysComplete();
        a.status = Status.Cancelled;
        emit AuctionCancelled(auctionId);
    }

    /// @notice Sends every forfeited deposit to `FORFEIT_SINK`. Anyone may call it.
    function burnForfeits(uint256 auctionId) external nonReentrant {
        Auction storage a = _requireAuction(auctionId);
        if (a.status != Status.Settled || a.forfeitedTotal == 0 || a.forfeitsBurned) revert NothingToBurn();
        a.forfeitsBurned = true;
        _push(a.quoteToken, FORFEIT_SINK, a.forfeitedTotal);
        emit ForfeitsBurned(auctionId, a.forfeitedTotal);
    }

    // ------------------------------------------------------------------ seed

    function _reserveSeed(uint256 auctionId, Auction storage a) private {
        if (a.totalSold == 0) return;
        uint256 unsoldLots = a.supplyLots - a.totalSold;
        uint256 saleAmount = (a.seedSaleLots < unsoldLots ? a.seedSaleLots : unsoldLots) * a.lotSize;
        uint256 quoteAmount = (a.clearingPrice * a.totalSold * a.seedQuoteBps) / 10_000;
        if (saleAmount == 0 && quoteAmount == 0) return;
        a.seedState = SeedState.Reserved;
        a.seedSale = saleAmount;
        a.seedQuote = quoteAmount;
        emit SeedReserved(auctionId, saleAmount, quoteAmount);
    }

    /// @notice Hands the reserved seed to the seeder. Anyone may call it; a failure reverts and can be
    ///         retried, or the seed released after the lock. Opening the market is a separate call to
    ///         `seeder.seed`: a try/catch here would let a gas estimate pick a limit at which the market
    ///         silently fails to open.
    function handOffSeed(uint256 auctionId) external nonReentrant {
        Auction storage a = _requireAuction(auctionId);
        if (a.seedState != SeedState.Reserved) revert NoSeed();
        a.seedState = SeedState.HandedOff;

        IMarketSeeder target = seeder;
        IERC20 saleToken = a.saleToken;
        IERC20 quoteToken = a.quoteToken;
        uint256 saleBefore = saleToken.balanceOf(address(this));
        uint256 quoteBefore = quoteToken.balanceOf(address(this));
        _call(address(saleToken), abi.encodeCall(IERC20.approve, (address(target), a.seedSale)));
        _call(address(quoteToken), abi.encodeCall(IERC20.approve, (address(target), a.seedQuote)));
        target.accept(_seedOrder(auctionId, a));

        if (
            saleBefore - saleToken.balanceOf(address(this)) != a.seedSale
                || quoteBefore - quoteToken.balanceOf(address(this)) != a.seedQuote
        ) revert TransferFailed();
        if (
            saleToken.allowance(address(this), address(target)) != 0
                || quoteToken.allowance(address(this), address(target)) != 0
        ) revert AllowanceLeft();
        emit SeedHandedOff(auctionId);
    }

    /// @notice Once the lock has passed, returns a seed that was never handed off: whichever reserved legs
    ///         are still unpaid go to the authority. Anyone may call it.
    function releaseSeed(uint256 auctionId) external nonReentrant {
        Auction storage a = _requireAuction(auctionId);
        uint8 legs = _seedReleased[auctionId];
        if (legs == (SEED_SALE | SEED_QUOTE)) revert NoSeed();
        _startRelease(auctionId, a);
        _seedReleased[auctionId] = SEED_SALE | SEED_QUOTE;
        if ((legs & SEED_SALE) == 0) _pushSeed(auctionId, a, true, a.authority);
        if ((legs & SEED_QUOTE) == 0) _pushSeed(auctionId, a, false, a.authority);
    }

    /// @notice Returns only the reserved sale tokens, to `to`, so a blocked quote token cannot hold them back.
    function releaseSeedSale(uint256 auctionId, address to) external nonReentrant {
        _releaseLeg(auctionId, SEED_SALE, to);
    }

    /// @notice Returns only the reserved quote tokens, to `to`, so a blocked sale token or an authority the
    ///         quote token blocks cannot hold them back.
    function releaseSeedQuote(uint256 auctionId, address to) external nonReentrant {
        _releaseLeg(auctionId, SEED_QUOTE, to);
    }

    function _releaseLeg(uint256 auctionId, uint8 leg, address to) private {
        Auction storage a = _authorityOf(auctionId);
        if ((_seedReleased[auctionId] & leg) != 0) revert AlreadyReclaimed();
        _startRelease(auctionId, a);
        _seedReleased[auctionId] |= leg;
        _pushSeed(auctionId, a, leg == SEED_SALE, to);
    }

    /// @dev A seed is releasable after the lock while it is Reserved, or Released with a leg still unpaid.
    ///      The first release moves it to Released, which rules out a later hand-off.
    function _startRelease(uint256 auctionId, Auction storage a) private {
        SeedState state = a.seedState;
        if (state != SeedState.Reserved && state != SeedState.Released) revert NoSeed();
        if (block.timestamp < a.seedLockUntil) revert TooEarly();
        if (state == SeedState.Reserved) {
            a.seedState = SeedState.Released;
            emit SeedReleased(auctionId);
        }
    }

    function _pushSeed(uint256 auctionId, Auction storage a, bool saleLeg, address to) private {
        if (to == address(0)) revert ZeroAddress();
        if (saleLeg) {
            _push(a.saleToken, to, a.seedSale);
            emit SeedSaleReleased(auctionId, to, a.seedSale);
        } else {
            _push(a.quoteToken, to, a.seedQuote);
            emit SeedQuoteReleased(auctionId, to, a.seedQuote);
        }
    }

    function _seedOrder(uint256 auctionId, Auction storage a) private view returns (IMarketSeeder.SeedOrder memory) {
        return IMarketSeeder.SeedOrder({
            auctionId: auctionId,
            authority: a.authority,
            saleToken: address(a.saleToken),
            quoteToken: address(a.quoteToken),
            saleAmount: a.seedSale,
            quoteAmount: a.seedQuote,
            clearingPrice: a.clearingPrice,
            lotSize: a.lotSize,
            lockUntil: a.seedLockUntil,
            kuruParams: _kuruParams[auctionId]
        });
    }

    // ------------------------------------------------------------------ claims

    /// @notice Pays whichever of the caller's refund and tokens are still unclaimed.
    function claim(uint256 auctionId) external nonReentrant {
        Auction storage a = _requireAuction(auctionId);
        Bid storage b = _bidderBid(auctionId, msg.sender);
        if (b.refundClaimed && b.tokensClaimed) revert AlreadyClaimed();
        if (!b.refundClaimed) _claimRefund(auctionId, a, b, msg.sender);
        if (!b.tokensClaimed) _claimTokens(auctionId, a, b, msg.sender);
    }

    /// @notice Pays only the quote refund, so a blocked sale token cannot hold it back.
    function claimRefund(uint256 auctionId, address to) external nonReentrant {
        Auction storage a = _requireAuction(auctionId);
        Bid storage b = _bidderBid(auctionId, msg.sender);
        if (b.refundClaimed) revert AlreadyClaimed();
        _claimRefund(auctionId, a, b, to);
    }

    function claimTokens(uint256 auctionId, address to) external nonReentrant {
        Auction storage a = _requireAuction(auctionId);
        Bid storage b = _bidderBid(auctionId, msg.sender);
        if (b.tokensClaimed) revert AlreadyClaimed();
        _claimTokens(auctionId, a, b, to);
    }

    function reclaim(uint256 auctionId) external nonReentrant {
        Auction storage a = _authorityOf(auctionId);
        if (a.unsoldReclaimed && a.proceedsReclaimed) revert AlreadyReclaimed();
        if (!a.unsoldReclaimed) _reclaimUnsold(auctionId, a, msg.sender);
        if (!a.proceedsReclaimed) _reclaimProceeds(auctionId, a, msg.sender);
    }

    function reclaimUnsold(uint256 auctionId, address to) external nonReentrant {
        Auction storage a = _authorityOf(auctionId);
        if (a.unsoldReclaimed) revert AlreadyReclaimed();
        _reclaimUnsold(auctionId, a, to);
    }

    function reclaimProceeds(uint256 auctionId, address to) external nonReentrant {
        Auction storage a = _authorityOf(auctionId);
        if (a.proceedsReclaimed) revert AlreadyReclaimed();
        _reclaimProceeds(auctionId, a, to);
    }

    function _claimRefund(uint256 auctionId, Auction storage a, Bid storage b, address to) private {
        if (to == address(0)) revert ZeroAddress();
        uint256 amount = _refundOf(a, b);
        b.refundClaimed = true;
        _push(a.quoteToken, to, amount);
        emit RefundClaimed(auctionId, b.bidder, to, amount);
    }

    function _claimTokens(uint256 auctionId, Auction storage a, Bid storage b, address to) private {
        if (to == address(0)) revert ZeroAddress();
        uint256 amount = _tokensOf(a, b);
        b.tokensClaimed = true;
        _push(a.saleToken, to, amount);
        emit TokensClaimed(auctionId, b.bidder, to, amount);
    }

    function _reclaimUnsold(uint256 auctionId, Auction storage a, address to) private {
        if (to == address(0)) revert ZeroAddress();
        uint256 amount;
        if (a.status == Status.Cancelled) {
            amount = a.supply;
        } else if (a.status == Status.Settled) {
            amount = (a.supplyLots - a.totalSold) * a.lotSize - a.seedSale;
        } else {
            revert BadStatus();
        }
        a.unsoldReclaimed = true;
        _push(a.saleToken, to, amount);
        emit UnsoldReclaimed(auctionId, to, amount);
    }

    function _reclaimProceeds(uint256 auctionId, Auction storage a, address to) private {
        if (to == address(0)) revert ZeroAddress();
        uint256 amount;
        if (a.status == Status.Settled) {
            amount = a.clearingPrice * a.totalSold - a.seedQuote;
        } else if (a.status != Status.Cancelled) {
            revert BadStatus();
        }
        a.proceedsReclaimed = true;
        _push(a.quoteToken, to, amount);
        emit ProceedsReclaimed(auctionId, to, amount);
    }

    // ------------------------------------------------------------------ views

    function getAuction(uint256 auctionId) external view returns (Auction memory) {
        return _auctions[auctionId];
    }

    function getBid(uint256 auctionId, uint32 slot) external view returns (Bid memory) {
        return _bids[auctionId][slot];
    }

    function keeperKeysOf(uint256 auctionId) external view returns (Secp256k1.Point[3] memory) {
        return _keeperKeys[auctionId];
    }

    function publishedKeysOf(uint256 auctionId) external view returns (uint256[3] memory) {
        return _publishedKeys[auctionId];
    }

    function qtyAtStepOf(uint256 auctionId) external view returns (uint256[64] memory) {
        return _qtyAtStep[auctionId];
    }

    function kuruParamsOf(uint256 auctionId) external view returns (bytes memory) {
        return _kuruParams[auctionId];
    }

    /// @notice Which reserved seed legs `releaseSeed`, `releaseSeedSale` and `releaseSeedQuote` have paid.
    function seedReleasedOf(uint256 auctionId) external view returns (bool sale, bool quote) {
        uint8 legs = _seedReleased[auctionId];
        return ((legs & SEED_SALE) != 0, (legs & SEED_QUOTE) != 0);
    }

    /// @notice The commitment `h` a bidder must submit for bid `m`.
    function hashBid(uint256 auctionId, address bidder, uint256 m) external view returns (bytes32) {
        return _commitment(auctionId, bidder, m);
    }

    function quotePrice(uint256 auctionId, uint32 step) external view returns (uint256) {
        Auction storage a = _requireAuction(auctionId);
        if (step >= a.stepCount) revert BadGrid();
        return _price(a, step);
    }

    function canSettle(uint256 auctionId) external view returns (bool) {
        Auction storage a = _auctions[auctionId];
        return a.status == Status.Open && a.publishedCount >= 2 && a.openedCount == a.bidCount;
    }

    function canCancel(uint256 auctionId) external view returns (bool) {
        Auction storage a = _auctions[auctionId];
        return a.status == Status.Open && block.timestamp >= a.cancelAfter && a.publishedCount < 2;
    }

    function allocationOf(uint256 auctionId, address bidder) external view returns (uint256) {
        Auction storage a = _requireAuction(auctionId);
        if (a.status != Status.Settled) return 0;
        return _allocation(a, _bidderBid(auctionId, bidder));
    }

    /// @notice What the bidder can still claim: sale tokens and quote refund. Claimed legs read 0.
    function claimable(uint256 auctionId, address bidder) external view returns (uint256 saleOut, uint256 quoteOut) {
        Auction storage a = _requireAuction(auctionId);
        Bid storage b = _bidderBid(auctionId, bidder);
        if (!b.tokensClaimed) saleOut = _tokensOf(a, b);
        if (!b.refundClaimed) quoteOut = _refundOf(a, b);
    }

    // ------------------------------------------------------------------ internals

    function _commitment(uint256 auctionId, address bidder, uint256 m) private view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), auctionId, bidder, m));
    }

    function _requireAuction(uint256 auctionId) private view returns (Auction storage a) {
        a = _auctions[auctionId];
        if (a.status == Status.None) revert MissingAuction();
    }

    function _authorityOf(uint256 auctionId) private view returns (Auction storage a) {
        a = _requireAuction(auctionId);
        if (msg.sender != a.authority) revert NotAuthority();
    }

    function _bidderBid(uint256 auctionId, address bidder) private view returns (Bid storage) {
        uint32 slotPlusOne = bidderSlot[auctionId][bidder];
        if (slotPlusOne == 0) revert UnknownBidder();
        return _bids[auctionId][slotPlusOne - 1];
    }

    function _price(Auction storage a, uint256 step) private view returns (uint256) {
        return a.minPrice + step * a.stepSize;
    }

    /// @dev At a pro-rata step: floor(rem·(prefix+q)/D) − floor(rem·prefix/D). The shares of all
    ///      bids at the step telescope to exactly `remaining`, and each is at most q because rem < D.
    function _allocation(Auction storage a, Bid storage b) private view returns (uint256) {
        if (!b.counted || b.step < a.clearingStep) return 0;
        if (b.step > a.clearingStep || a.atDemand <= a.remaining) return b.quantity;
        uint256 prefix = b.prefix;
        return (a.remaining * (prefix + b.quantity)) / a.atDemand - (a.remaining * prefix) / a.atDemand;
    }

    function _refundOf(Auction storage a, Bid storage b) private view returns (uint256) {
        if (a.status == Status.Cancelled) return a.deposit;
        if (a.status != Status.Settled) revert BadStatus();
        if (b.forfeited) return 0;
        return a.deposit - a.clearingPrice * _allocation(a, b);
    }

    function _tokensOf(Auction storage a, Bid storage b) private view returns (uint256) {
        if (a.status == Status.Cancelled) return 0;
        if (a.status != Status.Settled) revert BadStatus();
        return _allocation(a, b) * a.lotSize;
    }

    function _pull(IERC20 token, address from, uint256 amount) private {
        uint256 beforeBalance = token.balanceOf(address(this));
        _call(address(token), abi.encodeCall(IERC20.transferFrom, (from, address(this), amount)));
        if (token.balanceOf(address(this)) != beforeBalance + amount) revert TransferFailed();
    }

    function _push(IERC20 token, address to, uint256 amount) private {
        if (amount == 0) return;
        uint256 beforeBalance = token.balanceOf(address(this));
        _call(address(token), abi.encodeCall(IERC20.transfer, (to, amount)));
        if (token.balanceOf(address(this)) != beforeBalance - amount) revert TransferFailed();
    }

    function _call(address token, bytes memory data) private {
        (bool ok, bytes memory returned) = token.call(data);
        if (!ok) revert TransferFailed();
        if (returned.length > 0 && !abi.decode(returned, (bool))) revert TransferFailed();
    }
}
