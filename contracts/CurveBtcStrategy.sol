// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

interface IController {
    function vaults(address) external view returns (address);
}

interface IUniswapRouter {
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);
}

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

contract CurveBtcStrategy is Ownable, Pausable {
    using SafeERC20 for IERC20;
    using Address for address;

    address constant public wmatic = address(0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270);
    address constant public btc = address(0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6);
    address constant public crv = address(0x172370d5Cd63279eFa6d502DAB29171933a610AF);
    address constant public eth = address(0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619);
    address constant public btcCRV = address(0xf8a57c1d3b9629b77b6726a042ca48990A84Fb49);
    address constant public curvePool = address(0xC2d95EEF97Ec6C17551d45e77B590dc1F9117C67);
    address constant public rewardsGauge = address(0xffbACcE0CC7C19d46132f1258FC16CF6871D153c);

    // Routes
    address[] public wmaticToBtcRoute = [wmatic, eth, btc];
    address[] public crvToBtcRoute = [crv, eth, btc];

    address public controller;
    address public treasury;
    address public exchange;

    // Fees
    uint constant public FEE_MAX = 10000;
    uint constant public PERFORMANCE_FEE = 350; // 3.5%
    uint constant public MAX_WITHDRAW_FEE = 100; // 1%
    uint public withdrawFee = 10; // 0.1%

    constructor(
        address _controller,
        address _exchange
    ) {
        require(_controller != address(0), "controller zero address");
        require(IController(_controller).vaults(btc) != address(0), "Controller vault zero address");

        controller = _controller;
        exchange = _exchange;
        treasury = msg.sender;

        _giveAllowances();
    }

    modifier onlyController() {
        require(msg.sender == controller, "!controller");
        _;
    }

    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
    }

    function setExchange(address _exchange) external onlyOwner {
        // Revoke current exchange
        IERC20(wmatic).safeApprove(exchange, 0);
        IERC20(crv).safeApprove(exchange, 0);

        exchange = _exchange;
        IERC20(wmatic).safeApprove(exchange, type(uint).max);
        IERC20(crv).safeApprove(exchange, type(uint).max);
    }

    // `withdrawFee` can't be more than 1%
    function setWithdrawFee(uint _fee) external onlyOwner {
        require(_fee <= MAX_WITHDRAW_FEE, "!cap");

        withdrawFee = _fee;
    }

    function setWmaticSwapRoute(address[] calldata _route) external onlyOwner {
        wmaticToBtcRoute = _route;
    }
    function setCrvSwapRoute(address[] calldata _route) external onlyOwner {
        crvToBtcRoute = _route;
    }

    function btcBalance() public view returns (uint) {
        return IERC20(btc).balanceOf(address(this));
    }
    function wmaticBalance() public view returns (uint) {
        return IERC20(wmatic).balanceOf(address(this));
    }
    function crvBalance() public view returns (uint) {
        return IERC20(crv).balanceOf(address(this));
    }
    function btcCRVBalance() public view returns (uint) {
        return IERC20(btcCRV).balanceOf(address(this));
    }
    function balanceOf() public view returns (uint) {
        return btcBalance() + balanceOfPoolInBtc();
    }
    function balanceOfPool() public view returns (uint) {
        return IRewardsGauge(rewardsGauge).balanceOf(address(this));
    }
    function balanceOfPoolInBtc() public view returns (uint) {
        return calc_withdraw_one_coin(balanceOfPool());
    }
    function vault() public view returns (address) {
        return IController(controller).vaults(btc);
    }

    function deposit() public whenNotPaused {
        uint btcBal = btcBalance();
        if (btcBal > 0) {
            uint[2] memory amounts = [btcBal, 0];

            ICurvePool(curvePool).add_liquidity(amounts, 0, true);
        }

        uint _btcCRVBalance = btcCRVBalance();
        if (_btcCRVBalance > 0) {
            IRewardsGauge(rewardsGauge).deposit(_btcCRVBalance);
        }
    }

    // Withdraw partial funds, normally used with a vault withdrawal
    function withdraw(uint _amount) external onlyController {
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

        if (tx.origin == owner()) {
            // Yield balancer
            IERC20(btc).safeTransfer(vault(), _amount);
        } else {
            uint withdrawalFee = (_amount * withdrawFee) / FEE_MAX;
            IERC20(btc).safeTransfer(vault(), _amount - withdrawalFee);
            IERC20(btc).safeTransfer(treasury, withdrawalFee);
        }

        if (!paused()) {
            deposit();
        }
    }

    // _wmaticToBtc & _crvToBtc is a pre-calculated ratio to prevent
    // sandwich attacks
    function harvest(uint _wmaticToBtc, uint _crvToBtc) public {
        require(
            _msgSender() == owner() || _msgSender() == controller,
            "Owner or controller only"
        );

        uint _before = btcBalance();

        claimRewards();
        swapWMaticRewards(_wmaticToBtc);
        swapCrvRewards(_crvToBtc);

        uint harvested = btcBalance() - _before;

        chargeFees(harvested);

        if (!paused()) {
            // re-deposit
            deposit();
        }
    }

    /**
     * @dev Curve gauge claim_rewards claim WMatic & CRV tokens
     */
    function claimRewards() internal {
        IRewardsGauge(rewardsGauge).claim_rewards(address(this));
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
     * @dev Takes out 3.5% performance fee.
     */
    function chargeFees(uint _harvested) internal {
        uint performanceFee = (_harvested * PERFORMANCE_FEE) / FEE_MAX;

        if (performanceFee > 0) {
            // Pay to treasury 3.5% of the total reward claimed
            IERC20(btc).safeTransfer(treasury, performanceFee);
        }
    }

    // amount is the btc expected to be withdrawn
    function withdrawBtc(uint _amount, bool _maxWithdraw) internal {
        uint crvAmount;

        if (_maxWithdraw) {
            crvAmount = balanceOfPool();
        } else {
            // BTC has 8 decimals and crvBTC has 18, so we need a convertion to
            // withdraw the correct amount of crvBTC
            uint[2] memory amounts = [_amount, 0];
            crvAmount = ICurvePool(curvePool).calc_token_amount(amounts, false);
        }

        IRewardsGauge(rewardsGauge).withdraw(crvAmount);

        // remove_liquidity
        uint balance = btcCRVBalance();
        // Calculate at least 95% of the expected. The function doesn't
        // consider the fee.
        uint expected = (calc_withdraw_one_coin(balance) * 95) / 100;

        ICurvePool(curvePool).remove_liquidity_one_coin(
            balance, 0,  expected, true
        );
    }

    function calc_withdraw_one_coin(uint _amount) public view returns (uint) {
        if (_amount > 0) {
            return ICurvePool(curvePool).calc_withdraw_one_coin(_amount, 0);
        } else {
            return 0;
        }
    }

    // called as part of strat migration. Sends all the available funds back to the vault.
    function retireStrat() external onlyController {
        _pause();
        withdrawBtc(0, true); // max withdraw
        harvest(0, 0);
        IERC20(btc).transfer(vault(), btcBalance());
        _removeAllowances();
    }

    // pauses deposits and withdraws all funds from third party systems.
    function panic() public onlyOwner {
        withdrawBtc(0, true); // max withdraw
        pause();
    }

    function pause() public onlyOwner {
        _pause();

        _removeAllowances();
    }

    function unpause() external onlyOwner {
        _unpause();

        _giveAllowances();

        deposit();
    }

    function _giveAllowances() internal {
        IERC20(btc).safeApprove(curvePool, type(uint).max);
        IERC20(btcCRV).safeApprove(rewardsGauge, type(uint).max);
        IERC20(wmatic).safeApprove(exchange, type(uint).max);
        IERC20(crv).safeApprove(exchange, type(uint).max);
    }

    function _removeAllowances() internal {
        IERC20(btc).safeApprove(curvePool, 0);
        IERC20(btcCRV).safeApprove(rewardsGauge, 0);
        IERC20(wmatic).safeApprove(exchange, 0);
        IERC20(crv).safeApprove(exchange, 0);
    }
}
