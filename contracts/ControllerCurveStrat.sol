// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "hardhat/console.sol";

import "../interfaces/IUniswapRouter.sol";
import "../interfaces/IChainLink.sol";

interface ICurvePool {
    // _use_underlying If True, withdraw underlying assets instead of aTokens
    function add_liquidity(uint[2] calldata amounts, uint min_mint_amount, bool _use_underlying) external;
    function remove_liquidity_one_coin(uint _token_amount, int128 i, uint _min_amount, bool _use_underlying) external returns (uint);
    function calc_withdraw_one_coin(uint _token_amount, int128 i) external view returns (uint);
    function calc_token_amount(uint[2] calldata _amounts, bool is_deposit) external view returns (uint);
}

interface IRewardsGauge {
    function balanceOf(address account) external view returns (uint);
    function claim_rewards(address _addr) external;
    function deposit(uint _value) external;
    function withdraw(uint _value) external;
}

contract ControllerCurveStrat is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant HARVEST_ROLE = keccak256("HARVEST_ROLE");

    // Test
    address public constant WNATIVE = address(0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f);
    address constant public BTC = address(0x6d925938Edb8A16B3035A4cF34FAA090f490202a);
    address constant public CRV = address(0xED8CAB8a931A4C0489ad3E3FB5BdEA84f74fD23E);
    address constant public ETH = address(0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f); // same than wNative
    address constant public BTCCRV = address(0x40bde52e6B80Ae11F34C58c14E1E7fE1f9c834C4); // same than CurvePool
    address constant public CURVE_POOL = address(0x40bde52e6B80Ae11F34C58c14E1E7fE1f9c834C4);
    address constant public REWARDS_GAUGE = address(0xE9061F92bA9A3D9ef3f4eb8456ac9E552B3Ff5C8);


    // Matic Polygon
    // address constant public WNATIVE = address(0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270);
    // address constant public BTC = address(0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6);
    // address constant public CRV = address(0x172370d5Cd63279eFa6d502DAB29171933a610AF);
    // address constant public ETH = address(0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619);
    // address constant public BTCCRV = address(0xf8a57c1d3b9629b77b6726a042ca48990A84Fb49);
    // address constant public CURVE_POOL = address(0xC2d95EEF97Ec6C17551d45e77B590dc1F9117C67);
    // address constant public REWARDS_GAUGE = address(0xffbACcE0CC7C19d46132f1258FC16CF6871D153c);

    // Pool settings
    uint public ratio_for_full_withdraw = 9000; // 90%
    uint public pool_slippage_ratio = 100; // 1%
    uint public swap_slippage_ratio = 100; // 1%

    // Routes
    address[] public wNativeToBtcRoute = [WNATIVE, ETH, BTC];
    address[] public crvToBtcRoute = [CRV, ETH, BTC];

    uint constant public RATIO_PRECISION = 10000; // 100%
    uint constant public SWAP_PRECISION = 1e9;

    // Fees
    uint constant public MAX_PERFORMANCE_FEE = 500; // 5% max
    uint public performanceFee = 350; // 3.5%


    address public treasury;
    address public exchange;
    address public immutable controller;

    // Chainlink addr
    IChainLink public wNativeFeed;
    IChainLink public btcFeed;
    IChainLink public crvFeed;

    constructor(address _controller, address _exchange, address _treasury) {
        require(_controller != address(0), "Controller can't be 0 address");
        require(_exchange != address(0), "Exchange can't be 0 address");
        require(_treasury != address(0), "Treasury can't be 0 address");

        controller = _controller;
        exchange = _exchange;
        treasury = _treasury;

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(HARVEST_ROLE, msg.sender);
        _setupRole(HARVEST_ROLE, _controller); // to retire strat
    }

    event NewTreasury(address old_treasury, address new_treasury);
    event NewExchange(address old_exchange, address new_exchange);
    event NewPerformanceFee(uint old_fee, uint new_fee);

    modifier onlyController() {
        require(msg.sender == controller, "Not from controller");
        _;
    }

    modifier onlyAdmin() {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Not an admin");
        _;
    }

    function setPriceFeeds(IChainLink _wNativeFeed, IChainLink _btcFeed, IChainLink _crvFeed) external onlyAdmin {
        (uint80 round,,,,) = _wNativeFeed.latestRoundData();
        require(round > 0, "Invalid wNative feed");
        (round,,,,) = _btcFeed.latestRoundData();
        require(round > 0, "Invalid btc feed");
        (round,,,,) = _crvFeed.latestRoundData();
        require(round > 0, "Invalid crv feed");

        wNativeFeed = _wNativeFeed;
        btcFeed = _btcFeed;
        crvFeed = _crvFeed;
    }

    function setTreasury(address _treasury) external onlyAdmin nonReentrant {
        require(_treasury != address(0), "!Zero address");
        emit NewTreasury(treasury, _treasury);

        treasury = _treasury;
    }

    function setExchange(address _exchange) external onlyAdmin nonReentrant {
        require(_exchange != address(0), "!Zero address");
        emit NewExchange(exchange, _exchange);

        exchange = _exchange;
    }

    function setWNativeSwapRoute(address[] calldata _route) external onlyAdmin {
        wNativeToBtcRoute = _route;
    }

    function setCrvSwapRoute(address[] calldata _route) external onlyAdmin {
        crvToBtcRoute = _route;
    }

    function setPerformanceFee(uint _fee) external onlyAdmin nonReentrant {
        require(_fee <= MAX_PERFORMANCE_FEE, "Fee is greater than expected");
        emit NewPerformanceFee(performanceFee, _fee);

        performanceFee = _fee;
    }

    function setPoolSlippageRatio(uint _ratio) public onlyAdmin {
        require(_ratio <= RATIO_PRECISION, "can't be more than 100%");
        pool_slippage_ratio = _ratio;
    }
    function setSwapSlippageRatio(uint _ratio) public onlyAdmin {
        require(_ratio <= RATIO_PRECISION, "can't be more than 100%");
        swap_slippage_ratio = _ratio;
    }
    function setRatioForFullWithdraw(uint _ratio) public onlyAdmin {
        require(_ratio <= RATIO_PRECISION, "can't be more than 100%");
        ratio_for_full_withdraw = _ratio;
    }

    function deposit() external whenNotPaused onlyController nonReentrant {
        _deposit();
    }

    function _deposit() internal {
        uint btcBal = btcBalance();

        if (btcBal > 0) {
            uint[2] memory amounts = [btcBal, 0];

            IERC20(BTC).safeApprove(CURVE_POOL, btcBal);

            uint expectedCrvAmount = ICurvePool(CURVE_POOL).calc_token_amount(amounts, true);

            expectedCrvAmount = (expectedCrvAmount * (RATIO_PRECISION - pool_slippage_ratio)) / RATIO_PRECISION;

            ICurvePool(CURVE_POOL).add_liquidity(amounts, expectedCrvAmount, true);
        }

        uint _btcCRVBalance = btcCRVBalance();

        if (_btcCRVBalance > 0) {
            IERC20(BTCCRV).safeApprove(REWARDS_GAUGE, _btcCRVBalance);
            IRewardsGauge(REWARDS_GAUGE).deposit(_btcCRVBalance);
        }
    }

    function withdraw(uint _amount) external onlyController nonReentrant returns (uint) {
        uint balance = btcBalance();

        if (balance < _amount) {
            uint poolBalance = balanceOfPoolInBtc();

            // If the requested amount is greater than xx% of the founds just withdraw everything
            if (_amount > (poolBalance * ratio_for_full_withdraw / RATIO_PRECISION)) {
                withdrawBtc(0, true);
            } else {
                withdrawBtc(_amount, false);
            }

            balance = btcBalance();

            if (balance < _amount) { _amount = balance; }
        }

        IERC20(BTC).safeTransfer(controller, _amount);

        // Redeposit
        if (!paused()) { _deposit(); }

        return _amount;
    }

    function harvest() public nonReentrant {
        uint _before = btcBalance();

        claimRewards();
        swapWMaticRewards();
        swapCrvRewards();

        uint harvested = btcBalance() - _before;

        chargeFees(harvested);

        // re-deposit
        if (!paused()) { _deposit(); }
    }

    /**
     * @dev Curve gauge claim_rewards claim WMatic & CRV tokens
     */
    function claimRewards() internal {
        IRewardsGauge(REWARDS_GAUGE).claim_rewards(address(this));
    }

    /**
     * @dev swap ratio explain
     * ratio is a 9 decimals ratio number calculated to get the minimum
     * amount of want-tokens. So the balance is multiplied by the ratio
     * and then divided by 9 decimals to get the same "precision".
     * Then the result should be divided for the decimal diff between tokens.
     * Oracle Price Feed has always 8 decimals.
     * E.g want is USDT with only 6 decimals:
     * tokenDiffPrecision = 1e21 ((1e18 MATIC decimals / 1e6 USDT decimals) * 1e9 ratio precision)
     * ratio = 1_507_423_500 ((152265000 * 1e9) / 100000000) * 99 / 100 [with 1.52 USDT/MATIC]
     * _balance = 1e18 (1.0 MATIC)
     * expected = 1507423 (1e18 * 1_507_423_500 / 1e21) [1.507 in USDT decimals]
     */
    function swapWMaticRewards() internal {
        uint balance = wNativeBalance();

        if (balance > 0) {
            // WNATIVE 18 decimals BTC => 8 decimals
            uint tokenDiffPrecision = (1e18 / 1e8) * SWAP_PRECISION;
            uint ratio = (
                (getPriceFor(WNATIVE) * SWAP_PRECISION) / getPriceFor(BTC)
            ) * (RATIO_PRECISION - swap_slippage_ratio) / RATIO_PRECISION;
            uint expected = balance * ratio / tokenDiffPrecision;

            console.log("SwapMatic balance: ", balance);
            console.log("SwapMatic prec: ", tokenDiffPrecision);
            console.log("SwapMatic ratio: ", ratio);
            console.log("SwapMatic expected: ", expected);

            // BTC price is too high so sometimes it requires a lot of rewards to swap
            if (expected > 1) {
                IERC20(WNATIVE).safeApprove(exchange, balance);

                IUniswapRouter(exchange).swapExactTokensForTokens(
                    balance, expected, wNativeToBtcRoute, address(this), block.timestamp + 60
                );
            }
        }
    }

    function swapCrvRewards() internal {
        uint balance = crvBalance();

        if (balance > 0) {
            // CRV 18 decimals BTC => 8 decimals
            uint tokenDiffPrecision = (1e18 / 1e8) * SWAP_PRECISION;
            uint ratio = (
                (getPriceFor(CRV) * SWAP_PRECISION) / getPriceFor(BTC)
            ) * (RATIO_PRECISION - swap_slippage_ratio) / RATIO_PRECISION;
            uint expected = balance * ratio / tokenDiffPrecision;

            IERC20(CRV).safeApprove(exchange, balance);

            IUniswapRouter(exchange).swapExactTokensForTokens(
                balance, expected, crvToBtcRoute, address(this), block.timestamp + 60
            );
        }
    }

    function getPriceFor(address _token) internal view returns (uint) {
        // This could be implemented with FeedRegistry but it's not available in polygon
        int256 price;
        if (_token == WNATIVE) {
            (, price,,,) = wNativeFeed.latestRoundData();
        } else if (_token == BTC) {
            (, price,,,) = btcFeed.latestRoundData();
        } else {
            (, price,,,) = crvFeed.latestRoundData();
        }

        return uint(price);
    }

    /**
     * @dev Takes out performance fee.
     */
    function chargeFees(uint _harvested) internal {
        uint fee = (_harvested * performanceFee) / RATIO_PRECISION;

        // Pay to treasury a percentage of the total reward claimed
        if (fee > 0) { IERC20(BTC).safeTransfer(treasury, fee); }
    }

    // amount is the BTC expected to be withdrawn
    function withdrawBtc(uint _amount, bool _maxWithdraw) internal {
        uint crvAmount;

        if (_maxWithdraw) {
            crvAmount = balanceOfPool();
        } else {
            // BTC has 8 decimals and crvBTC has 18, so we need a convertion to
            // withdraw the correct amount of crvBTC
            uint[2] memory amounts = [_amount, 0];
            crvAmount = ICurvePool(CURVE_POOL).calc_token_amount(amounts, false);
        }

        IRewardsGauge(REWARDS_GAUGE).withdraw(crvAmount);

        // remove_liquidity
        uint balance = btcCRVBalance();
        // Calculate at least xx% of the expected. The function doesn't
        // consider the fee.
        uint expected = (calc_withdraw_one_coin(balance) * (RATIO_PRECISION - pool_slippage_ratio)) / RATIO_PRECISION;
        require(expected > 0, "remove_liquidity should expect more than 0");

        ICurvePool(CURVE_POOL).remove_liquidity_one_coin(balance, 0,  expected, true);
    }

    function calc_withdraw_one_coin(uint _amount) public view returns (uint) {
        if (_amount > 0) {
            return ICurvePool(CURVE_POOL).calc_withdraw_one_coin(_amount, 0);
        } else {
            return 0;
        }
    }

    function btcBalance() public view returns (uint) {
        return IERC20(BTC).balanceOf(address(this));
    }
    function wNativeBalance() public view returns (uint) {
        return IERC20(WNATIVE).balanceOf(address(this));
    }
    function crvBalance() public view returns (uint) {
        return IERC20(CRV).balanceOf(address(this));
    }
    function btcCRVBalance() public view returns (uint) {
        return IERC20(BTCCRV).balanceOf(address(this));
    }
    function balanceOf() public view returns (uint) {
        return btcBalance() + balanceOfPoolInBtc();
    }
    function balanceOfPool() public view returns (uint) {
        return IRewardsGauge(REWARDS_GAUGE).balanceOf(address(this));
    }
    function balanceOfPoolInBtc() public view returns (uint) {
        return calc_withdraw_one_coin(balanceOfPool());
    }

    // called as part of strat migration. Sends all the available funds back to the vault.
    function retireStrat() external onlyController {
        _pause();

        // max withdraw can fail if not staked (in case of panic)
        if (balanceOfPoolInBtc() > 0) { withdrawBtc(0, true); }

        harvest();

        IERC20(BTC).safeTransfer(controller, btcBalance());
    }

    // pauses deposits and withdraws all funds from third party systems.
    function panic() external onlyAdmin nonReentrant {
        withdrawBtc(0, true); // max withdraw
        pause();
    }

    function pause() public onlyAdmin {
        _pause();
    }

    function unpause() external onlyAdmin nonReentrant {
        _unpause();

        _deposit();
    }
}
