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
    address public constant WMATIC = address(0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f);
    address constant public BTC = address(0x6d925938Edb8A16B3035A4cF34FAA090f490202a);
    address constant public CRV = address(0xED8CAB8a931A4C0489ad3E3FB5BdEA84f74fD23E);
    address constant public ETH = address(0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f); // same than wmatic
    address constant public BTCCRV = address(0xC2d95EEF97Ec6C17551d45e77B590dc1F9117C67); // same than CurvePool
    address constant public CURVE_POOL = address(0xC2d95EEF97Ec6C17551d45e77B590dc1F9117C67);
    address constant public REWARDS_GAUGE = address(0xffbACcE0CC7C19d46132f1258FC16CF6871D153c);


    // Matic Polygon
    // address constant public WMATIC = address(0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270);
    // address constant public BTC = address(0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6);
    // address constant public CRV = address(0x172370d5Cd63279eFa6d502DAB29171933a610AF);
    // address constant public ETH = address(0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619);
    // address constant public BTCCRV = address(0xf8a57c1d3b9629b77b6726a042ca48990A84Fb49);
    // address constant public CURVE_POOL = address(0xC2d95EEF97Ec6C17551d45e77B590dc1F9117C67);
    // address constant public REWARDS_GAUGE = address(0xffbACcE0CC7C19d46132f1258FC16CF6871D153c);

    // Routes
    address[] public wmaticToBtcRoute = [WMATIC, ETH, BTC];
    address[] public crvToBtcRoute = [CRV, ETH, BTC];

    // Fees
    uint constant public FEE_MAX = 10000;
    uint public performanceFee = 350; // 3.5%

    address public treasury;
    address public exchange;
    address public immutable controller;

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
        _giveAllowances();
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

    function setTreasury(address _treasury) external onlyAdmin nonReentrant {
        emit NewTreasury(treasury, _treasury);

        treasury = _treasury;
    }

    function setExchange(address _exchange) external onlyAdmin nonReentrant {
        emit NewExchange(exchange, _exchange);

        // Revoke current exchange
        IERC20(WMATIC).safeApprove(exchange, 0);
        IERC20(CRV).safeApprove(exchange, 0);

        exchange = _exchange;
        IERC20(WMATIC).safeApprove(exchange, type(uint).max);
        IERC20(CRV).safeApprove(exchange, type(uint).max);
    }

    function setWmaticSwapRoute(address[] calldata _route) external onlyAdmin {
        wmaticToBtcRoute = _route;
    }

    function setCrvSwapRoute(address[] calldata _route) external onlyAdmin {
        crvToBtcRoute = _route;
    }

    function setPerformanceFee(uint _fee) external onlyAdmin nonReentrant {
        emit NewPerformanceFee(performanceFee, _fee);

        performanceFee = _fee;
    }

    function addHarvester(address newHarvester) external onlyAdmin nonReentrant {
        _setupRole(HARVEST_ROLE, newHarvester);
    }

    function deposit() external whenNotPaused onlyController nonReentrant {
        _deposit();
    }

    function _deposit() internal {
        uint btcBal = btcBalance();
        if (btcBal > 0) {
            uint[2] memory amounts = [btcBal, 0];

            ICurvePool(CURVE_POOL).add_liquidity(amounts, 0, true);
        }

        uint _btcCRVBalance = btcCRVBalance();
        if (_btcCRVBalance > 0) {
            IRewardsGauge(REWARDS_GAUGE).deposit(_btcCRVBalance);
        }
    }

    function withdraw(uint _amount) external onlyController nonReentrant {
        uint balance = btcBalance();

        if (balance < _amount) {
            uint poolBalance = balanceOfPoolInBtc();

            // If the requested amount is greater than 90% of the founds just withdraw everything
            if (_amount > (poolBalance * 90 / 100)) {
                withdrawBtc(0, true);
            } else {
                withdrawBtc(_amount, false);
            }

            balance = btcBalance();
            if (balance < _amount) {
                _amount = balance;
            }
        }

        IERC20(BTC).safeTransfer(controller, _amount);

        if (!paused()) {
            _deposit();
        }
    }

    // _maticToWantRatio is a pre-calculated ratio to prevent
    // sandwich attacks
    function harvest(uint _wmaticToBtc, uint _crvToBtc) public nonReentrant {
        require(hasRole(HARVEST_ROLE, msg.sender), "Only harvest role");
        uint _before = btcBalance();

        claimRewards();
        swapWMaticRewards(_wmaticToBtc);
        swapCrvRewards(_crvToBtc);

        uint harvested = btcBalance() - _before;

        chargeFees(harvested);

        if (!paused()) {
            // re-deposit
            _deposit();
        }
    }

    /**
     * @dev Curve gauge claim_rewards claim WMatic & CRV tokens
     */
    function claimRewards() internal {
        IRewardsGauge(REWARDS_GAUGE).claim_rewards(address(this));
    }

    /**
     * @dev swap ratio explain
     * _wmaticToBtc/_crvToBtc is a 9 decimals ratio number calculated by the
     * caller before call harvest to get the minimum amount of want-tokens.
     * So the balance is multiplied by the ratio and then divided by 9 decimals
     * to get the same "precision". Then the result should be divided for the
     * decimal diff between tokens.
     * E.g want is BTC with only 8 decimals:
     * _wmaticToBtc = 32_000 (0.000032 BTC/WMATIC)
     * balance = 1e18 (1.0 MATIC)
     * tokenDiffPrecision = 1e19 ((1e18 WMATIC decimals / 1e8 BTC decimals) * 1e9 ratio precision)
     * expected = 3_200 (1e18 * 32_000 / 1e19) [0.000032 in BTC decimals]
     */
    function swapWMaticRewards(uint _wmaticToBtc) internal {
        uint balance = wmaticBalance();

        if (balance > 0) {
            // tokenDiffPrecision = 1e19 for Wmatic => BTC
            uint expected = (balance * _wmaticToBtc) / 1e19;

            IUniswapRouter(exchange).swapExactTokensForTokens(
                balance, expected, wmaticToBtcRoute, address(this), block.timestamp + 60
            );
        }
    }

    function swapCrvRewards(uint _crvToBtc) internal {
        uint balance = crvBalance();

        if (balance > 0) {
            // tokenDiffPrecision = 1e19 for Crv => BTC
            uint expected = (balance * _crvToBtc) / 1e19;

            IUniswapRouter(exchange).swapExactTokensForTokens(
                balance, expected, crvToBtcRoute, address(this), block.timestamp + 60
            );
        }
    }

    /**
     * @dev Takes out performance fee.
     */
    function chargeFees(uint _harvested) internal {
        uint fee = (_harvested * performanceFee) / FEE_MAX;

        if (fee > 0) {
            // Pay to treasury a percentage of the total reward claimed
            IERC20(BTC).safeTransfer(treasury, fee);
        }
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
        // Calculate at least 95% of the expected. The function doesn't
        // consider the fee.
        uint expected = (calc_withdraw_one_coin(balance) * 95) / 100;

        ICurvePool(CURVE_POOL).remove_liquidity_one_coin(
            balance, 0,  expected, true
        );
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
    function wmaticBalance() public view returns (uint) {
        return IERC20(WMATIC).balanceOf(address(this));
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

        withdrawBtc(0, true); // max withdraw
        harvest(0, 0);

        IERC20(BTC).safeTransfer(controller, btcBalance());

        _removeAllowances();
    }

    // pauses deposits and withdraws all funds from third party systems.
    function panic() external onlyAdmin nonReentrant {
        withdrawBtc(0, true); // max withdraw
        pause();
    }

    function pause() public onlyAdmin {
        _pause();

        _removeAllowances();
    }

    function unpause() external onlyAdmin nonReentrant {
        _unpause();

        _giveAllowances();

        _deposit();
    }

    function _giveAllowances() internal {
        IERC20(BTC).safeApprove(CURVE_POOL, type(uint).max);
        IERC20(BTCCRV).safeApprove(REWARDS_GAUGE, type(uint).max);
        IERC20(WMATIC).safeApprove(exchange, type(uint).max);
        IERC20(CRV).safeApprove(exchange, type(uint).max);
    }

    function _removeAllowances() internal {
        IERC20(BTC).safeApprove(CURVE_POOL, 0);
        IERC20(BTCCRV).safeApprove(REWARDS_GAUGE, 0);
        IERC20(WMATIC).safeApprove(exchange, 0);
        IERC20(CRV).safeApprove(exchange, 0);
    }
}
