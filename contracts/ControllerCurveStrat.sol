// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

import "./ControllerStratAbs.sol";
import "../interfaces/ICurve.sol";

contract ControllerCurveStrat is ControllerStratAbs {
    using SafeERC20 for IERC20;
    using SafeERC20 for IERC20Metadata;

    address public crvToken;
    address public pool;
    address public swapPool;
    address public gauge;
    address public gaugeFactory;

    uint private immutable poolSize;
    int128 private immutable tokenIndex; // want token index in the pool

    // gaugeType { STAKING = 0, CHILD_STAKING = 1 }
    uint private immutable gaugeType; // 0 == staking, 1 == child

    constructor(
        IERC20Metadata _want,
        address _controller,
        address _exchange,
        address _treasury,
        address _crvToken,
        address _pool,
        address _swapPool,
        address _gauge,
        address _gaugeFactory,
        uint _gaugeType,
        uint _poolSize,
        int128 _tokenIndex
    ) ControllerStratAbs(_want, _controller, _exchange, _treasury) {
        require(_crvToken != address(0), "crvToken !ZeroAddress");
        require(_pool != address(0), "pool !ZeroAddress");
        require(_swapPool != address(0), "swapPool !ZeroAddress");
        require(_gauge != address(0), "gauge !ZeroAddress");
        require(_gaugeFactory != address(0), "gaugeFactory !ZeroAddress");
        require(_gaugeType < 2, "gaugeType unknown");
        require(_poolSize > 0, "poolSize is zero");
        require(uint(int256(_tokenIndex)) < _poolSize, "tokenIndex out of bounds");

        crvToken = _crvToken;
        pool = _pool;
        swapPool = _swapPool;
        gauge = _gauge;
        gaugeFactory = _gaugeFactory;
        gaugeType = _gaugeType;
        poolSize = _poolSize;
        tokenIndex = _tokenIndex;
    }

    function identifier() external view returns (string memory) {
        return string(abi.encodePacked(want.symbol(), "@Curve#1.0.0"));
    }

    function wantCRVBalance() public view returns (uint) {
        return IERC20(crvToken).balanceOf(address(this));
    }

    function balanceOfPool() public view override returns (uint) {
        return ICurveGauge(gauge).balanceOf(address(this));
    }

    function balanceOfPoolInWant() public view override returns (uint) {
        return _calcWithdrawOneCoin(balanceOfPool());
    }

    function _deposit() internal override {
        uint _wantBal = wantBalance();

        if (_wantBal > 0) {
            _addLiquidity(_wantBal);
        }

        uint _wantCRVBalance = wantCRVBalance();

        if (_wantCRVBalance > 0) {
            IERC20(crvToken).safeApprove(gauge, _wantCRVBalance);
            ICurveGauge(gauge).deposit(_wantCRVBalance);
        }
    }

    function _addLiquidity(uint _wantBal) internal {
        uint _expected = _wantToWantCrvDoubleCheck(_wantBal, true);

        if (poolSize == 2) {
            uint[2] memory _amounts;

            _amounts[uint(uint128(tokenIndex))] = _wantBal;

            want.safeApprove(pool, _wantBal);
            ICurvePool(pool).add_liquidity(_amounts, _expected, true);
        } else if (poolSize == 4) {
            uint[4] memory _amounts;

            _amounts[uint(uint128(tokenIndex))] = _wantBal;

            want.safeApprove(pool, _wantBal);
            ICurvePool(pool).add_liquidity(_amounts, _expected);
        }
    }

    function _withdraw(uint _amount) internal override returns (uint) {
        uint _balance = wantBalance();

        if (_balance < _amount) {
            _withdrawFromPool(
                _wantToWantCrvDoubleCheck(_amount - _balance, false)
            );
        }

        uint _withdrawn = wantBalance() - _balance;

        return (_withdrawn > _amount) ? _amount : _withdrawn;
    }

    function _withdrawAll() internal override returns (uint) {
        uint _balance = wantBalance();

        _withdrawFromPool(balanceOfPool());

        return wantBalance() - _balance;
    }

    function _withdrawFromPool(uint _wantCrvAmount) internal {
        // Remove staked from gauge
        ICurveGauge(gauge).withdraw(_wantCrvAmount);

        // remove_liquidity
        uint _balance = wantCRVBalance();
        uint _expected = _wantCrvToWantDoubleCheck(_balance);

        require(_expected > 0, "remove_liquidity expected = 0");

        if (IERC20(crvToken).allowance(address(this), pool) == 0) {
            IERC20(crvToken).safeApprove(pool, _balance);
        }

        ICurvePool(pool).remove_liquidity_one_coin(_balance, tokenIndex, _expected, true);
    }

    function _claimRewards() internal override {
        if (ICurveGauge(gauge).claimable_tokens(address(this)) > 0) {
            ICurveGaugeFactory(gaugeFactory).mint(gauge);
        }

        // no-CRV rewards
        bool _claim = false;

        if (gaugeType == 0) {
            if (ICurveGauge(gauge).claimable_reward(address(this)) > 0) {
                _claim = true;
            }
        }

        if (gaugeType == 1) {
            for (uint i = 0; i < ICurveGauge(gauge).reward_count(); i++) {
                address _reward = ICurveGauge(gauge).reward_tokens(i);

                if (ICurveGauge(gauge).claimable_reward(address(this), _reward) > 0) {
                    _claim = true;
                    break;
                }
            }
        }

        if (_claim) { ICurveGauge(gauge).claim_rewards(); }
    }

    function _minWantToWantCrv(uint _amount) internal view returns (uint) {
        // Based on virtual_price (poolMinVirtualPrice) and poolSlippageRatio
        // the expected amount is represented with 18 decimals as crvWant token
        // so we have to add 12 decimals (on USDC and USDT for example) to the want balance.
        // E.g. 1e6 (1WANT) * 1e12 * 99.4 / 100.0 => 0.994e18 crvToken tokens
        return _amount * WANT_MISSING_PRECISION * (RATIO_PRECISION - poolSlippageRatio - poolMinVirtualPrice) / RATIO_PRECISION;
    }

    function _wantToWantCrvDoubleCheck(uint _amount, bool _isDeposit) internal view returns (uint _wantCrvAmount) {
        if (poolSize == 2) {
            uint[2] memory _amounts;

            _amounts[uint(uint128(tokenIndex))] = _amount;
            // calc_token_amount doesn't consider fee
            _wantCrvAmount = ICurvePool(swapPool).calc_token_amount(_amounts, _isDeposit);
        } else if (poolSize == 4) {
            uint[4] memory _amounts;

            _amounts[uint(uint128(tokenIndex))] = _amount;
            // calc_token_amount doesn't consider fee
            _wantCrvAmount = ICurvePool(swapPool).calc_token_amount(_amounts, _isDeposit);
        }

        // Remove max fee
        _wantCrvAmount = _wantCrvAmount * (RATIO_PRECISION - poolSlippageRatio) / RATIO_PRECISION;

        // In case the pool is unbalanced (attack), make a double check for
        // the expected amount with minExpected set ratios.
        uint _wantToWantCrv = _minWantToWantCrv(_amount);

        if (_wantToWantCrv > _wantCrvAmount) { _wantCrvAmount = _wantToWantCrv; }
    }

    // Calculate at least xx% of the expected. The function doesn't
    // consider the fee.
    function _wantCrvToWantDoubleCheck(uint _balance) internal view returns (uint _expected) {
        _expected = (
            _calcWithdrawOneCoin(_balance) * (RATIO_PRECISION - poolSlippageRatio)
        ) / RATIO_PRECISION;

        // Double check for expected value
        // In this case we sum the poolMinVirtualPrice and divide by
        // (for example) 1e12 because we want to swap crvToken => WANT
        uint _minExpected = _balance *
            (RATIO_PRECISION + poolMinVirtualPrice - poolSlippageRatio) /
            RATIO_PRECISION /
            WANT_MISSING_PRECISION;

        if (_minExpected > _expected) { _expected = _minExpected; }
    }

    function _calcWithdrawOneCoin(uint _amount) internal view returns (uint) {
        if (_amount > 0) {
            return ICurvePool(pool).calc_withdraw_one_coin(_amount, tokenIndex);
        } else {
            return 0;
        }
    }
}
