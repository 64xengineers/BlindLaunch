// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20Minimal} from "./IERC20Minimal.sol";
import {UniformClearing} from "./UniformClearing.sol";

/// @title BlindAuction
/// @notice Uniform-price token launch on Monad.
///
/// Bids are commit-reveal. During the commit window a bidder escrows a fixed
/// quote-token deposit and submits `hashBid(...)`. After the commit deadline
/// they reveal the price step and quantity. After the reveal deadline anyone
/// may settle. The clearing rule is the same integer rule as
/// `packages/auction-core` and `docs/auction-rules.md`.
///
/// The commitment hides price and quantity only until that bidder reveals.
/// Wallet addresses, deposits, reveals, the clearing price, and transfers
/// are public. This is not an encrypted MPC auction.
///
/// Gas is paid in MON and is not taken from the deposit. A bidder who never
/// reveals is not filled and can reclaim the full deposit. Slot index is the
/// order the bid was committed, starting at 0. Dust at the clearing price
/// goes to earlier slots first.
contract BlindAuction {
    uint32 public constant MAX_STEPS = 64;
    uint32 public constant MAX_SLOTS = 64;

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
        uint256 minPrice;
        uint256 stepSize;
        uint32 stepCount;
        uint256 deposit;
        uint256 maxNotional;
        uint32 maxSlots;
        uint64 commitDeadline;
        uint64 revealDeadline;
        uint64 cancelAfter;
    }

    struct Auction {
        address authority;
        IERC20Minimal saleToken;
        IERC20Minimal quoteToken;
        uint256 supply;
        uint256 minPrice;
        uint256 stepSize;
        uint32 stepCount;
        uint256 deposit;
        uint256 maxNotional;
        uint32 maxSlots;
        uint64 commitDeadline;
        uint64 revealDeadline;
        uint64 cancelAfter;
        Status status;
        uint32 bidCount;
        uint256 clearingPrice;
        uint32 clearingStep;
        uint256 totalSold;
        bool reclaimed;
    }

    struct Bid {
        address bidder;
        bytes32 commitment;
        uint32 priceStep;
        uint256 quantity;
        uint256 allocation;
        bool revealed;
        bool counted;
        bool claimed;
    }

    error ZeroAddress();
    error SameToken();
    error BadSupply();
    error BadGrid();
    error BadDeposit();
    error BadSlots();
    error BadSchedule();
    error NotOpen();
    error TooEarly();
    error TooLate();
    error AuctionFull();
    error AuthorityBid();
    error AlreadyBid();
    error UnknownBidder();
    error AlreadyRevealed();
    error CommitmentMismatch();
    error BadStatus();
    error AlreadyClaimed();
    error NotAuthority();
    error AlreadyReclaimed();
    error TransferFailed();
    error MissingAuction();
    error Reentrancy();

    uint256 private _locked = 1;

    uint256 public nextAuctionId = 1;
    mapping(uint256 id => Auction auction) private _auctions;
    mapping(uint256 id => mapping(uint32 slot => Bid bid)) private _bids;
    /// @dev Stored value is `slot + 1`. Zero means the address has no bid.
    mapping(uint256 id => mapping(address bidder => uint32 slotPlusOne)) public bidderSlot;

    event AuctionCreated(
        uint256 indexed auctionId,
        address indexed authority,
        address saleToken,
        address quoteToken,
        uint256 supply,
        uint64 commitDeadline,
        uint64 revealDeadline,
        uint64 cancelAfter
    );
    event BidCommitted(uint256 indexed auctionId, address indexed bidder, uint32 slot, bytes32 commitment);
    event BidRevealed(uint256 indexed auctionId, address indexed bidder, uint32 priceStep, uint256 quantity, bool counted);
    event AuctionSettled(uint256 indexed auctionId, uint256 clearingPrice, uint32 clearingStep, uint256 totalSold);
    event AuctionCancelled(uint256 indexed auctionId);
    event BidClaimed(uint256 indexed auctionId, address indexed bidder, uint256 saleTokens, uint256 quoteRefund);
    event ProceedsReclaimed(uint256 indexed auctionId, address indexed authority, uint256 unsold, uint256 proceeds);

    modifier nonReentrant() {
        if (_locked != 1) revert Reentrancy();
        _locked = 2;
        _;
        _locked = 1;
    }

    /// @dev `keccak256(abi.encode(auctionId, bidder, priceStep, quantity, salt))`.
    function hashBid(uint256 auctionId, address bidder, uint32 priceStep, uint256 quantity, bytes32 salt)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(auctionId, bidder, priceStep, quantity, salt));
    }

    function quotePrice(uint256 auctionId, uint32 step) external view returns (uint256) {
        Auction storage auction = _requireAuction(auctionId);
        if (step >= auction.stepCount) revert BadGrid();
        return UniformClearing.quotePerToken(auction.minPrice, auction.stepSize, step);
    }

    function getAuction(uint256 auctionId) external view returns (Auction memory) {
        return _auctions[auctionId];
    }

    function getBid(uint256 auctionId, uint32 slot) external view returns (Bid memory) {
        return _bids[auctionId][slot];
    }

    /// @notice Tokens and quote refund a bidder can pull after settle or cancel.
    function claimable(uint256 auctionId, address bidder) external view returns (uint256 saleTokens, uint256 quoteRefund) {
        return _claimable(_requireAuction(auctionId), _bidderBid(auctionId, bidder));
    }

    function createAuction(CreateParams calldata params) external nonReentrant returns (uint256 auctionId) {
        if (params.saleToken == address(0) || params.quoteToken == address(0)) revert ZeroAddress();
        if (params.saleToken == params.quoteToken) revert SameToken();
        if (params.supply == 0) revert BadSupply();
        if (params.minPrice == 0 || params.stepSize == 0 || params.stepCount == 0 || params.stepCount > MAX_STEPS) {
            revert BadGrid();
        }
        if (params.deposit == 0 || params.maxNotional == 0) revert BadDeposit();
        if (params.maxSlots == 0 || params.maxSlots > MAX_SLOTS) revert BadSlots();
        if (
            params.commitDeadline <= block.timestamp || params.revealDeadline <= params.commitDeadline
                || params.cancelAfter <= params.revealDeadline
        ) {
            revert BadSchedule();
        }

        auctionId = nextAuctionId++;
        Auction storage auction = _auctions[auctionId];
        auction.authority = msg.sender;
        auction.saleToken = IERC20Minimal(params.saleToken);
        auction.quoteToken = IERC20Minimal(params.quoteToken);
        auction.supply = params.supply;
        auction.minPrice = params.minPrice;
        auction.stepSize = params.stepSize;
        auction.stepCount = params.stepCount;
        auction.deposit = params.deposit;
        auction.maxNotional = params.maxNotional;
        auction.maxSlots = params.maxSlots;
        auction.commitDeadline = params.commitDeadline;
        auction.revealDeadline = params.revealDeadline;
        auction.cancelAfter = params.cancelAfter;
        auction.status = Status.Open;

        _pull(auction.saleToken, msg.sender, params.supply);

        emit AuctionCreated(
            auctionId,
            msg.sender,
            params.saleToken,
            params.quoteToken,
            params.supply,
            params.commitDeadline,
            params.revealDeadline,
            params.cancelAfter
        );
    }

    function commit(uint256 auctionId, bytes32 commitment) external nonReentrant {
        Auction storage auction = _requireAuction(auctionId);
        if (auction.status != Status.Open) revert NotOpen();
        if (block.timestamp >= auction.commitDeadline) revert TooLate();
        if (msg.sender == auction.authority) revert AuthorityBid();
        if (bidderSlot[auctionId][msg.sender] != 0) revert AlreadyBid();
        if (auction.bidCount >= auction.maxSlots) revert AuctionFull();

        uint32 slot = auction.bidCount;
        auction.bidCount = slot + 1;
        bidderSlot[auctionId][msg.sender] = slot + 1;
        _bids[auctionId][slot] = Bid({
            bidder: msg.sender,
            commitment: commitment,
            priceStep: 0,
            quantity: 0,
            allocation: 0,
            revealed: false,
            counted: false,
            claimed: false
        });

        _pull(auction.quoteToken, msg.sender, auction.deposit);
        emit BidCommitted(auctionId, msg.sender, slot, commitment);
    }

    function reveal(uint256 auctionId, uint32 priceStep, uint256 quantity, bytes32 salt) external nonReentrant {
        Auction storage auction = _requireAuction(auctionId);
        if (auction.status != Status.Open) revert NotOpen();
        if (block.timestamp < auction.commitDeadline) revert TooEarly();
        if (block.timestamp >= auction.revealDeadline) revert TooLate();

        Bid storage bid = _bidderBid(auctionId, msg.sender);
        if (bid.revealed) revert AlreadyRevealed();
        if (hashBid(auctionId, msg.sender, priceStep, quantity, salt) != bid.commitment) {
            revert CommitmentMismatch();
        }

        bid.revealed = true;
        bid.priceStep = priceStep;
        bid.quantity = quantity;
        bid.counted = _counts(auction, priceStep, quantity);
        emit BidRevealed(auctionId, msg.sender, priceStep, quantity, bid.counted);
    }

    function settle(uint256 auctionId) external nonReentrant {
        Auction storage auction = _requireAuction(auctionId);
        if (auction.status != Status.Open) revert NotOpen();
        if (block.timestamp < auction.revealDeadline) revert TooEarly();
        if (block.timestamp >= auction.cancelAfter) revert TooLate();

        uint256 counted;
        uint32 bidCount = auction.bidCount;
        for (uint32 slot = 0; slot < bidCount; ++slot) {
            if (_bids[auctionId][slot].counted) {
                ++counted;
            }
        }

        UniformClearing.Bid[] memory book = new UniformClearing.Bid[](counted);
        uint256 cursor;
        for (uint32 slot = 0; slot < bidCount; ++slot) {
            Bid storage stored = _bids[auctionId][slot];
            if (!stored.counted) continue;
            book[cursor] = UniformClearing.Bid({
                slot: slot, priceStep: stored.priceStep, quantity: stored.quantity, allocation: 0
            });
            ++cursor;
        }

        UniformClearing.Outcome memory outcome = UniformClearing.clear(
            auction.supply, auction.minPrice, auction.stepSize, auction.stepCount, book
        );

        for (uint256 i = 0; i < counted; ++i) {
            _bids[auctionId][book[i].slot].allocation = book[i].allocation;
        }

        auction.status = Status.Settled;
        auction.clearingPrice = outcome.clearingPrice;
        auction.clearingStep = outcome.clearingStep;
        auction.totalSold = outcome.totalSold;
        emit AuctionSettled(auctionId, outcome.clearingPrice, outcome.clearingStep, outcome.totalSold);
    }

    function cancel(uint256 auctionId) external nonReentrant {
        Auction storage auction = _requireAuction(auctionId);
        if (auction.status != Status.Open) revert NotOpen();
        if (block.timestamp < auction.cancelAfter) revert TooEarly();
        auction.status = Status.Cancelled;
        emit AuctionCancelled(auctionId);
    }

    function claim(uint256 auctionId) external nonReentrant {
        Auction storage auction = _requireAuction(auctionId);
        Bid storage bid = _bidderBid(auctionId, msg.sender);
        if (bid.claimed) revert AlreadyClaimed();

        (uint256 saleTokens, uint256 quoteRefund) = _claimable(auction, bid);
        if (auction.status != Status.Settled && auction.status != Status.Cancelled) revert BadStatus();

        bid.claimed = true;
        _push(auction.saleToken, msg.sender, saleTokens);
        _push(auction.quoteToken, msg.sender, quoteRefund);
        emit BidClaimed(auctionId, msg.sender, saleTokens, quoteRefund);
    }

    function reclaim(uint256 auctionId) external nonReentrant {
        Auction storage auction = _requireAuction(auctionId);
        if (msg.sender != auction.authority) revert NotAuthority();
        if (auction.status != Status.Settled && auction.status != Status.Cancelled) revert BadStatus();
        if (auction.reclaimed) revert AlreadyReclaimed();

        uint256 unsold = auction.status == Status.Cancelled ? auction.supply : auction.supply - auction.totalSold;
        uint256 proceeds = auction.status == Status.Settled ? auction.clearingPrice * auction.totalSold : 0;

        auction.reclaimed = true;
        _push(auction.saleToken, msg.sender, unsold);
        _push(auction.quoteToken, msg.sender, proceeds);
        emit ProceedsReclaimed(auctionId, msg.sender, unsold, proceeds);
    }

    function _counts(Auction storage auction, uint32 priceStep, uint256 quantity) private view returns (bool) {
        if (priceStep >= auction.stepCount || quantity == 0) return false;
        uint256 price = UniformClearing.quotePerToken(auction.minPrice, auction.stepSize, priceStep);
        if (price != 0 && quantity > type(uint256).max / price) return false;
        uint256 notional = price * quantity;
        return notional <= auction.deposit && notional <= auction.maxNotional;
    }

    function _claimable(Auction storage auction, Bid storage bid)
        private
        view
        returns (uint256 saleTokens, uint256 quoteRefund)
    {
        if (bid.bidder == address(0)) revert UnknownBidder();
        if (auction.status == Status.Cancelled) {
            return (0, auction.deposit);
        }
        if (auction.status == Status.Settled) {
            uint256 payment = auction.clearingPrice * bid.allocation;
            return (bid.allocation, auction.deposit - payment);
        }
        return (0, 0);
    }

    function _requireAuction(uint256 auctionId) private view returns (Auction storage auction) {
        auction = _auctions[auctionId];
        if (auction.status == Status.None) revert MissingAuction();
    }

    function _bidderBid(uint256 auctionId, address bidder) private view returns (Bid storage bid) {
        uint32 slotPlusOne = bidderSlot[auctionId][bidder];
        if (slotPlusOne == 0) revert UnknownBidder();
        bid = _bids[auctionId][slotPlusOne - 1];
    }

    function _pull(IERC20Minimal token, address from, uint256 amount) private {
        uint256 beforeBalance = token.balanceOf(address(this));
        _call(address(token), abi.encodeCall(IERC20Minimal.transferFrom, (from, address(this), amount)));
        if (token.balanceOf(address(this)) != beforeBalance + amount) revert TransferFailed();
    }

    function _push(IERC20Minimal token, address to, uint256 amount) private {
        if (amount == 0) return;
        uint256 beforeBalance = token.balanceOf(address(this));
        _call(address(token), abi.encodeCall(IERC20Minimal.transfer, (to, amount)));
        if (token.balanceOf(address(this)) != beforeBalance - amount) revert TransferFailed();
    }

    function _call(address token, bytes memory data) private {
        (bool ok, bytes memory returned) = token.call(data);
        if (!ok) revert TransferFailed();
        if (returned.length > 0 && !abi.decode(returned, (bool))) revert TransferFailed();
    }
}
