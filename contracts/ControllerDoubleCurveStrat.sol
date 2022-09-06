// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

import "./ControllerStratAbs.sol";
import "../interfaces/ICurve.sol";

contract ControllerCurveStrat is ControllerStratAbs {
    using SafeERC20 for IERC20;
    using SafeERC20 for IERC20Metadata;

    IERC20Metadata public immutable crvToken;
    address public immutable pool;
    address public immutable swapPool;
    ICurveGauge public immutable gauge;
    ICurveGaugeFactory public immutable gaugeFactory;

    int128 private immutable poolSize;
    int128 private immutable tokenIndex; // want token index on the pool

    uint8 private immutable gaugeType;
    uint8 private constant GAUGE_TYPE_STAKING = 0;
    uint8 private constant GAUGE_TYPE_CHILD_STAKING = 1;


    address public immutable intermediatePool;
    IERC20Metadata public immutable intermediateCrv;

    constructor(
        IERC20Metadata _want,
        address _controller,
        address _exchange,
        address _treasury,
        IERC20Metadata _crvToken,
        address _pool,
        address _swapPool,
        ICurveGauge _gauge,
        ICurveGaugeFactory _gaugeFactory,
        uint8 _gaugeType,
        address _intermediatePool,
        IERC20Metadata _intermediateCrv,
    ) ControllerStratAbs(_want, _controller, _exchange, _treasury) {
        require(_pool != address(0), "pool !ZeroAddress");
        require(_swapPool != address(0), "swapPool !ZeroAddress");
        require(address(_gauge) != address(0), "gauge !ZeroAddress");
        require(address(_gaugeFactory) != address(0), "gaugeFactory !ZeroAddress");
        require(_gaugeType < 2, "gaugeType unknown");

        _checkIERC20(_crvToken, "Invalid crvToken");
        // Check gauge _behaves_ as a gauge
        _gauge.claimable_tokens(address(this));
        // Check gauge factory _behaves_ as a gauge factory
        _gaugeFactory.minted(address(this), address(this));

        crvToken = _crvToken;
        pool = _pool;
        swapPool = _swapPool;
        gauge = _gauge;
        gaugeFactory = _gaugeFactory;
        gaugeType = _gaugeType;

        (int128 _poolSize, bool _int128) = _guessPoolSize();

        require(_poolSize > 0, "poolSize is zero");

        int128 _index = _guessTokenIndex(_poolSize, _int128);

        require(_index < _poolSize, "Index out of bounds");

        poolSize = _poolSize;
        tokenIndex = _index;

        intermediatePool = _intermediatePool;
        intermediateCrv = _intermediateCrv;
    }

    function identifier() external view returns (string memory) {
        return string(abi.encodePacked(want.symbol(), "@Curve#1.0.0"));
    }

    function wantCRVBalance() public view returns (uint) {
        return crvToken.balanceOf(address(this));
    }

    function balanceOfPool() public view override returns (uint) {
        return gauge.balanceOf(address(this));
    }

    function balanceOfPoolInWant() public view override returns (uint) {
        return _calcWithdrawOneCoin(balanceOfPool());
    }

    function _deposit() internal override {
        uint _wantBal = wantBalance();

        console.log("Depositando Want: ", _wantBal);
        if (_wantBal > 0) { _addLiquidityToIntermediatePool(_wantBal); }

        uint _intBal = intermediateCrv.balanceOf(address(this));
        console.log("Salio ", _intBal, "3CRV");

        if (_intBal > 0) { _addLiquidity(_intBal); }

        uint _wantCRVBalance = wantCRVBalance();
        console.log("Salio ", _wantCRVBalance, "finalCrv");

        if (_wantCRVBalance > 0) {
            crvToken.safeApprove(address(gauge), _wantCRVBalance);
            gauge.deposit(_wantCRVBalance);
        }
    }

    function _addLiquidityToIntermediatePool(uint _wantBal) internal {
        uint _expected = _wantToIntermediateCrvDoubleCheck(_wantBal, true);

        if (poolSize == 2) {
            uint[2] memory _amounts;

            _amounts[uint(uint128(tokenIndex))] = _wantBal;

            want.safeApprove(intermediatePool, _wantBal);
            ICurvePool(intermediatePool).add_liquidity(_amounts, _expected, true);
        } else if (poolSize == 4) {
            uint[4] memory _amounts;

            _amounts[uint(uint128(tokenIndex))] = _wantBal;

            want.safeApprove(intermediatePool, _wantBal);
            ICurvePool(intermediatePool).add_liquidity(_amounts, _expected);
        }
    }

    function _addLiquidity(uint _intBal) internal {
        uint _expected = _intermediateToIntermediateCrvDoubleCheck(_intBal, true);

        if (poolSize == 2) {
            uint[2] memory _amounts;

            _amounts[uint(uint128(tokenIndex))] = _intBal;

            intermediateCrv.safeApprove(pool, _intBal);
            ICurvePool(pool).add_liquidity(_amounts, _expected, true);
        } else if (poolSize == 4) {
            uint[4] memory _amounts;

            _amounts[uint(uint128(tokenIndex))] = _intBal;

            intermediateCrv.safeApprove(pool, _intBal);
            ICurvePool(pool).add_liquidity(_amounts, _expected);
        }
    }

    function _withdraw(uint _amount) internal override returns (uint) {
        uint _balance = wantBalance();

        _withdrawFromPool(
            _intermediateToIntermediateCrvDoubleCheck(_amount - _balance, false)
        );

        uint _withdrawn = wantBalance() - _balance;

        return (_withdrawn > _amount) ? _amount : _withdrawn;
    }

    function _withdrawAll() internal override returns (uint) {
        uint _balance = wantBalance();

        _withdrawFromPool(balanceOfPool());

        return wantBalance() - _balance;
    }

    function _withdrawFromPool(uint _intermediateCrvAmount) internal {
        // Remove staked from gauge
        gauge.withdraw(_intermediateCrvAmount);

        // remove_liquidity
        uint _balance = wantCRVBalance();
        uint _expected = _intermediateCrvToWantDoubleCheck(_balance);

        require(_expected > 0, "remove_liquidity expected = 0");

        if (address(pool) != address(swapPool)) {
            crvToken.safeApprove(pool, _balance);
        }

        ICurvePool(pool).remove_liquidity_one_coin(_balance, tokenIndex, _expected, true);
    }

    function _claimRewards() internal override {
        // CRV rewards
        if (gauge.claimable_tokens(address(this)) > 0) {
            gaugeFactory.mint(address(gauge));
        }

        // no-CRV rewards
        bool _claim = false;

        if (gaugeType == GAUGE_TYPE_STAKING) {
            if (gauge.claimable_reward(address(this)) > 0) {
                _claim = true;
            }
        } else if (gaugeType == GAUGE_TYPE_CHILD_STAKING) {
            for (uint i = 0; i < gauge.reward_count(); i++) {
                address _reward = gauge.reward_tokens(i);

                if (gauge.claimable_reward(address(this), _reward) > 0) {
                    _claim = true;
                    break;
                }
            }
        }

        if (_claim) { gauge.claim_rewards(); }
    }

    function _minIntermediateToIntermediateCrv(uint _amount) internal view returns (uint) {
        // Based on virtual_price (poolMinVirtualPrice) and poolSlippageRatio
        // the expected amount is represented with 18 decimals as crvWant token
        // so we have to add 12 decimals (on USDC and USDT for example) to the want balance.
        // E.g. 1e6 (1WANT) * 1e12 * 99.4 / 100.0 => 0.994e18 crvToken tokens
        return _amount * (RATIO_PRECISION - poolSlippageRatio - poolMinVirtualPrice) / RATIO_PRECISION;
    }

    function _intermediateToIntermediateCrvDoubleCheck(uint _amount, bool _isDeposit) internal view returns (uint _intermediateCrvAmount) {
        if (poolSize == 2) {
            uint[2] memory _amounts;

            _amounts[uint(uint128(tokenIndex))] = _amount;
            // calc_token_amount doesn't consider fee
            _intermediateCrvAmount = ICurvePool(swapPool).calc_token_amount(_amounts, _isDeposit);
        } else if (poolSize == 4) {
            uint[4] memory _amounts;

            _amounts[uint(uint128(tokenIndex))] = _amount;
            // calc_token_amount doesn't consider fee
            _intermediateCrvAmount = ICurvePool(swapPool).calc_token_amount(_amounts, _isDeposit);
        }

        // Remove max fee
        _intermediateCrvAmount = _intermediateCrvAmount * (RATIO_PRECISION - poolSlippageRatio) / RATIO_PRECISION;

        // In case the pool is unbalanced (attack), make a double check for
        // the expected amount with minExpected set ratios.
        uint _intermediateToIntermediateCrv = _minIntermediateToIntermediateCrv(_amount);

        if (_intermediateToIntermediateCrv > _intermediateCrvAmount) { _intermediateCrvAmount = _intermediateToIntermediateCrv; }
    }

    // Calculate at least xx% of the expected. The function doesn't
    // consider the fee.
    function _intermediateCrvToWantDoubleCheck(uint _balance) internal view returns (uint _expected) {
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

    // Constructor helper

    function _guessPoolSize() internal view returns (int128 _poolSize, bool _int128) {
        ICurvePool _pool = ICurvePool(pool);
        bool _loop = true;

        _int128 = true;

        while (_loop) {
            try _pool.underlying_coins(_poolSize) returns (address) {
                _poolSize += 1;
            } catch {
                try _pool.underlying_coins(uint256(int256(_poolSize))) returns (address) {
                    _int128 = false;
                    _poolSize += 1;
                } catch {
                    _loop = false;
                }
            }
        }
    }

    function _guessTokenIndex(int128 _poolSize, bool _int128) internal view returns (int128 _index) {
        address _want = address(want);
        ICurvePool _pool = ICurvePool(pool);

        for (_index; _index < _poolSize; _index++) {
            if (_int128) {
                if (_want == _pool.underlying_coins(_index)) { break; }
            } else {
                if (_want == _pool.underlying_coins(uint256(int256(_index)))) { break; }
            }
        }
    }
}
