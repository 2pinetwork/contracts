// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

import "./ControllerStratAbs.sol";
import "../interfaces/ICurve.sol";

contract ControllerMetaCurveStrat is ControllerStratAbs {
    using SafeERC20 for IERC20;
    using SafeERC20 for IERC20Metadata;

    IERC20Metadata public immutable crvToken;
    address public immutable metaPool;
    address public immutable pool;
    ICurveGauge public immutable gauge;
    ICurveGaugeFactory public immutable gaugeFactory;

    int128 private immutable poolSize;
    int128 private immutable tokenIndex; // want token index on the pool

    uint8 private immutable gaugeType;
    uint8 private constant GAUGE_TYPE_STAKING = 0;
    uint8 private constant GAUGE_TYPE_CHILD_STAKING = 1;

    error PoolSizeZero();
    error InvalidIndex();

    constructor(
        IERC20Metadata _want,
        address _controller,
        address _exchange,
        address _treasury,
        IERC20Metadata _crvToken,
        address _pool,
        address _metaPool,
        ICurveGauge _gauge,
        ICurveGaugeFactory _gaugeFactory,
        uint8 _gaugeType,
        int128 _poolSize,
        int128 _tokenIndex
    ) ControllerStratAbs(_want, _controller, _exchange, _treasury) {
        require(_pool != address(0), "pool !ZeroAddress");
        require(_metaPool != address(0), "metaPool !ZeroAddress");
        require(address(_gauge) != address(0), "gauge !ZeroAddress");
        require(address(_gaugeFactory) != address(0), "gaugeFactory !ZeroAddress");
        require(_gaugeType < 2, "gaugeType unknown");

        _checkIERC20(_crvToken, "Invalid crvToken");
        // Check gauge _behaves_ as a gauge
        _gauge.claimable_tokens(address(this));
        // Check gauge factory _behaves_ as a gauge factory
        _gaugeFactory.minted(address(this), address(this));

        // poolSize = ICurvePool(_pool).N_ALL_COINS();
        if (_poolSize <= 0) { revert PoolSizeZero(); }

        poolSize     = _poolSize;
        crvToken     = _crvToken;
        pool         = _pool;
        metaPool     = _metaPool;
        gauge        = _gauge;
        gaugeFactory = _gaugeFactory;
        gaugeType    = _gaugeType;
        tokenIndex   = _tokenIndex;
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

        console.log("[0] Want balance: ", _wantBal, "wantCRV:", wantCRVBalance());
        console.log("[0] balanceOfPool: ", balanceOfPool());

        if (_wantBal > 0) { _addLiquidity(_wantBal); }

        console.log("[afterAddLiq] Want balance: ", _wantBal, "wantCRV:", wantCRVBalance());
        console.log("[afterAddLiq] balanceOfPool: ", balanceOfPool());

        uint _wantCRVBalance = wantCRVBalance();

        if (_wantCRVBalance > 0) {
            crvToken.safeApprove(address(gauge), _wantCRVBalance);
            gauge.deposit(_wantCRVBalance);
        }

        console.log("[afterStaking] Want balance: ", _wantBal, "wantCRV:", wantCRVBalance());
        console.log("[afterStaking] balanceOfPool: ", balanceOfPool());
    }

    function _addLiquidity(uint _wantBal) internal {
        uint _expected = _wantToWantCrvDoubleCheck(_wantBal, true);


        console.log("[0] Expected wantCRV", _expected);

        if (poolSize == 2) {
            uint[2] memory _amounts;

            _amounts[uint(uint128(tokenIndex))] = _wantBal;

            want.safeApprove(pool, _wantBal);
            ICurvePool(pool).add_liquidity(metaPool, _amounts, _expected, true);
        } else if (poolSize == 4) {
            uint[4] memory _amounts;

            _amounts[uint(uint128(tokenIndex))] = _wantBal;

            want.safeApprove(pool, _wantBal);
            ICurvePool(pool).add_liquidity(metaPool, _amounts, _expected);
        }
    }

    function _withdraw(uint _amount) internal override returns (uint) {
        uint _balance = wantBalance();

        _withdrawFromPool(
            _wantToWantCrvDoubleCheck(_amount - _balance, false)
        );

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
        gauge.withdraw(_wantCrvAmount);

        // remove_liquidity
        uint _balance = wantCRVBalance();
        uint _expected = _wantCrvToWantDoubleCheck(_balance);

        require(_expected > 0, "remove_liquidity expected = 0");

        crvToken.safeApprove(pool, _balance);
        ICurvePool(pool).remove_liquidity_one_coin(metaPool, _balance, tokenIndex, _expected, true);
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
            _wantCrvAmount = ICurvePool(pool).calc_token_amount(metaPool, _amounts, _isDeposit);
        } else if (poolSize == 4) {
            uint[4] memory _amounts;

            _amounts[uint(uint128(tokenIndex))] = _amount;
            // calc_token_amount doesn't consider fee
            _wantCrvAmount = ICurvePool(pool).calc_token_amount(metaPool, _amounts, _isDeposit);
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
            return ICurvePool(pool).calc_withdraw_one_coin(metaPool, _amount, tokenIndex);
        } else {
            return 0;
        }
    }
}
