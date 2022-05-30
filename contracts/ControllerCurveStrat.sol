// SPDX-License-Identifier: MIT

pragma solidity 0.8.13;

import "./ControllerStratAbs.sol";
import "../interfaces/ICurve.sol";

contract ControllerCurveStrat is ControllerStratAbs {
    using SafeERC20 for IERC20;
    using SafeERC20 for IERC20Metadata;

    // Test
    address constant public WNATIVE = address(0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f);
    address constant public CRV = address(0xED8CAB8a931A4C0489ad3E3FB5BdEA84f74fD23E);
    address constant public ETH = address(0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f); // same than wNative
    address constant public BTCCRV = address(0x40bde52e6B80Ae11F34C58c14E1E7fE1f9c834C4); // same than CurvePool
    address constant public CURVE_POOL = address(0x40bde52e6B80Ae11F34C58c14E1E7fE1f9c834C4);
    address constant public GAUGE = address(0xE9061F92bA9A3D9ef3f4eb8456ac9E552B3Ff5C8);
    address constant public GAUGE_FACTORY = address(0xA7c8B0D74b68EF10511F27e97c379FB1651e1eD2);

    constructor(address _controller, address _exchange, address _treasury)
        ControllerStratAbs(
            IERC20Metadata(0x6d925938Edb8A16B3035A4cF34FAA090f490202a), // BTC
            _controller,
            _exchange,
            _treasury
        ) {}

    function identifier() external pure returns (string memory) {
        return string("Ren@Curve#1.0.0");
    }

    function _deposit() internal override {
        uint wantBal = wantBalance();

        if (wantBal > 0) {
            uint[2] memory amounts = [wantBal, 0];
            uint btcCrvAmount = _btcToBtcCrvDoubleCheck(wantBal, true);

            want.safeApprove(CURVE_POOL, wantBal);
            ICurvePool(CURVE_POOL).add_liquidity(amounts, btcCrvAmount, true);
        }

        uint _btcCRVBalance = btcCRVBalance();

        if (_btcCRVBalance > 0) {
            IERC20(BTCCRV).safeApprove(GAUGE, _btcCRVBalance);
            ICurveGauge(GAUGE).deposit(_btcCRVBalance);
        }
    }

    function _withdraw(uint _amount) internal override returns (uint) {
        uint _balance = wantBalance();

        if (_balance < _amount) {
            _withdrawFromPool(
                _btcToBtcCrvDoubleCheck(_amount - _balance, false)
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

    function _withdrawFromPool(uint btcCrvAmount) internal {
        // Remove staked from gauge
        ICurveGauge(GAUGE).withdraw(btcCrvAmount);

        // remove_liquidity
        uint _balance = btcCRVBalance();
        uint expected = _btcCrvToBtcDoubleCheck(_balance);

        require(expected > 0, "remove_liquidity expected = 0");

        ICurvePool(CURVE_POOL).remove_liquidity_one_coin(_balance, 0,  expected, true);
    }

    /**
     * @dev Curve gauge claim_rewards claim WMatic & CRV tokens
     */
    function _claimRewards() internal override {
        // CRV tokens
        if (ICurveGauge(GAUGE).claimable_tokens(address(this)) > 0) {
            ICurveGaugeFactory(GAUGE_FACTORY).mint(GAUGE);
        }

        // no-CRV rewards
        bool _claim = false;

        for (uint i = 0; i < ICurveGauge(GAUGE).reward_count(); i++) {
            address _reward = ICurveGauge(GAUGE).reward_tokens(i);

            if (ICurveGauge(GAUGE).claimable_reward(address(this), _reward) > 0) {
                _claim = true;
                break;
            }
        }

        if (_claim) { ICurveGauge(GAUGE).claim_rewards(); }
    }

    function _minBtcToBtcCrv(uint _amount) internal view returns (uint) {
        // Based on virtual_price (poolMinVirtualPrice) and poolSlippageRatio
        // the expected amount is represented with 18 decimals as crvBtc token
        // so we have to add 10 decimals to the btc balance.
        // E.g. 1e8 (1BTC) * 1e10 * 99.4 / 100.0 => 0.994e18 BTCCRV tokens
        return _amount * WANT_MISSING_PRECISION * (RATIO_PRECISION - poolSlippageRatio - poolMinVirtualPrice) / RATIO_PRECISION;
    }

    function _btcToBtcCrvDoubleCheck(uint _amount, bool _isDeposit) internal view returns (uint btcCrvAmount) {
        uint[2] memory amounts = [_amount, 0];
        // calc_token_amount doesn't consider fee
        btcCrvAmount = ICurvePool(CURVE_POOL).calc_token_amount(amounts, _isDeposit);
        // Remove max fee
        btcCrvAmount = btcCrvAmount * (RATIO_PRECISION - poolSlippageRatio) / RATIO_PRECISION;

        // In case the pool is unbalanced (attack), make a double check for
        // the expected amount with minExpected set ratios.
        uint btcToBtcCrv = _minBtcToBtcCrv(_amount);

        if (btcToBtcCrv > btcCrvAmount) { btcCrvAmount = btcToBtcCrv; }
    }

    // Calculate at least xx% of the expected. The function doesn't
    // consider the fee.
    function _btcCrvToBtcDoubleCheck(uint _balance) internal view returns (uint expected) {
        expected = (
            _calc_withdraw_one_coin(_balance) * (RATIO_PRECISION - poolSlippageRatio)
        ) / RATIO_PRECISION;

        // Double check for expected value
        // In this case we sum the poolMinVirtualPrice and divide by 1e10 because we want to swap BTCCRV => BTC
        uint minExpected = _balance *
            (RATIO_PRECISION + poolMinVirtualPrice - poolSlippageRatio) /
            RATIO_PRECISION /
            WANT_MISSING_PRECISION;

        if (minExpected > expected) { expected = minExpected; }
    }

    function _calc_withdraw_one_coin(uint _amount) internal view returns (uint) {
        if (_amount > 0) {
            return ICurvePool(CURVE_POOL).calc_withdraw_one_coin(_amount, 0);
        } else {
            return 0;
        }
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
    function balanceOfPool() public view override returns (uint) {
        return ICurveGauge(GAUGE).balanceOf(address(this));
    }
    function balanceOfPoolInWant() public view override returns (uint) {
        return _calc_withdraw_one_coin(balanceOfPool());
    }
}
