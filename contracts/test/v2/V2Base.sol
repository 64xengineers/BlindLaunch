// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {BlindAuctionV2} from "../../src/BlindAuctionV2.sol";
import {KeeperRegistry} from "../../src/KeeperRegistry.sol";
import {Secp256k1} from "../../src/Secp256k1.sol";
import {TestToken} from "../../src/TestToken.sol";

abstract contract V2Base is Test {
    uint256 internal constant N = Secp256k1.N;
    uint256 internal constant START = 1_700_000_000;
    uint256 internal constant DEPOSIT = 1_000_000;

    struct Sealed {
        Secp256k1.Point ephemeral;
        uint256[3] c;
        bytes32 h;
        Secp256k1.Point[3] shared;
        uint256 m;
    }

    BlindAuctionV2 internal auction;
    KeeperRegistry internal registry;
    TestToken internal sale;
    TestToken internal quote;

    address internal authority = makeAddr("authority");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal cara = makeAddr("cara");
    address internal dan = makeAddr("dan");
    address[3] internal keeperOwners;

    uint256 internal keyNonce = 1;
    mapping(uint256 => uint256[3]) internal secretsOf;
    mapping(uint256 => mapping(uint32 => Sealed)) internal sealedOf;

    function setUp() public virtual {
        vm.warp(START);
        _deploy();
    }

    function _deploy() internal {
        keeperOwners = [makeAddr("keeper0"), makeAddr("keeper1"), makeAddr("keeper2")];
        registry = new KeeperRegistry(keeperOwners);
        auction = new BlindAuctionV2(registry);
        registry.setAuction(address(auction));
        sale = new TestToken("Sale", "SALE", 0);
        quote = new TestToken("Quote", "QUOTE", 0);
        sale.mint(authority, 10_000_000);
        vm.prank(authority);
        sale.approve(address(auction), type(uint256).max);
    }

    function _pub(uint256 k) internal returns (Secp256k1.Point memory) {
        Vm.Wallet memory wallet = vm.createWallet(k);
        return Secp256k1.Point(wallet.publicKeyX, wallet.publicKeyY);
    }

    function _scalar(bytes32 seed) internal pure returns (uint256) {
        return (uint256(seed) % (N - 1)) + 1;
    }

    function _enqueueKeys() internal returns (uint256[3] memory secretKeys) {
        for (uint8 i = 0; i < 3; ++i) {
            secretKeys[i] = _scalar(keccak256(abi.encode("keeper", i, keyNonce++)));
            Secp256k1.Point[] memory keys = new Secp256k1.Point[](1);
            keys[0] = _pub(secretKeys[i]);
            vm.prank(keeperOwners[i]);
            registry.enqueue(i, keys);
        }
    }

    function _params() internal view returns (BlindAuctionV2.CreateParams memory p) {
        p.saleToken = address(sale);
        p.quoteToken = address(quote);
        p.supply = 1000;
        p.lotSize = 1;
        p.minPrice = 50;
        p.stepSize = 10;
        p.stepCount = 6;
        p.deposit = DEPOSIT;
        p.maxNotional = DEPOSIT;
        p.maxBids = 10_000;
        p.commitStart = uint64(block.timestamp);
        p.commitDeadline = uint64(block.timestamp + 1 hours);
        p.cancelAfter = uint64(block.timestamp + 2 hours);
    }

    function _create(BlindAuctionV2.CreateParams memory p) internal returns (uint256 id) {
        uint256[3] memory secretKeys = _enqueueKeys();
        vm.prank(authority);
        id = auction.createAuction(p);
        secretsOf[id] = secretKeys;
    }

    function _create() internal returns (uint256) {
        return _create(_params());
    }

    function _sealRaw(uint256 id, address bidder, uint256 m) internal returns (Sealed memory s) {
        s.m = m;
        uint256 slope = _scalar(keccak256(abi.encode("slope", id, bidder, m)));
        uint256 r = _scalar(keccak256(abi.encode("ephemeral", id, bidder, m)));
        s.ephemeral = _pub(r);
        while (s.ephemeral.x >= N) {
            r = addmod(r, 1, N);
            s.ephemeral = _pub(r);
        }
        uint256[3] memory secretKeys = secretsOf[id];
        for (uint256 i = 0; i < 3; ++i) {
            uint256 share = addmod(m, mulmod(slope, i + 1, N), N);
            s.shared[i] = _pub(mulmod(r, secretKeys[i], N));
            s.c[i] = share ^ Secp256k1.shareKey(s.shared[i], uint8(i));
        }
        s.h = keccak256(abi.encode(id, bidder, m));
    }

    function _seal(uint256 id, address bidder, uint256 step, uint256 quantity) internal returns (Sealed memory) {
        uint256 nonce = uint256(keccak256(abi.encode("nonce", id, bidder))) >> 128;
        return _sealRaw(id, bidder, (step << 224) | (quantity << 128) | nonce);
    }

    function _commitSealed(uint256 id, address bidder, Sealed memory s) internal returns (uint32 slot) {
        uint256 deposit = auction.getAuction(id).deposit;
        quote.mint(bidder, deposit);
        vm.startPrank(bidder);
        quote.approve(address(auction), deposit);
        auction.commit(id, s.ephemeral, s.c, s.h);
        vm.stopPrank();
        slot = auction.bidderSlot(id, bidder) - 1;
        sealedOf[id][slot] = s;
    }

    function _bid(uint256 id, address bidder, uint256 step, uint256 quantity) internal returns (uint32) {
        return _commitSealed(id, bidder, _seal(id, bidder, step, quantity));
    }

    function _publish(uint256 id, uint8 keeper) internal {
        auction.publishKey(id, keeper, secretsOf[id][keeper]);
    }

    function _close(uint256 id, uint8 first, uint8 second) internal {
        vm.warp(auction.getAuction(id).commitDeadline);
        _publish(id, first);
        _publish(id, second);
    }

    function _openAll(uint256 id) internal {
        BlindAuctionV2.Auction memory a = auction.getAuction(id);
        for (uint32 slot = 0; slot < a.bidCount; ++slot) {
            if (auction.getBid(id, slot).opened) continue;
            Sealed storage s = sealedOf[id][slot];
            auction.open(id, slot, s.shared[a.pairA], s.shared[a.pairB]);
        }
    }

    function _closeAndOpenAll(uint256 id) internal {
        _close(id, 0, 1);
        _openAll(id);
    }

    function _tallyAll(uint256 id) internal {
        while (!auction.getAuction(id).finalized) {
            auction.tally(id, 1000);
        }
    }

    function _claim(uint256 id, address bidder, uint256 saleOut, uint256 quoteOut) internal {
        uint256 saleBefore = sale.balanceOf(bidder);
        uint256 quoteBefore = quote.balanceOf(bidder);
        vm.prank(bidder);
        auction.claim(id);
        assertEq(sale.balanceOf(bidder) - saleBefore, saleOut, "sale out");
        assertEq(quote.balanceOf(bidder) - quoteBefore, quoteOut, "quote out");
    }
}
