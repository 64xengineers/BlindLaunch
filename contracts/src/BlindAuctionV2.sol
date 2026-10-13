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
/// reconstructs m and checks keccak256(abi.encode(auctionId, bidder, m)) against the commitment.
/// Bidders never act after `commit`.
///
/// Quantities are lots of `lotSize` sale-token base units; prices are quote-token base units per
/// lot. Every winner pays the clearing price. Pro-rata dust at the clearing step stays unsold and
/// returns to the authority. See docs/superpowers/specs/2026-10-13-blindlaunch-v2-design.md.
contract BlindAuctionV2 {
    uint32 public constant MAX_STEPS = 64;
    uint32 public constant MAX_BIDS = 65_535;
    uint32 public constant TALLY_IN_SETTLE = 256;
    uint256 public constant SEED_GAS_FLOOR = 1_500_000;
    uint64 public constant MIN_COMMIT = 60;
    uint64 public constant MAX_COMMIT = 30 days;
    uint64 public constant MIN_CANCEL_GAP = 10 minutes;
    uint64 public constant MAX_CANCEL_GAP = 30 days;
    uint256 public constant MAX_AMOUNT = type(uint128).max;
    uint256 public constant MAX_LOTS = type(uint96).max;
    uint256 internal constant BID_LIMIT = 1 << 232;

    enum Status {
        None,
        Open,
        Settled,
        Cancelled
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
        bool finalized;
        bool reclaimed;
        uint32 clearingStep;
        uint256 clearingPrice;
        uint256 aboveTotal;
        uint256 remaining;
        uint256 atDemand;
        uint32 tallyCursor;
        uint256 tallySum;
        uint256 totalSold;
        uint96 seedSaleLots;
        uint16 seedQuoteBps;
        uint64 seedLockUntil;
        uint256 seedSale;
        uint256 seedQuote;
    }

    struct Bid {
        address bidder;
        bool opened;
        bool counted;
        bool claimed;
        uint8 step;
        uint96 quantity;
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
    error NothingToTally();
    error InsufficientGas();
    error BadStatus();
    error NotFinalized();
    error UnknownBidder();
    error AlreadyClaimed();
    error NotAuthority();
    error AlreadyReclaimed();
    error TransferFailed();
    error Reentrancy();

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
        uint256 indexed auctionId, uint32 slot, address indexed bidder, uint8 step, uint96 quantity, bool counted
    );
    event AuctionSettled(uint256 indexed auctionId, uint32 clearingStep, uint256 clearingPrice);
    event AuctionFinalized(uint256 indexed auctionId, uint256 totalSold);
    event AuctionCancelled(uint256 indexed auctionId);
    event BidClaimed(uint256 indexed auctionId, address indexed bidder, address to, uint256 saleOut, uint256 quoteOut);
    event ProceedsReclaimed(uint256 indexed auctionId, address to, uint256 saleOut, uint256 quoteOut);
    event SeedRequested(uint256 indexed auctionId, uint256 saleAmount, uint256 quoteAmount);
    event SeedFailed(uint256 indexed auctionId);

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
    mapping(uint256 => mapping(uint32 => uint32[])) internal _slotsAtStep;
    mapping(uint256 => bytes) internal _kuruParams;

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
        (bool counted, uint8 step, uint96 quantity) = _parse(a, auctionId, b.bidder, b.h, m);
        if (counted) {
            b.counted = true;
            b.step = step;
            b.quantity = quantity;
            _qtyAtStep[auctionId][step] += quantity;
            _slotsAtStep[auctionId][step].push(slot);
        }
        emit BidOpened(auctionId, slot, b.bidder, step, quantity, counted);
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

    /// @dev Never reverts: an unusable bid is simply not counted and is refunded at claim.
    function _parse(Auction storage a, uint256 auctionId, address bidder, bytes32 h, uint256 m)
        private
        view
        returns (bool counted, uint8 step, uint96 quantity)
    {
        if (keccak256(abi.encode(auctionId, bidder, m)) != h || m >= BID_LIMIT) return (false, 0, 0);
        step = uint8(m >> 224);
        quantity = uint96(m >> 128);
        if (step >= a.stepCount || quantity == 0) return (false, step, quantity);
        uint256 notional = _price(a, step) * quantity;
        counted = notional <= a.deposit && notional <= a.maxNotional;
    }

    // ------------------------------------------------------------------ settle

    function cancel(uint256 auctionId) external nonReentrant {
        Auction storage a = _requireAuction(auctionId);
        if (a.status != Status.Open) revert NotOpen();
        if (block.timestamp < a.cancelAfter) revert TooEarly();
        if (a.publishedCount >= 2) revert KeysComplete();
        a.status = Status.Cancelled;
        emit AuctionCancelled(auctionId);
    }

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

        a.status = Status.Settled;
        a.clearingStep = clearing;
        a.clearingPrice = above + atDemand == 0 ? 0 : _price(a, clearing);
        a.aboveTotal = above;
        a.remaining = supplyLots - above;
        a.atDemand = atDemand;
        emit AuctionSettled(auctionId, clearing, a.clearingPrice);

        if (atDemand <= a.remaining) {
            a.totalSold = above + atDemand;
            _finalize(auctionId, a);
        } else {
            _tally(auctionId, a, TALLY_IN_SETTLE);
        }
    }

    /// @notice Continues the pro-rata total for large clearing steps. Anyone may call it.
    function tally(uint256 auctionId, uint32 maxCount) external nonReentrant {
        Auction storage a = _requireAuction(auctionId);
        if (a.status != Status.Settled || a.finalized) revert NothingToTally();
        _tally(auctionId, a, maxCount);
    }

    function _tally(uint256 auctionId, Auction storage a, uint256 maxCount) private {
        uint32[] storage slots = _slotsAtStep[auctionId][a.clearingStep];
        uint256 length = slots.length;
        uint256 cursor = a.tallyCursor;
        uint256 end = cursor + maxCount < length ? cursor + maxCount : length;
        uint256 sum = a.tallySum;
        uint256 remaining = a.remaining;
        uint256 atDemand = a.atDemand;
        for (; cursor < end; ++cursor) {
            sum += (remaining * _bids[auctionId][slots[cursor]].quantity) / atDemand;
        }
        a.tallyCursor = uint32(cursor);
        a.tallySum = sum;
        if (cursor == length) {
            a.totalSold = a.aboveTotal + sum;
            _finalize(auctionId, a);
        }
    }

    function _finalize(uint256 auctionId, Auction storage a) private {
        a.finalized = true;
        emit AuctionFinalized(auctionId, a.totalSold);
        _handOffSeed(auctionId, a);
    }

    /// @dev Never lets a seeder failure block settlement: approve exact amounts, let the
    ///      seeder pull them in `accept` (rolled back if it reverts), then try `seed`.
    function _handOffSeed(uint256 auctionId, Auction storage a) private {
        if (a.totalSold == 0) return;
        uint256 unsoldLots = a.supplyLots - a.totalSold;
        uint256 saleAmount = (a.seedSaleLots < unsoldLots ? a.seedSaleLots : unsoldLots) * a.lotSize;
        uint256 quoteAmount = (a.clearingPrice * a.totalSold * a.seedQuoteBps) / 10_000;
        if (saleAmount == 0 && quoteAmount == 0) return;
        if (gasleft() < SEED_GAS_FLOOR) revert InsufficientGas();

        IMarketSeeder target = seeder;
        uint256 saleBefore = a.saleToken.balanceOf(address(this));
        uint256 quoteBefore = a.quoteToken.balanceOf(address(this));
        bool accepted;
        if (
            _tryApprove(a.saleToken, address(target), saleAmount)
                && _tryApprove(a.quoteToken, address(target), quoteAmount)
        ) {
            try target.accept(_seedOrder(auctionId, a, saleAmount, quoteAmount)) {
                accepted = true;
            } catch {}
        }
        _tryApprove(a.saleToken, address(target), 0);
        _tryApprove(a.quoteToken, address(target), 0);
        if (!accepted) {
            emit SeedFailed(auctionId);
            return;
        }

        uint256 saleAfter = a.saleToken.balanceOf(address(this));
        uint256 quoteAfter = a.quoteToken.balanceOf(address(this));
        a.seedSale = saleBefore > saleAfter ? saleBefore - saleAfter : 0;
        a.seedQuote = quoteBefore > quoteAfter ? quoteBefore - quoteAfter : 0;
        emit SeedRequested(auctionId, a.seedSale, a.seedQuote);
        try target.seed(auctionId) {} catch {}
    }

    function _seedOrder(uint256 auctionId, Auction storage a, uint256 saleAmount, uint256 quoteAmount)
        private
        view
        returns (IMarketSeeder.SeedOrder memory)
    {
        return IMarketSeeder.SeedOrder({
            auctionId: auctionId,
            authority: a.authority,
            saleToken: address(a.saleToken),
            quoteToken: address(a.quoteToken),
            saleAmount: saleAmount,
            quoteAmount: quoteAmount,
            clearingPrice: a.clearingPrice,
            lotSize: a.lotSize,
            lockUntil: a.seedLockUntil,
            kuruParams: _kuruParams[auctionId]
        });
    }

    // ------------------------------------------------------------------ claims

    function claim(uint256 auctionId) external {
        claimTo(auctionId, msg.sender);
    }

    /// @notice Pays the caller's allocation and refund to `to`, for example when the caller's
    ///         own address is blocked by one of the tokens.
    function claimTo(uint256 auctionId, address to) public nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        Auction storage a = _requireAuction(auctionId);
        Bid storage b = _bidderBid(auctionId, msg.sender);
        if (b.claimed) revert AlreadyClaimed();
        (uint256 saleOut, uint256 quoteOut) = _claimable(a, b);
        b.claimed = true;
        _push(a.saleToken, to, saleOut);
        _push(a.quoteToken, to, quoteOut);
        emit BidClaimed(auctionId, msg.sender, to, saleOut, quoteOut);
    }

    function reclaim(uint256 auctionId) external {
        reclaimTo(auctionId, msg.sender);
    }

    function reclaimTo(uint256 auctionId, address to) public nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        Auction storage a = _requireAuction(auctionId);
        if (msg.sender != a.authority) revert NotAuthority();
        if (a.reclaimed) revert AlreadyReclaimed();
        uint256 saleOut;
        uint256 quoteOut;
        if (a.status == Status.Cancelled) {
            saleOut = a.supply;
        } else if (a.status == Status.Settled) {
            if (!a.finalized) revert NotFinalized();
            saleOut = (a.supplyLots - a.totalSold) * a.lotSize - a.seedSale;
            quoteOut = a.clearingPrice * a.totalSold - a.seedQuote;
        } else {
            revert BadStatus();
        }
        a.reclaimed = true;
        _push(a.saleToken, to, saleOut);
        _push(a.quoteToken, to, quoteOut);
        emit ProceedsReclaimed(auctionId, to, saleOut, quoteOut);
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

    function quotePrice(uint256 auctionId, uint32 step) external view returns (uint256) {
        Auction storage a = _requireAuction(auctionId);
        if (step >= a.stepCount) revert BadGrid();
        return _price(a, step);
    }

    function publishedKeysOf(uint256 auctionId) external view returns (uint256[3] memory) {
        return _publishedKeys[auctionId];
    }

    function qtyAtStepOf(uint256 auctionId) external view returns (uint256[64] memory) {
        return _qtyAtStep[auctionId];
    }

    function slotsAtStepLength(uint256 auctionId, uint32 step) external view returns (uint256) {
        return _slotsAtStep[auctionId][step].length;
    }

    function hashBid(uint256 auctionId, address bidder, uint256 m) external pure returns (bytes32) {
        return keccak256(abi.encode(auctionId, bidder, m));
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

    function claimable(uint256 auctionId, address bidder) external view returns (uint256 saleOut, uint256 quoteOut) {
        return _claimable(_requireAuction(auctionId), _bidderBid(auctionId, bidder));
    }

    function kuruParamsOf(uint256 auctionId) external view returns (bytes memory) {
        return _kuruParams[auctionId];
    }

    // ------------------------------------------------------------------ internals

    function _requireAuction(uint256 auctionId) private view returns (Auction storage a) {
        a = _auctions[auctionId];
        if (a.status == Status.None) revert MissingAuction();
    }

    function _price(Auction storage a, uint256 step) private view returns (uint256) {
        return a.minPrice + step * a.stepSize;
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

    function _allocation(Auction storage a, Bid storage b) private view returns (uint256) {
        if (!b.counted || b.step < a.clearingStep) return 0;
        if (b.step > a.clearingStep || a.atDemand <= a.remaining) return b.quantity;
        return (a.remaining * b.quantity) / a.atDemand;
    }

    function _bidderBid(uint256 auctionId, address bidder) private view returns (Bid storage) {
        uint32 slotPlusOne = bidderSlot[auctionId][bidder];
        if (slotPlusOne == 0) revert UnknownBidder();
        return _bids[auctionId][slotPlusOne - 1];
    }

    function _claimable(Auction storage a, Bid storage b) private view returns (uint256 saleOut, uint256 quoteOut) {
        if (a.status == Status.Cancelled) return (0, a.deposit);
        if (a.status != Status.Settled) revert BadStatus();
        uint256 lots = _allocation(a, b);
        return (lots * a.lotSize, a.deposit - a.clearingPrice * lots);
    }

    function _tryApprove(IERC20 token, address spender, uint256 amount) private returns (bool) {
        (bool ok, bytes memory returned) =
            address(token).call(abi.encodeCall(IERC20.approve, (spender, amount)));
        if (!ok) return false;
        return returned.length == 0 || (returned.length >= 32 && abi.decode(returned, (uint256)) != 0);
    }
}
