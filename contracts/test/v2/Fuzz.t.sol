// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BlindAuctionV2} from "../../src/BlindAuctionV2.sol";
import {UniformClearing} from "../../src/UniformClearing.sol";
import {ClearingHarness} from "./Mocks.sol";
import {V2Base} from "./V2Base.sol";

contract FuzzTest is V2Base {
    ClearingHarness internal v1Clearing;

    function setUp() public override {
        super.setUp();
        v1Clearing = new ClearingHarness();
    }

    function testFuzz_matchesV1ClearingAndConservesFunds(uint256 seed, uint8 count, uint16 supply, uint8 pairChoice)
        public
    {
        count = uint8(bound(count, 1, 8));
        BlindAuctionV2.CreateParams memory p = _params();
        p.supply = bound(supply, 1, 5000);
        uint256 id = _create(p);

        address[] memory bidders = new address[](count);
        for (uint256 i = 0; i < count; ++i) {
            bidders[i] = address(uint160(0x1000 + i));
            uint256 step = uint256(keccak256(abi.encode(seed, i, "step"))) % 7; // 6 is off the ladder
            uint256 quantity = uint256(keccak256(abi.encode(seed, i, "qty"))) % 2001; // 0 is invalid
            _bid(id, bidders[i], step, quantity);
        }

        uint8 choice = pairChoice % 3;
        if (choice == 0) _close(id, 0, 1);
        else if (choice == 1) _close(id, 2, 0);
        else _close(id, 1, 2);
        _openAll(id);
        auction.settle(id);
        _tallyAll(id);

        (UniformClearing.Outcome memory ref, UniformClearing.Bid[] memory refBids) = _referenceClear(id, count, p);
        BlindAuctionV2.Auction memory a = auction.getAuction(id);
        assertEq(a.clearingStep, ref.clearingStep, "clearing step");
        assertEq(a.clearingPrice, ref.clearingPrice, "clearing price");

        uint256 dust;
        uint256 cursor;
        for (uint32 slot = 0; slot < count; ++slot) {
            uint256 ours = auction.allocationOf(id, bidders[slot]);
            uint256 theirs;
            if (auction.getBid(id, slot).counted) {
                theirs = refBids[cursor].allocation;
                ++cursor;
            }
            assertLe(ours, theirs, "never more than v1");
            assertLe(theirs - ours, 1, "at most one unit of dust per bid");
            dust += theirs - ours;
        }
        assertEq(a.totalSold + dust, ref.totalSold, "sold plus dust equals v1 sold");
        assertLe(a.totalSold, a.supplyLots);

        for (uint256 i = 0; i < count; ++i) {
            vm.prank(bidders[i]);
            auction.claim(id);
        }
        vm.prank(authority);
        auction.reclaim(id);
        assertEq(sale.balanceOf(address(auction)), 0, "no sale tokens left");
        assertEq(quote.balanceOf(address(auction)), 0, "no quote tokens left");
    }

    function _referenceClear(uint256 id, uint256 count, BlindAuctionV2.CreateParams memory p)
        internal
        view
        returns (UniformClearing.Outcome memory, UniformClearing.Bid[] memory)
    {
        uint256 counted;
        for (uint32 slot = 0; slot < count; ++slot) {
            if (auction.getBid(id, slot).counted) ++counted;
        }
        UniformClearing.Bid[] memory book = new UniformClearing.Bid[](counted);
        uint256 cursor;
        for (uint32 slot = 0; slot < count; ++slot) {
            BlindAuctionV2.Bid memory b = auction.getBid(id, slot);
            if (!b.counted) continue;
            book[cursor] = UniformClearing.Bid({slot: slot, priceStep: b.step, quantity: b.quantity, allocation: 0});
            ++cursor;
        }
        return v1Clearing.clear(p.supply, p.minPrice, p.stepSize, p.stepCount, book);
    }
}
