// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

import "./ControllerStratAbs.sol";
import "../interfaces/ICurve.sol";

contract ControllerCurveStableStrat is ControllerStratAbs {
    using SafeERC20 for IERC20;
    using SafeERC20 for IERC20Metadata;

    address constant public CRV_TOKEN = address(0xC25a3A3b969415c80451098fa907EC722572917F);
    address constant public POOL = address(0xFCBa3E75865d2d561BE8D220616520c171F12851);
    address constant public SWAP_POOL = address(0xA5407eAE9Ba41422680e2e00537571bcC53efBfD);
    address constant public GAUGE = address(0xA90996896660DEcC6E997655E065b23788857849);
    address constant public GAUGE_FACTORY = address(0xd061D61a4d941c39E5453435B6345Dc261C2fcE0);

    uint private constant TOKENS_COUNT = 4; // sUSD/DAI/USDT/USDC pool
    int128 private immutable tokenIndex; // want token index in the pool

    constructor(
        IERC20Metadata _want,
        address _controller,
        address _exchange,
        address _treasury
    ) ControllerStratAbs(_want, _controller, _exchange, _treasury) {
        uint i = 0;

        for (i; i < TOKENS_COUNT; i++) {
            int128 index = int128(uint128(i));

            if (address(want) == ICurveStablePool(POOL).coins(index)) {
                break;
            }
        }

        tokenIndex = int128(uint128(i));
    }

    function identifier() external view returns (string memory) {
        return string(abi.encodePacked(want.symbol(), "@Curve#1.0.0"));
    }

    function _deposit() internal override {
        uint wantBal = wantBalance();

        if (wantBal > 0) {
            uint wantCrvAmount = _wantToWantCrvDoubleCheck(wantBal, true);
            uint[TOKENS_COUNT] memory amounts;

            amounts[uint(uint128(tokenIndex))] = wantBal;

            want.safeApprove(POOL, wantBal);
            ICurveStablePool(POOL).add_liquidity(amounts, wantCrvAmount);
        }

        uint _wantCRVBalance = wantCRVBalance();

        if (_wantCRVBalance > 0) {
            IERC20(CRV_TOKEN).safeApprove(GAUGE, _wantCRVBalance);
            ICurveGauge(GAUGE).deposit(_wantCRVBalance);
        }
    }

    function _withdraw(uint _amount) internal override returns (uint) {
        uint _balance = wantBalance();

        if (_balance < _amount) {
            _withdrawFromPool(
                _wantToWantCrvDoubleCheck(_amount - _balance, false)
            );

        }

        uint withdrawn = wantBalance() - _balance;

        return (withdrawn > _amount) ? _amount : withdrawn;
    }

    function _withdrawAll() internal override returns (uint) {
        uint _balance = wantBalance();

        _withdrawFromPool(balanceOfPool());

        return wantBalance() - _balance;
    }

    function _withdrawFromPool(uint wantCrvAmount) internal {
        // Remove staked from gauge
        ICurveGauge(GAUGE).withdraw(wantCrvAmount);

        // remove_liquidity
        uint _balance = wantCRVBalance();
        uint expected = _wantCrvToWantDoubleCheck(_balance);

        require(expected > 0, "remove_liquidity expected = 0");

        IERC20(CRV_TOKEN).safeApprove(POOL, _balance);
        ICurveStablePool(POOL).remove_liquidity_one_coin(_balance, tokenIndex, expected, true);
    }

    function _claimRewards() internal override {
        if (ICurveGauge(GAUGE).claimable_tokens(address(this)) > 0) {
            ICurveGaugeFactory(GAUGE_FACTORY).mint(GAUGE);
        }
    }

    function _minWantToWantCrv(uint _amount) internal view returns (uint) {
        // Based on virtual_price (poolMinVirtualPrice) and poolSlippageRatio
        // the expected amount is represented with 18 decimals as crvWant token
        // so we have to add 12 decimals (on USDC and USDT for example) to the want balance.
        // E.g. 1e6 (1WANT) * 1e12 * 99.4 / 100.0 => 0.994e18 CRV_TOKEN tokens
        return _amount * WANT_MISSING_PRECISION * (RATIO_PRECISION - poolSlippageRatio - poolMinVirtualPrice) / RATIO_PRECISION;
    }

    function _wantToWantCrvDoubleCheck(uint _amount, bool _isDeposit) internal view returns (uint wantCrvAmount) {
        uint[TOKENS_COUNT] memory amounts;

        amounts[uint(uint128(tokenIndex))] = _amount;
        // calc_token_amount doesn't consider fee
        wantCrvAmount = ICurveStablePool(SWAP_POOL).calc_token_amount(amounts, _isDeposit);
        // Remove max fee
        wantCrvAmount = wantCrvAmount * (RATIO_PRECISION - poolSlippageRatio) / RATIO_PRECISION;

        // In case the pool is unbalanced (attack), make a double check for
        // the expected amount with minExpected set ratios.
        uint wantToWantCrv = _minWantToWantCrv(_amount);

        if (wantToWantCrv > wantCrvAmount) { wantCrvAmount = wantToWantCrv; }
    }

    // Calculate at least xx% of the expected. The function doesn't
    // consider the fee.
    function _wantCrvToWantDoubleCheck(uint _balance) internal view returns (uint expected) {
        expected = (
            _calc_withdraw_one_coin(_balance) * (RATIO_PRECISION - poolSlippageRatio)
        ) / RATIO_PRECISION / WANT_MISSING_PRECISION;

        // Double check for expected value
        // In this case we sum the poolMinVirtualPrice and divide by
        // (for example) 1e12 because we want to swap CRV_TOKEN => WANT
        uint minExpected = _balance *
            (RATIO_PRECISION + poolMinVirtualPrice - poolSlippageRatio) /
            RATIO_PRECISION /
            WANT_MISSING_PRECISION;

        if (minExpected > expected) { expected = minExpected; }
    }

    function _calc_withdraw_one_coin(uint _amount) internal view returns (uint) {
        if (_amount > 0) {
            return ICurvePool(POOL).calc_withdraw_one_coin(_amount, 0);
        } else {
            return 0;
        }
    }

    function wantCRVBalance() public view returns (uint) {
        return IERC20(CRV_TOKEN).balanceOf(address(this));
    }

    function balanceOfPool() public view override returns (uint) {
        return ICurveGauge(GAUGE).balanceOf(address(this));
    }

    function balanceOfPoolInWant() public view override returns (uint) {
        return _calc_withdraw_one_coin(balanceOfPool()) / WANT_MISSING_PRECISION;
    }
}
