// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "hardhat/console.sol";

import "./ControllerStratAbs.sol";

contract ControllerCurveStrat is ControllerStratAbs {
    address constant public REWARD_TOKEN = address(0);

    constructor(IERC20Metadata _want, address _controller, address _exchange, address _treasury)
        ControllerStratAbs(_want, _controller, _exchange, _treasury) {}

    // function setWNativeSwapRoute(address[] calldata _route) external onlyAdmin {
    //     require(_route[0] == WNATIVE, "First route isn't wNative");
    //     require(_route[_route.length - 1] == BTC, "Last route isn't BTC");
    //     wNativeToBtcRoute = _route;
    // }

    function _deposit() internal override {
        // uint _balance = wantBalance();

        // if (_balance > 0) {
        //     uint[2] memory amounts = [_balance, 0];
        //     // uint btcCrvAmount = _wantToPoolTokenDoubleCheck(wantBal, true);

        //     // IERC20(BTC).safeApprove(CURVE_POOL, wantBal);
        //     // ICurvePool(CURVE_POOL).add_liquidity(amounts, btcCrvAmount, true);
        // }

        // uint _btcCRVBalance = btcCRVBalance();

        // if (_btcCRVBalance > 0) {
        //     // IERC20(BTCCRV).safeApprove(REWARDS_GAUGE, _btcCRVBalance);
        //     // IRewardsGauge(REWARDS_GAUGE).deposit(_btcCRVBalance);
        // }
    }

    function harvest() public nonReentrant override {
        uint _before = wantBalance();

        _claimRewards();
        _swapWMaticRewards();
        _swapCrvRewards();

        uint harvested = wantBalance() - _before;

        // Charge performance fee for earned want + rewards
        _beforeMovement();

        // re-deposit
        if (!paused()) { _deposit(); }

        // Update lastBalance for the next movement
        _afterMovement();

        emit Harvested(address(want), harvested);
    }

    /**
     * @dev Curve gauge claim_rewards claim WMatic & CRV tokens
     */
    function _claimRewards() internal {
        // IRewardsGauge(REWARDS_GAUGE).claim_rewards(address(this));
    }

    function _swapWMaticRewards() internal {
        // uint _balance = wNativeBalance();

        // if (_balance > 0) {
        //     // uint expected = _expectedForSwap(_balance, WNATIVE, BTC);

        //     // // BTC price is too high so sometimes it requires a lot of rewards to swap
        //     // if (expected > 1) {
        //     //     IERC20(WNATIVE).safeApprove(exchange, _balance);

        //     //     IUniswapRouter(exchange).swapExactTokensForTokens(
        //     //         _balance, expected, wNativeToBtcRoute, address(this), block.timestamp + 60
        //     //     );
        //     // }
        // }
    }

    function _swapCrvRewards() internal {
        // uint _balance = crvBalance();

        // if (_balance > 0) {
        //     // uint expected = _expectedForSwap(_balance, CRV, BTC);

        //     // // BTC price is too high so sometimes it requires a lot of rewards to swap
        //     // if (expected > 1) {

        //     //     IERC20(CRV).safeApprove(exchange, _balance);
        //     //     IUniswapRouter(exchange).swapExactTokensForTokens(
        //     //         _balance, expected, crvToBtcRoute, address(this), block.timestamp + 60
        //     //     );
        //     // }
        // }
    }

    // amount is the BTC expected to be withdrawn
    function _withdraw(uint _amount) internal override returns (uint) {
        return _amount;
        // uint btcCrvAmount;

        // To know how much we have to un-stake we use the same method to
        // calculate the expected BTCCRV at deposit
        // btcCrvAmount = _wantToPoolTokenDoubleCheck(_amount, false);

        // // Remove staked from gauge
        // IRewardsGauge(REWARDS_GAUGE).withdraw(btcCrvAmount);

        // // remove_liquidity
        // uint _balance = btcCRVBalance();
        // // Calculate at least xx% of the expected. The function doesn't
        // // consider the fee.
        // uint expected = (calc_withdraw_one_coin(_balance) * (RATIO_PRECISION - poolSlippageRatio)) / RATIO_PRECISION;

        // // Double check for expected value
        // // In this case we sum the poolMinVirtualPrice and divide by 1e10 because we want to swap BTCCRV => BTC
        // uint minExpected = _balance * (RATIO_PRECISION + poolMinVirtualPrice - poolSlippageRatio) / (RATIO_PRECISION * 1e10);
        // if (minExpected > expected) { expected = minExpected; }

        // require(expected > 0, "remove_liquidity expected = 0");

        // ICurvePool(CURVE_POOL).remove_liquidity_one_coin(_balance, 0,  expected, true);
    }

    function _minBtcToBtcCrv(uint _amount) internal view returns (uint) {
        // Based on virtual_price (poolMinVirtualPrice) and poolSlippageRatio
        // the expected amount is represented with 18 decimals as crvBtc token
        // so we have to add 10 decimals to the btc balance.
        // E.g. 1e8 (1BTC) * 1e10 * 99.4 / 100.0 => 0.994e18 BTCCRV tokens
        return _amount * 1e10 * (RATIO_PRECISION - poolSlippageRatio - poolMinVirtualPrice) / RATIO_PRECISION;
    }

    function _wantToPoolTokenDoubleCheck(uint _amount, bool _isDeposit) internal view returns (uint btcCrvAmount) {
        uint[2] memory amounts = [_amount, 0];
        // calc_token_amount doesn't consider fee
        // btcCrvAmount = ICurvePool(CURVE_POOL).calc_token_amount(amounts, _isDeposit);
        // // Remove max fee
        // btcCrvAmount = btcCrvAmount * (RATIO_PRECISION - poolSlippageRatio) / RATIO_PRECISION;

        // // In case the pool is unbalanced (attack), make a double check for
        // // the expected amount with minExpected set ratios.
        // uint wantToPoolToken = _minBtcToBtcCrv(_amount);

        // if (wantToPoolToken > btcCrvAmount) { btcCrvAmount = wantToPoolToken; }
    }

    function calc_withdraw_one_coin(uint _amount) public view returns (uint) {
        // if (_amount > 0) {
        //     return ICurvePool(CURVE_POOL).calc_withdraw_one_coin(_amount, 0);
        // } else {
        //     return 0;
        // }
    }
    function balanceOfPool() public view override returns (uint) {
        // return IRewardsGauge(REWARDS_GAUGE).balanceOf(address(this));
    }
    function balanceOfPoolInWant() public view override returns (uint) {
        return calc_withdraw_one_coin(balanceOfPool());
    }
}
