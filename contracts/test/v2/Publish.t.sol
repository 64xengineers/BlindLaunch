// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BlindAuctionV2} from "../../src/BlindAuctionV2.sol";
import {V2Base} from "./V2Base.sol";

contract PublishTest is V2Base {
    event KeyPublished(uint256 indexed auctionId, uint8 keeper);

    function test_notBeforeDeadline() public {
        uint256 id = _create();
        vm.expectRevert(BlindAuctionV2.TooEarly.selector);
        _publish(id, 0);
    }

    function test_notAtOrAfterCancelAfter() public {
        uint256 id = _create();
        vm.warp(auction.getAuction(id).cancelAfter);
        vm.expectRevert(BlindAuctionV2.TooLate.selector);
        _publish(id, 0);
    }

    function test_checksTheKey() public {
        uint256 id = _create();
        vm.warp(auction.getAuction(id).commitDeadline);
        vm.expectRevert(BlindAuctionV2.BadKey.selector);
        auction.publishKey(id, 0, secretsOf[id][1]);
        vm.expectRevert(BlindAuctionV2.BadKeeper.selector);
        auction.publishKey(id, 3, secretsOf[id][0]);
    }

    function test_anyoneWithTheSecretCanPublish() public {
        uint256 id = _create();
        vm.warp(auction.getAuction(id).commitDeadline);
        vm.prank(makeAddr("stranger"));
        vm.expectEmit(address(auction));
        emit KeyPublished(id, 2);
        _publish(id, 2);
        assertEq(auction.publishedKeysOf(id)[2], secretsOf[id][2]);
    }

    function test_noDoublePublishAndNoThirdKey() public {
        uint256 id = _create();
        vm.warp(auction.getAuction(id).commitDeadline);
        _publish(id, 1);
        vm.expectRevert(BlindAuctionV2.AlreadyPublished.selector);
        _publish(id, 1);
        _publish(id, 0);
        vm.expectRevert(BlindAuctionV2.KeysComplete.selector);
        _publish(id, 2);
    }

    function test_secondPublicationFreezesTheSortedPair() public {
        uint256 id = _create();
        vm.warp(auction.getAuction(id).commitDeadline);
        _publish(id, 2);
        _publish(id, 0);
        BlindAuctionV2.Auction memory a = auction.getAuction(id);
        assertEq(a.publishedCount, 2);
        assertEq(a.pairA, 0);
        assertEq(a.pairB, 2);
    }

    function test_notAfterCancel() public {
        uint256 id = _create();
        vm.warp(auction.getAuction(id).cancelAfter);
        auction.cancel(id);
        vm.expectRevert(BlindAuctionV2.NotOpen.selector);
        _publish(id, 0);
    }
}
