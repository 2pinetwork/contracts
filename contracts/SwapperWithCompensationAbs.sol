// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./Swappable.sol";
import "../interfaces/IUniswapPair.sol";

abstract contract SwapperWithCompensationAbs is Swappable, ReentrancyGuard {
    using SafeERC20 for IERC20Metadata;

    address public immutable strategy;
    address public exchange;

    IUniswapPair public immutable lp;
    IERC20Metadata public immutable want;
    IERC20Metadata public immutable token0;
    IERC20Metadata public immutable token1;

    uint internal immutable decimals0;
    uint internal immutable decimals1;

    uint public reserveSwapRatio = 0;
    uint public offsetRatio = 0;

    mapping(address => uint) public maxLiquidity;

    constructor(
        IERC20Metadata _want,
        IUniswapPair _lp,
        address _strategy,
        address _exchange
    ) {
        // Check that want is at least an ERC20
        _want.symbol();
        require(_want.balanceOf(address(this)) == 0, "Invalid ERC20");
        require(_want.allowance(msg.sender, address(this)) == 0, "Invalid ERC20");
        require(_exchange != address(0), "!ZeroAddress");

        lp = _lp;
        want = _want;
        token0 = IERC20Metadata(lp.token0());
        token1 = IERC20Metadata(lp.token1());

        decimals0 = 10 ** token0.decimals();
        decimals1 = 10 ** token1.decimals();

        maxLiquidity[address(token0)] = 10 ** (token0.decimals() - 2);
        maxLiquidity[address(token1)] = 10 ** (token1.decimals() - 2);

        exchange = _exchange;
        strategy = _strategy;
    }

    modifier onlyStrat() {
        require(msg.sender == strategy, "!Strategy");
        _;
    }

    function setReserveSwapRatio(uint newRatio) external onlyAdmin {
        require(newRatio != reserveSwapRatio, "same ratio");
        require(newRatio <= RATIO_PRECISION, "greater than 100%");

        reserveSwapRatio = newRatio;
    }

    function setOffsetRatio(uint newRatio) external onlyAdmin {
        require(newRatio != offsetRatio, "same ratio");
        require(newRatio <= RATIO_PRECISION, "greater than 100%");

        offsetRatio = newRatio;
    }

    function setMaxLiquidity(address _token, uint _amount) external onlyAdmin {
        require(_token == address(token0) || _token == address(token1), "Unknown token");
        require(_amount != maxLiquidity[_token], "Same liquidity");

        maxLiquidity[_token] = _amount;
    }

    function swapLpTokensForWant(uint _amount0, uint _amount1) external onlyStrat returns (uint _amount) {
        uint prevBal = wantBalance();

        if (token0 != want) {
            token0.safeTransferFrom(strategy, address(this), _amount0);
            _swap(address(token0), _amount0, address(want));
        }

        if (token1 != want) {
            token1.safeTransferFrom(strategy, address(this), _amount1);
            _swap(address(token1), _amount1, address(want));
        }

        // This is because the wantBalance could be more to compensate swaps
        _amount = wantBalance() - prevBal;
        want.safeTransfer(strategy, _amount);
    }

    function swapWantForLpTokens(uint _balance) external onlyStrat returns (uint _amount0, uint _amount1) {
        // Ensure the strategy has the _balance
        want.safeTransferFrom(msg.sender, address(this), _balance);

        // Compensate swap
        uint _amount = _balance * (RATIO_PRECISION + offsetRatio) / RATIO_PRECISION;

        if (_amount > wantBalance()) { _amount = wantBalance(); }

        (_amount0, _amount1) = _wantAmountToLpTokensAmount(_amount);

        // If want is one of the LP tokens we need to swap just 1
        if (want == token0) {
            // Since _swap expect amount expressed on "from" decimals
            _amount1 = _swap(address(want), _amount1 * decimals0 / decimals1, address(token1));
        } else if (want == token1) {
            // Since _swap expect amount expressed on "from" decimals
            _amount0 = _swap(address(want), _amount0 * decimals1 / decimals0, address(token0));
        } else {
            _amount0 = _amount / 2;
            _amount1 = _amount - _amount0;
            // If want isn't one of LP tokens we swap half for each one
            _amount0 = _swap(address(want), _amount0, address(token0));
            _amount1 = _swap(address(want), _amount1, address(token1));
        }

        token0.safeTransfer(msg.sender, _amount0);
        token1.safeTransfer(msg.sender, _amount1);
    }

    function lpInWant(uint _lpAmount) public view returns (uint) {
        (uint112 _reserve0, uint112 _reserve1,) = lp.getReserves();

        uint _lpTotalSupply = lp.totalSupply();
        uint _amount0 = _reserve0 * _lpAmount / _lpTotalSupply;
        uint _amount1 = _reserve1 * _lpAmount / _lpTotalSupply;
        uint _received0 = _getAmountsOut(token0, want, _amount0);
        uint _received1 = _getAmountsOut(token1, want, _amount1);

        return _received0 + _received1;
    }

    function lpToMinAmounts(uint _liquidity) public view returns (uint _amount0Min, uint _amount1Min) {
        uint _lpTotalSupply = lp.totalSupply();
        (uint112 _reserve0, uint112 _reserve1,) = lp.getReserves();

        _amount0Min = _liquidity * _reserve0 / _lpTotalSupply;
        _amount1Min = _liquidity * _reserve1 / _lpTotalSupply;
    }

    function wantBalance() public view returns (uint) {
        return want.balanceOf(address(this));
    }

    function wantToLP(uint _amount) public view returns (uint) {
        (uint112 _reserve0, uint112 _reserve1,) = lp.getReserves();

        (uint _amount0, uint _amount1) = _wantAmountToLpTokensAmount(_amount);

        uint _lpTotalSupply = lp.totalSupply();

        // They should be equal, but just in case we strive for maximum liquidity =)
        return _max(_amount0 * _lpTotalSupply / _reserve0, _amount1 * _lpTotalSupply / _reserve1);
    }

    function rebalanceStrategy() external {
        uint _amount0 = token0.balanceOf(strategy);
        uint _amount1 = token1.balanceOf(strategy);
        address _token0 = address(token0);
        address _token1 = address(token1);

        if (_amount0 > maxLiquidity[_token0] || _amount1 > maxLiquidity[_token1]) {
            (uint _reserve0, uint _reserve1,) = lp.getReserves();

            _reserve0 = _reserve0 * 1e18 / decimals0;
            _reserve1 = _reserve1 * 1e18 / decimals1;

            _amount0 = _amount0 * 1e18 / decimals0;
            _amount1 = _amount1 * 1e18 / decimals1;

            uint _totalReserves = _reserve0 + _reserve1;

            if (_amount0 > _amount1) {
                uint _amount = (_amount0 - _amount1) * _reserve1 / _totalReserves * decimals0 / 1e18;

                token0.safeTransferFrom(strategy, address(this), _amount);

                uint _amountOut = _swap(_token0, _amount, _token1);

                token1.safeTransfer(strategy, _amountOut);
            } else {
                uint _amount = (_amount1 - _amount0) * _reserve0 / _totalReserves * decimals1 / 1e18;

                token1.safeTransferFrom(strategy, address(this), _amount);

                uint _amountOut = _swap(_token1, _amount, _token0);

                token0.safeTransfer(strategy, _amountOut);
            }
        }
    }

    function _swap(address _from, uint _amount, address _to) internal virtual returns (uint) {
        // Should be implemented
    }

    function _getAmountsOut(IERC20Metadata _from, IERC20Metadata _to, uint _amount) internal virtual view returns (uint) {
        // Should be implemented
    }

    function _approveToken(address _token, uint _amount) internal {
        IERC20Metadata(_token).safeApprove(exchange, _amount);
    }

    function _removeAllowance(address _token) internal {
        if (IERC20Metadata(_token).allowance(address(this), exchange) > 0) {
            IERC20Metadata(_token).safeApprove(exchange, 0);
        }
    }

    function _max(uint _x, uint _y) internal pure returns (uint) {
        return _x > _y ? _x : _y;
    }

    function _wantAmountToLpTokensAmount(uint _amount) internal view returns (uint _amount0, uint _amount1) {
        (uint _reserve0, uint _reserve1,) = lp.getReserves();

        _reserve0 = _reserve0 * 1e18 / decimals0;
        _reserve1 = _reserve1 * 1e18 / decimals1;

        (uint _reserve, uint _decimals) = token0 == want ? (_reserve0, decimals0) : (_reserve1, decimals1);
        uint _totalReserves = _reserve0 + _reserve1;

        _amount = _amount * 1e18 / _decimals;

        _amount0 = _amount * _reserve *
            (RATIO_PRECISION + reserveSwapRatio) /
            _totalReserves / RATIO_PRECISION;

        // Correction ratio, take "after reserves" into account
        _amount0 = _amount0 * (_totalReserves + _amount0) / _totalReserves;
        _amount1 = _amount - _amount0;

        _amount0 = _amount0 * decimals0 / 1e18;
        _amount1 = _amount1 * decimals1 / 1e18;
    }
}
