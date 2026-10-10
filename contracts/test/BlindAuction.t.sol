// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {BlindAuction} from "../src/BlindAuction.sol";
import {TestERC20} from "../src/TestERC20.sol";

contract FeeOnTransferToken {
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

contract BlindAuctionTest is Test {
    uint256 internal constant START = 1_700_000_000;
    uint256 internal constant DEPOSIT = 1_000_000;

    BlindAuction internal auction;
    TestERC20 internal sale;
    TestERC20 internal quote;

    address internal authority = makeAddr("authority");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal cara = makeAddr("cara");
    address internal dan = makeAddr("dan");

    function setUp() public {
        vm.warp(START);
        auction = new BlindAuction();
        sale = new TestERC20("Sale", "SALE");
        quote = new TestERC20("Quote", "QUOTE");
        sale.mint(authority, 10_000_000);
        vm.prank(authority);
        sale.approve(address(auction), type(uint256).max);
    }

    function test_referenceClearingPriceAndPayouts() public {
        uint256 id = _create(1000, 6, 8, DEPOSIT, DEPOSIT);
        _bid(id, alice, 5, 400);
        _bid(id, bob, 3, 300);
        _bid(id, cara, 1, 500);
        _bid(id, dan, 0, 400);

        _toSettle();
        auction.settle(id);

        BlindAuction.Auction memory stored = auction.getAuction(id);
        assertEq(uint256(stored.status), uint256(BlindAuction.Status.Settled));
        assertEq(stored.clearingStep, 1);
        assertEq(stored.clearingPrice, 60);
        assertEq(stored.totalSold, 1000);
        assertEq(auction.quotePrice(id, 0), 50);
        assertEq(auction.quotePrice(id, 1), 60);
        assertEq(auction.quotePrice(id, 3), 80);
        assertEq(auction.quotePrice(id, 5), 100);

        _claim(id, alice, 400, DEPOSIT - (60 * 400));
        _claim(id, bob, 300, DEPOSIT - (60 * 300));
        _claim(id, cara, 300, DEPOSIT - (60 * 300));
        _claim(id, dan, 0, DEPOSIT);

        vm.prank(authority);
        auction.reclaim(id);

        assertEq(sale.balanceOf(authority), 10_000_000 - 1000);
        assertEq(quote.balanceOf(authority), 60 * 1000);
        assertEq(sale.balanceOf(address(auction)), 0);
        assertEq(quote.balanceOf(address(auction)), 0);
    }

    function test_undersubscribedAuctionClearsAtMinimumPrice() public {
        uint256 id = _create(1000, 6, 8, DEPOSIT, DEPOSIT);
        _bid(id, alice, 5, 100);
        _bid(id, bob, 0, 50);

        _toSettle();
        auction.settle(id);

        BlindAuction.Auction memory stored = auction.getAuction(id);
        assertEq(stored.clearingPrice, 50);
        assertEq(stored.totalSold, 150);

        _claim(id, alice, 100, DEPOSIT - (50 * 100));
        _claim(id, bob, 50, DEPOSIT - (50 * 50));

        vm.prank(authority);
        auction.reclaim(id);
        assertEq(sale.balanceOf(authority), 10_000_000 - 150);
        assertEq(quote.balanceOf(authority), 50 * 150);
    }

    function test_noRevealsSellNothing() public {
        uint256 id = _create(1000, 6, 8, DEPOSIT, DEPOSIT);
        _toSettle();
        auction.settle(id);

        BlindAuction.Auction memory stored = auction.getAuction(id);
        assertEq(stored.totalSold, 0);
        assertEq(stored.clearingPrice, 0);

        vm.prank(authority);
        auction.reclaim(id);
        assertEq(sale.balanceOf(authority), 10_000_000);
        assertEq(quote.balanceOf(authority), 0);
    }

    function test_unrevealedBidderIsRefundedAndNotFilled() public {
        uint256 id = _create(1000, 6, 8, DEPOSIT, DEPOSIT);
        _commitOnly(id, alice, 5, 400);
        _bid(id, bob, 1, 1000);

        _toSettle();
        auction.settle(id);

        _claim(id, alice, 0, DEPOSIT);
        _claim(id, bob, 1000, DEPOSIT - (60 * 1000));
    }

    function test_dustGoesToEarlierCommit() public {
        uint256 id = _create(100, 6, 8, DEPOSIT, DEPOSIT);
        _bid(id, alice, 1, 50);
        _bid(id, bob, 1, 30);
        _bid(id, cara, 2, 40);
        _bid(id, dan, 0, 100);

        _toSettle();
        auction.settle(id);

        assertEq(auction.getBid(id, 0).allocation, 38);
        assertEq(auction.getBid(id, 1).allocation, 22);
        assertEq(auction.getBid(id, 2).allocation, 40);
        assertEq(auction.getBid(id, 3).allocation, 0);
        assertEq(auction.getAuction(id).clearingPrice, 60);
        assertEq(auction.getAuction(id).totalSold, 100);
    }

    function test_oneUnitRemainderGoesToTheFirstSlot() public {
        uint256 id = _createCustom(10, 50, 10, 1, 8, DEPOSIT, DEPOSIT);
        _bid(id, alice, 0, 5);
        _bid(id, bob, 0, 5);
        _bid(id, cara, 0, 5);

        _toSettle();
        auction.settle(id);

        assertEq(auction.getBid(id, 0).allocation, 4);
        assertEq(auction.getBid(id, 1).allocation, 3);
        assertEq(auction.getBid(id, 2).allocation, 3);
        assertEq(auction.getAuction(id).totalSold, 10);
    }

    function test_oversizedBidIsCappedAtSupply() public {
        uint256 id = _create(100, 6, 8, DEPOSIT, DEPOSIT);
        _bid(id, alice, 2, 250);

        _toSettle();
        auction.settle(id);

        assertEq(auction.getAuction(id).clearingPrice, 70);
        assertEq(auction.getBid(id, 0).allocation, 100);
        _claim(id, alice, 100, DEPOSIT - (70 * 100));
    }

    function test_largeIntegerClearingMatchesTheReferenceRule() public {
        uint256 unit = 10 ** 18;
        uint256 deposit = 10 ** 40;
        sale.mint(authority, unit);
        uint256 id = _createCustom(unit, unit, unit, 4, 4, deposit, deposit);
        _fund(alice, deposit);
        bytes32 salt = keccak256(abi.encode(alice));
        bytes32 commitment = auction.hashBid(id, alice, 3, unit, salt);
        vm.prank(alice);
        auction.commit(id, commitment);
        _toReveal();
        vm.prank(alice);
        auction.reveal(id, 3, unit, salt);
        _toSettle();
        auction.settle(id);

        assertEq(auction.getAuction(id).clearingPrice, 4 * unit);
        assertEq(auction.getBid(id, 0).allocation, unit);
    }

    function test_invalidRevealIsExcludedAndRefunded() public {
        uint256 id = _create(1000, 6, 8, 39_999, DEPOSIT);
        _bid(id, alice, 5, 400);
        _bid(id, bob, 1, 10);

        assertFalse(auction.getBid(id, 0).counted);
        assertTrue(auction.getBid(id, 1).counted);

        _toSettle();
        auction.settle(id);
        assertEq(auction.getBid(id, 0).allocation, 0);
        assertEq(auction.getBid(id, 1).allocation, 10);

        _claim(id, alice, 0, 39_999);
    }

    function test_wrongSaltDoesNotBurnTheCommit() public {
        uint256 id = _create(1000, 6, 8, DEPOSIT, DEPOSIT);
        bytes32 salt = keccak256(abi.encode(alice));
        _fund(alice, DEPOSIT);
        bytes32 commitment = auction.hashBid(id, alice, 5, 400, salt);
        vm.prank(alice);
        auction.commit(id, commitment);

        _toReveal();
        vm.prank(alice);
        vm.expectRevert(BlindAuction.CommitmentMismatch.selector);
        auction.reveal(id, 5, 400, bytes32(uint256(1)));

        vm.prank(alice);
        auction.reveal(id, 5, 400, salt);
        assertTrue(auction.getBid(id, 0).counted);
    }

    function test_cancelRefundsDepositsAndReturnsSupply() public {
        uint256 id = _create(1000, 6, 8, DEPOSIT, DEPOSIT);
        _bid(id, alice, 5, 400);
        _commitOnly(id, bob, 1, 100);

        _toCancel();
        auction.cancel(id);

        vm.expectRevert(BlindAuction.NotOpen.selector);
        auction.settle(id);

        _claim(id, alice, 0, DEPOSIT);
        _claim(id, bob, 0, DEPOSIT);
        vm.prank(authority);
        auction.reclaim(id);

        assertEq(sale.balanceOf(authority), 10_000_000);
        assertEq(quote.balanceOf(alice), DEPOSIT);
        assertEq(quote.balanceOf(bob), DEPOSIT);
        assertEq(quote.balanceOf(address(auction)), 0);
        assertEq(sale.balanceOf(address(auction)), 0);
    }

    function test_authorityCannotBidAndWalletsCannotBidTwice() public {
        uint256 id = _create(1000, 6, 8, DEPOSIT, DEPOSIT);
        _fund(authority, DEPOSIT);
        vm.prank(authority);
        vm.expectRevert(BlindAuction.AuthorityBid.selector);
        auction.commit(id, bytes32(uint256(1)));

        _bid(id, alice, 1, 10);
        _fund(alice, DEPOSIT);
        vm.prank(alice);
        vm.expectRevert(BlindAuction.AlreadyBid.selector);
        auction.commit(id, bytes32(uint256(2)));
    }

    function test_windowsAndFullCapacity() public {
        uint256 id = _create(1000, 6, 1, DEPOSIT, DEPOSIT);
        _bid(id, alice, 1, 10);

        _fund(bob, DEPOSIT);
        bytes32 bobCommitment = auction.hashBid(id, bob, 1, 10, keccak256(abi.encode(bob)));
        vm.prank(bob);
        vm.expectRevert(BlindAuction.AuctionFull.selector);
        auction.commit(id, bobCommitment);

        _toReveal();
        vm.prank(alice);
        vm.expectRevert(BlindAuction.TooLate.selector);
        auction.commit(id, bytes32(uint256(9)));

        vm.expectRevert(BlindAuction.TooEarly.selector);
        auction.settle(id);

        _toSettle();
        vm.prank(alice);
        vm.expectRevert(BlindAuction.TooLate.selector);
        auction.reveal(id, 1, 10, keccak256(abi.encode(alice)));

        vm.expectRevert(BlindAuction.TooEarly.selector);
        auction.cancel(id);

        auction.settle(id);
        vm.expectRevert(BlindAuction.NotOpen.selector);
        auction.cancel(id);
    }

    function test_settleAfterTheTimeoutIsRejected() public {
        uint256 id = _create(1000, 6, 8, DEPOSIT, DEPOSIT);
        _toCancel();
        vm.expectRevert(BlindAuction.TooLate.selector);
        auction.settle(id);
        auction.cancel(id);
    }

    function test_feeOnTransferTokenIsRejected() public {
        FeeOnTransferToken feeSale = new FeeOnTransferToken();
        feeSale.mint(authority, 1000);
        vm.prank(authority);
        feeSale.approve(address(auction), 1000);

        vm.prank(authority);
        vm.expectRevert(BlindAuction.TransferFailed.selector);
        auction.createAuction(
            BlindAuction.CreateParams({
                saleToken: address(feeSale),
                quoteToken: address(quote),
                supply: 1000,
                minPrice: 50,
                stepSize: 10,
                stepCount: 6,
                deposit: DEPOSIT,
                maxNotional: DEPOSIT,
                maxSlots: 8,
                commitDeadline: uint64(START + 1 hours),
                revealDeadline: uint64(START + 2 hours),
                cancelAfter: uint64(START + 3 hours)
            })
        );
    }

    function test_hashMatchesAbiEncode() public view {
        bytes32 salt = bytes32(uint256(7));
        bytes32 expected = keccak256(abi.encode(uint256(4), alice, uint32(5), uint256(400), salt));
        assertEq(auction.hashBid(4, alice, 5, 400, salt), expected);
    }

    function _create(uint256 supply, uint32 stepCount, uint32 maxSlots, uint256 deposit, uint256 maxNotional)
        internal
        returns (uint256)
    {
        return _createCustom(supply, 50, 10, stepCount, maxSlots, deposit, maxNotional);
    }

    function _createCustom(
        uint256 supply,
        uint256 minPrice,
        uint256 stepSize,
        uint32 stepCount,
        uint32 maxSlots,
        uint256 deposit,
        uint256 maxNotional
    ) internal returns (uint256 id) {
        vm.prank(authority);
        id = auction.createAuction(
            BlindAuction.CreateParams({
                saleToken: address(sale),
                quoteToken: address(quote),
                supply: supply,
                minPrice: minPrice,
                stepSize: stepSize,
                stepCount: stepCount,
                deposit: deposit,
                maxNotional: maxNotional,
                maxSlots: maxSlots,
                commitDeadline: uint64(START + 1 hours),
                revealDeadline: uint64(START + 2 hours),
                cancelAfter: uint64(START + 3 hours)
            })
        );
    }

    function _bid(uint256 id, address bidder, uint32 step, uint256 quantity) internal {
        _commitOnly(id, bidder, step, quantity);
        _toReveal();
        vm.prank(bidder);
        auction.reveal(id, step, quantity, keccak256(abi.encode(bidder)));
        vm.warp(START);
    }

    function _commitOnly(uint256 id, address bidder, uint32 step, uint256 quantity) internal {
        uint256 deposit = auction.getAuction(id).deposit;
        _fund(bidder, deposit);
        bytes32 commitment = auction.hashBid(id, bidder, step, quantity, keccak256(abi.encode(bidder)));
        vm.prank(bidder);
        auction.commit(id, commitment);
    }

    function _fund(address bidder, uint256 amount) internal {
        quote.mint(bidder, amount);
        vm.prank(bidder);
        quote.approve(address(auction), type(uint256).max);
    }

    function _claim(uint256 id, address bidder, uint256 saleTokens, uint256 quoteRefund) internal {
        uint256 saleBefore = sale.balanceOf(bidder);
        uint256 quoteBefore = quote.balanceOf(bidder);
        vm.prank(bidder);
        auction.claim(id);
        assertEq(sale.balanceOf(bidder) - saleBefore, saleTokens);
        assertEq(quote.balanceOf(bidder) - quoteBefore, quoteRefund);
    }

    function _toReveal() internal {
        vm.warp(START + 1 hours);
    }

    function _toSettle() internal {
        vm.warp(START + 2 hours);
    }

    function _toCancel() internal {
        vm.warp(START + 3 hours);
    }
}
