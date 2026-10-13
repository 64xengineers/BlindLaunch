// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Secp256k1} from "./Secp256k1.sol";

/// @title KeeperRegistry
/// @notice Three keepers each keep a FIFO queue of fresh public keys. Every new auction
///         consumes one key per keeper, so publishing a key for one auction reveals
///         nothing about any other auction.
contract KeeperRegistry {
    error NotKeeper();
    error BadKeeper();
    error BadPoint();
    error NotAuction();
    error NotDeployer();
    error AuctionAlreadySet();
    error NoKeeperKeys();

    event KeysEnqueued(uint8 indexed keeper, uint256 count);
    event KeyConsumed(uint8 indexed keeper, uint256 indexed auctionId, uint256 x, uint256 y);
    event OwnerChanged(uint8 indexed keeper, address owner);
    event AuctionSet(address auction);

    address public immutable deployer;
    address public auction;
    address[3] public owners;

    mapping(uint8 => Secp256k1.Point[]) internal _queue;
    mapping(uint8 => uint256) public head;

    constructor(address[3] memory owners_) {
        deployer = msg.sender;
        owners = owners_;
    }

    function setAuction(address auction_) external {
        if (msg.sender != deployer) revert NotDeployer();
        if (auction != address(0)) revert AuctionAlreadySet();
        auction = auction_;
        emit AuctionSet(auction_);
    }

    function setOwner(uint8 keeper, address owner) external {
        if (keeper > 2) revert BadKeeper();
        if (msg.sender != owners[keeper]) revert NotKeeper();
        owners[keeper] = owner;
        emit OwnerChanged(keeper, owner);
    }

    function enqueue(uint8 keeper, Secp256k1.Point[] calldata keys) external {
        if (keeper > 2) revert BadKeeper();
        if (msg.sender != owners[keeper]) revert NotKeeper();
        Secp256k1.Point[] storage queue = _queue[keeper];
        for (uint256 i = 0; i < keys.length; ++i) {
            Secp256k1.Point memory key = keys[i];
            if (!Secp256k1.isValid(key)) revert BadPoint();
            queue.push(key);
        }
        emit KeysEnqueued(keeper, keys.length);
    }

    function available(uint8 keeper) external view returns (uint256) {
        return _queue[keeper].length - head[keeper];
    }

    function consume(uint8 keeper, uint256 auctionId) external returns (Secp256k1.Point memory key) {
        if (msg.sender != auction) revert NotAuction();
        uint256 next = head[keeper];
        if (next >= _queue[keeper].length) revert NoKeeperKeys();
        key = _queue[keeper][next];
        head[keeper] = next + 1;
        emit KeyConsumed(keeper, auctionId, key.x, key.y);
    }
}
