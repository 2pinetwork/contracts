// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./Swappable.sol";
import "../interfaces/IUniswapPair.sol";
import "../interfaces/IUniswapRouter.sol";

contract SwapperWithCompensation is Swappable, ReentrancyGuard {
    using SafeERC20 for IERC20Metadata;

    address public immutable strategy;
    address public exchange = address(0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff);

    IUniswapPair public immutable lp;
    IERC20Metadata public immutable token0;
    IERC20Metadata public immutable token1;
    IERC20Metadata public immutable want;

    mapping(address => mapping(address => address[])) public routes;

    uint public reserveSwapRatio = 50; // 0.5% (0.3% of swap fee + a little more to get the more LP as possible
    uint public compensateRatio = 80; // 0.8% (0.3% of swap fee + 0.5% of staking deposit fee

    constructor(IERC20Metadata _want, IUniswapPair _lp, address _strategy) {
        // Check that want is at least an ERC20
        _want.symbol();
        require(_want.balanceOf(address(this)) == 0, "Invalid ERC20");
        require(_want.allowance(msg.sender, address(this)) == 0, "Invalid ERC20");

        want = _want;
        lp = _lp;
        token0 = IERC20Metadata(lp.token0());
        token1 = IERC20Metadata(lp.token1());

        strategy = _strategy;
    }

    modifier onlyStrat() {
        require(msg.sender == strategy, "!Strategy");
        _;
    }

    function setRoute(address _from, address[] calldata _route) external onlyAdmin {
        require(_from != address(0), "!ZeroAddress");
        require(_route[0] == _from, "First route isn't from");
        require(_route[_route.length - 1] != _from, "Last route is same as from");
        require(_route.length > 1, "Route length < 2");

        routes[_from][_route[_route.length - 1]] = _route;
    }


    function setReserveSwapRatio(uint newRatio) external onlyAdmin {
        require(newRatio != reserveSwapRatio, "same ratio");
        require(newRatio <= RATIO_PRECISION, "greater than 100%");

        reserveSwapRatio = newRatio;
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

        uint _amount = _balance * (RATIO_PRECISION + compensateRatio) / RATIO_PRECISION;

        if (_amount > wantBalance()) { _amount = wantBalance(); }

        uint _sellAmount;
        (_amount0, _sellAmount) = _wantAmountToLpTokensAmount(_amount);

        // If want is one of the LP tokens we need to swap just 1
        if (want == token0) {
            _amount1 = _swap(address(want), _sellAmount, address(token1));
        } else if (want == token1) {
            _amount1 = _amount0; // _amount - _sellAmount
            _amount0 = _swap(address(want), _sellAmount, address(token0));
        } else {
            // If want isn't one of LP tokens we swap half for each one
            _amount1 = _swap(address(want), _amount0, address(token1));
            _amount0 = _swap(address(want), _sellAmount, address(token0));
        }

        token0.safeTransfer(msg.sender, _amount0);
        token1.safeTransfer(msg.sender, _amount1);
    }

    function _swap(address _from, uint _amount, address _to) internal returns (uint) {
        address[] memory _route = _getRoute(_from, _to);

        if (_amount > 0) {
            uint _expected = _expectedForSwap(_amount, _from, _to);

            if (_expected > 1) {
                _approveToken(_from, _amount);

                uint[] memory _amounts = IUniswapRouter(exchange).swapExactTokensForTokens(
                    _amount,
                    _expected,
                    _route,
                    address(this),
                    block.timestamp
                );

                _removeAllowance(_from);

                return _amounts[_amounts.length - 1];
            }
        }

        return 0;
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

    function _getAmountsOut(IERC20Metadata _from, IERC20Metadata _to, uint _amount) internal view returns (uint) {
        if (_from == _to) {
            return _amount;
        } else {
            address[] memory _route = _getRoute(address(_from), address(_to));
            uint[] memory amounts = IUniswapRouter(exchange).getAmountsOut(_amount, _route);

            return amounts[amounts.length - 1];
        }
    }

    function _getRoute(address _from, address _to) internal view returns (address[] memory) {
        address[] memory _route = routes[_from][_to];

        require(_route.length > 1, "Invalid route!");

        return _route;
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

    function wantBalance() public view returns (uint) {
        return want.balanceOf(address(this));
    }

    function _reservePrecision() internal view returns (uint) {
        if (token0.decimals() >= token1.decimals()) {
            return (10 ** token0.decimals()) / (10 ** token1.decimals());
        } else {
            return (10 ** token1.decimals()) / (10 ** token0.decimals());
        }
    }

    function wantToLP(uint _amount) public view returns (uint) {
        (uint112 _reserve0, uint112 _reserve1,) = lp.getReserves();

        // convert amount from want => token0
        if (want != token0 && want != token1) {
            _amount = _getAmountsOut(want, token0, _amount);
        }

        (uint _amount0, uint _amount1) = _wantAmountToLpTokensAmount(_amount);

        uint _lpTotalSupply = lp.totalSupply();

        // They should be equal, but just in case we strive for maximum liquidity =)
        return _max(_amount0 * _lpTotalSupply / _reserve0, _amount1 * _lpTotalSupply / _reserve1);
    }

    function _wantAmountToLpTokensAmount(uint _amount) internal view returns (uint _amount0, uint _amount1) {
        (uint112 _reserve0, uint112 _reserve1,) = lp.getReserves();

        // Reserves in token0 precision
        uint totalReserves = _reserve0;
        totalReserves += _reserve1 / _reservePrecision();

        // Get the reserve ratio plus the 0.5% of the swap
        _amount0 = _amount * _reserve0 *
            (RATIO_PRECISION + reserveSwapRatio) /
            totalReserves / RATIO_PRECISION;

        _amount1 = _amount - _amount0;
    }
}
