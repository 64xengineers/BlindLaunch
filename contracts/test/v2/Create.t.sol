// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BlindAuctionV2} from "../../src/BlindAuctionV2.sol";
import {KeeperRegistry} from "../../src/KeeperRegistry.sol";
import {Secp256k1} from "../../src/Secp256k1.sol";
import {FeeOnTransferToken as FeeToken} from "./Mocks.sol";
import {V2Base} from "./V2Base.sol";

contract CreateTest is V2Base {
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

    function _expectCreateRevert(BlindAuctionV2.CreateParams memory p, bytes4 selector) internal {
        _enqueueKeys();
        vm.prank(authority);
        vm.expectRevert(selector);
        auction.createAuction(p);
    }

    function test_createStoresPullsAndConsumesKeys() public {
        BlindAuctionV2.CreateParams memory p = _params();
        uint256[3] memory secretKeys = _enqueueKeys();
        vm.prank(authority);
        vm.expectEmit(address(auction));
        emit AuctionCreated(1, authority, address(sale), address(quote), 1000, p.commitStart, p.commitDeadline, p.cancelAfter);
        uint256 id = auction.createAuction(p);

        assertEq(id, 1);
        assertEq(auction.nextAuctionId(), 2);
        BlindAuctionV2.Auction memory a = auction.getAuction(id);
        assertEq(a.authority, authority);
        assertEq(a.supply, 1000);
        assertEq(a.supplyLots, 1000);
        assertEq(uint256(a.status), uint256(BlindAuctionV2.Status.Open));
        assertEq(sale.balanceOf(address(auction)), 1000);
        Secp256k1.Point[3] memory keys = auction.keeperKeysOf(id);
        for (uint256 i = 0; i < 3; ++i) {
            assertEq(keys[i].x, _pub(secretKeys[i]).x);
            assertEq(registry.available(uint8(i)), 0);
        }
    }

    function test_lotSizeScalesSupply() public {
        BlindAuctionV2.CreateParams memory p = _params();
        p.supply = 1000e18;
        p.lotSize = 1e18;
        sale.mint(authority, 1000e18);
        uint256 id = _create(p);
        assertEq(auction.getAuction(id).supplyLots, 1000);
    }

    function test_rejectsTokens() public {
        BlindAuctionV2.CreateParams memory p = _params();
        p.saleToken = address(0);
        _expectCreateRevert(p, BlindAuctionV2.ZeroAddress.selector);
        p = _params();
        p.quoteToken = address(0);
        _expectCreateRevert(p, BlindAuctionV2.ZeroAddress.selector);
        p = _params();
        p.quoteToken = address(sale);
        _expectCreateRevert(p, BlindAuctionV2.SameToken.selector);
        p = _params();
        p.quoteToken = makeAddr("eoa");
        _expectCreateRevert(p, BlindAuctionV2.NotAContract.selector);
    }

    function test_rejectsSupplyAndLots() public {
        BlindAuctionV2.CreateParams memory p = _params();
        p.supply = 0;
        _expectCreateRevert(p, BlindAuctionV2.BadSupply.selector);
        p = _params();
        p.lotSize = 0;
        _expectCreateRevert(p, BlindAuctionV2.BadLot.selector);
        p = _params();
        p.lotSize = 3;
        _expectCreateRevert(p, BlindAuctionV2.BadLot.selector);
        p = _params();
        p.supply = uint256(type(uint96).max) + 1;
        _expectCreateRevert(p, BlindAuctionV2.BadLot.selector);
    }

    function test_rejectsLadder() public {
        BlindAuctionV2.CreateParams memory p = _params();
        p.stepCount = 0;
        _expectCreateRevert(p, BlindAuctionV2.BadGrid.selector);
        p = _params();
        p.stepCount = 65;
        _expectCreateRevert(p, BlindAuctionV2.BadGrid.selector);
        p = _params();
        p.minPrice = 0;
        _expectCreateRevert(p, BlindAuctionV2.BadGrid.selector);
        p = _params();
        p.stepSize = 0;
        _expectCreateRevert(p, BlindAuctionV2.BadGrid.selector);
        p = _params();
        p.minPrice = type(uint128).max;
        p.stepSize = 1;
        _expectCreateRevert(p, BlindAuctionV2.BadGrid.selector);
    }

    function test_singleStepAllowsZeroStepSize() public {
        BlindAuctionV2.CreateParams memory p = _params();
        p.stepCount = 1;
        p.stepSize = 0;
        uint256 id = _create(p);
        assertEq(auction.quotePrice(id, 0), 50);
    }

    function test_rejectsDeposit() public {
        BlindAuctionV2.CreateParams memory p = _params();
        p.deposit = 0;
        _expectCreateRevert(p, BlindAuctionV2.BadDeposit.selector);
        p = _params();
        p.maxNotional = 0;
        _expectCreateRevert(p, BlindAuctionV2.BadDeposit.selector);
        p = _params();
        p.deposit = uint256(type(uint128).max) + 1;
        _expectCreateRevert(p, BlindAuctionV2.BadDeposit.selector);
        p = _params();
        p.deposit = 49;
        _expectCreateRevert(p, BlindAuctionV2.BadDeposit.selector);
        p = _params();
        p.maxNotional = 49;
        _expectCreateRevert(p, BlindAuctionV2.BadDeposit.selector);
    }

    function test_rejectsMaxBids() public {
        BlindAuctionV2.CreateParams memory p = _params();
        p.maxBids = 0;
        _expectCreateRevert(p, BlindAuctionV2.BadBids.selector);
        p = _params();
        p.maxBids = 65_536;
        _expectCreateRevert(p, BlindAuctionV2.BadBids.selector);
    }

    function test_rejectsSchedule() public {
        BlindAuctionV2.CreateParams memory p = _params();
        p.commitStart = uint64(block.timestamp - 1);
        _expectCreateRevert(p, BlindAuctionV2.BadSchedule.selector);
        p = _params();
        p.commitDeadline = p.commitStart + 59;
        _expectCreateRevert(p, BlindAuctionV2.BadSchedule.selector);
        p = _params();
        p.commitDeadline = p.commitStart + 30 days + 1;
        _expectCreateRevert(p, BlindAuctionV2.BadSchedule.selector);
        p = _params();
        p.cancelAfter = p.commitDeadline + 10 minutes - 1;
        _expectCreateRevert(p, BlindAuctionV2.BadSchedule.selector);
        p = _params();
        p.cancelAfter = p.commitDeadline + 30 days + 1;
        _expectCreateRevert(p, BlindAuctionV2.BadSchedule.selector);
    }

    function test_rejectsSeedFieldsWithoutSeeding() public {
        BlindAuctionV2.CreateParams memory p = _params();
        p.kuruParams = hex"01";
        _expectCreateRevert(p, BlindAuctionV2.BadSeed.selector);
        p = _params();
        p.seedLockUntil = p.cancelAfter;
        _expectCreateRevert(p, BlindAuctionV2.BadSeed.selector);
    }

    function test_seedingNeedsASeeder() public {
        BlindAuctionV2.CreateParams memory p = _params();
        p.seedSaleLots = 1;
        p.seedLockUntil = p.cancelAfter;
        _expectCreateRevert(p, BlindAuctionV2.SeederNotSet.selector);
    }

    function test_needsKeeperKeys() public {
        vm.prank(authority);
        vm.expectRevert(KeeperRegistry.NoKeeperKeys.selector);
        auction.createAuction(_params());
    }

    /// Review finding: the registry's revert bubbled up with a selector missing from the auction's ABI, so the
    /// web app could not name it. The auction declares the same error, and its ABI now decodes it.
    function test_noKeeperKeysUsesASelectorInTheAuctionAbi() public {
        assertTrue(BlindAuctionV2.NoKeeperKeys.selector == KeeperRegistry.NoKeeperKeys.selector);
        vm.prank(authority);
        vm.expectRevert(BlindAuctionV2.NoKeeperKeys.selector);
        auction.createAuction(_params());
    }

    function test_feeOnTransferSaleTokenRejected() public {
        FeeToken token = new FeeToken();
        token.mint(authority, 1000);
        vm.prank(authority);
        token.approve(address(auction), 1000);
        BlindAuctionV2.CreateParams memory p = _params();
        p.saleToken = address(token);
        _expectCreateRevert(p, BlindAuctionV2.TransferFailed.selector);
    }
}
