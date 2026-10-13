// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice The parts of Kuru (docs.kuru.io) that MarketSeeder uses, from the published ABIs
///         in github.com/Kuru-Labs/kuru-sdk/abi. Units, confirmed by the phase 0 spike:
///         price = human quote-per-base × pricePrecision, size = human base × sizePrecision.
interface IKuruRouter {
    /// @dev marketType 0 is ERC20/ERC20.
    function deployProxy(
        uint8 marketType,
        address baseAsset,
        address quoteAsset,
        uint96 sizePrecision,
        uint32 pricePrecision,
        uint32 tickSize,
        uint96 minSize,
        uint96 maxSize,
        uint256 takerFeeBps,
        uint256 makerFeeBps,
        uint96 kuruAmmSpread
    ) external returns (address);

    /// @dev The Router's record of a market it created; all zero for any other address. On Monad
    ///      mainnet only the Router's owner can call `deployProxy`, so this is how a market made
    ///      by Kuru is recognised.
    function verifiedMarket(address market)
        external
        view
        returns (
            uint32 pricePrecision,
            uint96 sizePrecision,
            address baseAsset,
            uint256 baseDecimals,
            address quoteAsset,
            uint256 quoteDecimals,
            uint32 tickSize,
            uint96 minSize,
            uint96 maxSize,
            uint256 takerFeeBps,
            uint256 makerFeeBps
        );
}

interface IKuruMarginAccount {
    function deposit(address user, address token, uint256 amount) external payable;
    function withdraw(uint256 amount, address token) external;
    function getBalance(address user, address token) external view returns (uint256);
}

interface IKuruOrderBook {
    function addBuyOrder(uint32 price, uint96 size, bool postOnly) external;
    function addSellOrder(uint32 price, uint96 size, bool postOnly) external;
    function batchCancelOrders(uint40[] calldata orderIds) external;
    /// @dev Id of the most recently created order; read right after posting to learn its id.
    function s_orderIdCounter() external view returns (uint40);
    function s_orders(uint40 orderId)
        external
        view
        returns (
            address owner,
            uint96 size,
            uint40 prev,
            uint40 next,
            uint40 flippedId,
            uint32 price,
            uint32 flippedPrice,
            bool isBuy
        );
}
