// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";

interface IKuruRouter {
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
}

interface IKuruMarginAccount {
    function deposit(address user, address token, uint256 amount) external payable;
    function withdraw(uint256 amount, address token) external;
}

interface IKuruOrderBook {
    function addBuyOrder(uint32 price, uint96 size, bool postOnly) external;
    function addSellOrder(uint32 price, uint96 size, bool postOnly) external;
    function batchCancelOrders(uint40[] calldata orderIds) external;
    function bestBidAsk() external view returns (uint256, uint256);
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

contract SpikeToken {
    string public name;
    string public symbol;
    uint8 public immutable decimals;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory name_, string memory symbol_, uint8 decimals_) {
        name = name_;
        symbol = symbol_;
        decimals = decimals_;
    }

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}

/// @dev Stands in for MarketSeeder: a contract, not an EOA, does every Kuru call.
contract SpikeTrader {
    IKuruMarginAccount public immutable margin;

    constructor(IKuruMarginAccount margin_) {
        margin = margin_;
    }

    function deploy(IKuruRouter router, address base, address quote) external returns (address) {
        return router.deployProxy(0, base, quote, 1e8, 1e4, 1, 1e6, 1e16, 0, 0, 100);
    }

    function deposit(SpikeToken token, uint256 amount) external {
        token.approve(address(margin), amount);
        margin.deposit(address(this), address(token), amount);
    }

    function sell(IKuruOrderBook book, uint32 price, uint96 size) external {
        book.addSellOrder(price, size, true);
    }

    function buy(IKuruOrderBook book, uint32 price, uint96 size) external {
        book.addBuyOrder(price, size, false);
    }

    function withdraw(SpikeToken token, uint256 amount) external {
        margin.withdraw(amount, address(token));
    }

    function cancel(IKuruOrderBook book, uint40 orderId) external {
        uint40[] memory ids = new uint40[](1);
        ids[0] = orderId;
        book.batchCancelOrders(ids);
    }
}


/// @notice Kuru's Router and MarginAccount on the forked network (docs.kuru.io/contracts/Contract-addresses).
///         The fork tests run against testnet or mainnet, whichever `KURU_FORK_RPC` (or the older
///         `MONAD_TESTNET_RPC`) points at; they are skipped when neither is set.
library KuruFork {
    function rpc(Vm vm) internal view returns (string memory) {
        return vm.envOr("KURU_FORK_RPC", vm.envOr("MONAD_TESTNET_RPC", string("")));
    }

    function addresses() internal view returns (address router, address margin) {
        if (block.chainid == 10143) return (0x7EFbE105Ca7415dE98F96622173458ac1c054630, 0xd029C2D98ff85D8F64799017fE00a59B1159CE02);
        if (block.chainid == 143) return (0xd651346d7c789536ebf06dc72aE3C8502cd695CC, 0x2A68ba1833cDf93fa9Da1EEbd7F46242aD8E90c5);
        revert("KuruFork: no Kuru addresses for this chain");
    }
}

contract KuruSpikeTest is Test {
    IKuruRouter internal kuruRouter;
    IKuruMarginAccount internal kuruMargin;

    function setUp() public {
        string memory rpc = KuruFork.rpc(vm);
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc);
        (address router, address margin) = KuruFork.addresses();
        kuruRouter = IKuruRouter(router);
        kuruMargin = IKuruMarginAccount(margin);
    }

    /// Testnet lets any contract create a market; on mainnet only the Router's owner may, so the
    /// fork test creates it as the owner there (trading in it is open to everyone either way).
    function _newMarket(SpikeTrader trader, address base, address quote) internal returns (address) {
        if (block.chainid != 143) return trader.deploy(kuruRouter, base, quote);
        (, bytes memory owner) = address(kuruRouter).staticcall(abi.encodeWithSignature("owner()"));
        vm.prank(abi.decode(owner, (address)));
        return kuruRouter.deployProxy(0, base, quote, 1e8, 1e4, 1, 1e6, 1e16, 0, 0, 100);
    }

    /// Price 2.5 quote per base: 25_000 at pricePrecision 1e4.
    /// Size 10 base: 10 * 1e8 at sizePrecision 1e8.
    /// Expected fill: seller receives 25 quote = 25e6 base units; buyer receives 10e18 base units.
    function test_contractCanDeployDepositPostAndFill() public {
        SpikeToken base = new SpikeToken("Spike Base", "SBASE", 18);
        SpikeToken quote = new SpikeToken("Spike Quote", "SQUOTE", 6);
        SpikeTrader seller = new SpikeTrader(kuruMargin);
        SpikeTrader buyer = new SpikeTrader(kuruMargin);

        address market = _newMarket(seller, address(base), address(quote));
        console2.log("market", market);
        assertTrue(market != address(0), "deployProxy from a contract");

        base.mint(address(seller), 10e18);
        seller.deposit(base, 10e18);
        seller.sell(IKuruOrderBook(market), 25_000, 10e8);

        quote.mint(address(buyer), 25e6);
        buyer.deposit(quote, 25e6);
        buyer.buy(IKuruOrderBook(market), 25_000, 10e8);

        seller.withdraw(quote, 25e6);
        buyer.withdraw(base, 10e18);
        assertEq(quote.balanceOf(address(seller)), 25e6, "seller got quote in human-units * precision encoding");
        assertEq(base.balanceOf(address(buyer)), 10e18, "buyer got base");
    }

    /// Order ids: a contract reads its new order's id from s_orderIdCounter, checks it with
    /// s_orders, cancels it and gets the full deposit back.
    function test_contractCanCancelItsOwnRestingOrder() public {
        SpikeToken base = new SpikeToken("Spike Base", "SBASE", 18);
        SpikeToken quote = new SpikeToken("Spike Quote", "SQUOTE", 6);
        SpikeTrader seller = new SpikeTrader(kuruMargin);
        IKuruOrderBook book = IKuruOrderBook(_newMarket(seller, address(base), address(quote)));

        base.mint(address(seller), 10e18);
        seller.deposit(base, 10e18);
        seller.sell(book, 25_000, 10e8);

        uint40 orderId = book.s_orderIdCounter();
        (address owner, uint96 size,,,, uint32 price,, bool isBuy) = book.s_orders(orderId);
        console2.log("order id", orderId);
        assertEq(owner, address(seller), "owner");
        assertEq(size, 10e8, "size");
        assertEq(price, 25_000, "price");
        assertFalse(isBuy, "side");
        (uint256 bid, uint256 ask) = book.bestBidAsk();
        console2.log("best bid", bid);
        console2.log("best ask", ask);

        seller.cancel(book, orderId);
        seller.withdraw(base, 10e18);
        assertEq(base.balanceOf(address(seller)), 10e18, "deposit returned after cancel");
    }
}
