// SPDX-License-Identifier: MIT

pragma solidity 0.8.11;

/*
    Zap contracts based on PancakeBunny ZapSushi
    Many thanks for the team =)
    https://github.com/PancakeBunny-finance/PolygonBUNNY/blob/main/contracts/zap/ZapSushi.sol
 */

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "./PiAdmin.sol";

import "../interfaces/IUniswapPair.sol";
import "../interfaces/IUniswapRouter.sol";
import "../interfaces/IWNative.sol";

contract UniZap is PiAdmin, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public constant WNative = address(0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f);
    address public constant WETH = address(0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f);

    IUniswapRouter public exchange = IUniswapRouter(0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506);

    mapping(address => address) public routePairAddresses;

    receive() external payable {}

    event NewExchange(address oldExchange, address newExchange);

    function zapInToken(address _from, uint amount, address _to) external nonReentrant {
        IERC20(_from).safeTransferFrom(msg.sender, address(this), amount);

        _zapInToken(_from, amount, _to);
    }

    function zapIn(address _to) external payable nonReentrant {
        IWNative(WNative).deposit{value: msg.value}();

        _zapInToken(WNative, msg.value, _to);
    }

    // zapOut only should work to split LPs
    function zapOut(address _from, uint amount) external nonReentrant {
        if (_isLP(_from)) {
            IERC20(_from).safeTransferFrom(msg.sender, address(this), amount);

            IUniswapPair pair = IUniswapPair(_from);
            address token0 = pair.token0();
            address token1 = pair.token1();

            _approveToken(_from, amount);

            if (token0 == WNative || token1 == WNative) {
                exchange.removeLiquidityETH(
                    token0 != WNative ? token0 : token1,
                    amount,
                    0,
                    0,
                    msg.sender,
                    block.timestamp + 60
                );
            } else {
                exchange.removeLiquidity(token0, token1, amount, 0, 0, msg.sender, block.timestamp + 60);
            }

            _removeAllowance(_from);
        }
    }

    function estimateReceiveTokens(address _from, address _to, uint _amount) public view returns (uint) {
        address[] memory route = _getRoute(_from, _to);

        uint[] memory amounts = exchange.getAmountsOut(_amount, route);

        return amounts[amounts.length - 1];
    }

    /* ========== Private Functions ========== */
    function _approveToken(address _token, uint _amount) internal {
        IERC20(_token).safeApprove(address(exchange), _amount);
    }

    function _removeAllowance(address _token) internal {
        if (IERC20(_token).allowance(address(this), address(exchange)) > 0) {
            IERC20(_token).safeApprove(address(exchange), 0);
        }
    }

    function _isLP(address _addr) internal view returns (bool) {
        try IUniswapPair(_addr).token1() returns (address) {
            return true;
        } catch {
            return false;
        }
    }

    function _zapInToken(address _from, uint amount, address _to) internal {
        if (_isLP(_to)) {
            IUniswapPair pair = IUniswapPair(_to);
            address token0 = pair.token0();
            address token1 = pair.token1();
            uint sellAmount = amount / 2;

            uint amount0 = amount - sellAmount;
            uint amount1;

            // If _from is one of the LP tokens we need to swap just 1
            if (_from == token0) {
                amount1 = _swap(_from, sellAmount, token1, address(this));
            } else if (_from == token1) {
                amount1 = amount0; // amount - sellAmount
                amount0 = _swap(_from, sellAmount, token0, address(this));
            } else {
                // If _from isn't one of LP tokens we swap half for each one
                amount1 = _swap(_from, amount0, token1, address(this));
                amount0 = _swap(_from, sellAmount, token0, address(this));
            }
            // Double check that lp has reserves
            pair.skim(address(this));

            // Approve only needed amounts
            _approveToken(token0, amount0);
            _approveToken(token1, amount1);
            // Add liquidity to the LP
            exchange.addLiquidity(
                token0,
                token1,
                amount0,
                amount1,
                0,
                0,
                msg.sender,
                block.timestamp + 60
            );

            _removeAllowance(token0);
            _removeAllowance(token1);
        } else {
            _swap(_from, amount, _to, msg.sender);
        }
    }

    function _swap(address _from, uint amount, address _to, address receiver) private returns (uint) {
        address[] memory route = _getRoute(_from, _to);

        _approveToken(_from, amount);
        uint[] memory amounts = exchange.swapExactTokensForTokens(amount, 0, route, receiver, block.timestamp);
        _removeAllowance(_from);

        return amounts[amounts.length - 1];
    }

    function _getRoute(address _from, address _to) internal view returns (address[] memory route) {
        if (
            routePairAddresses[_from] != address(0) &&
            routePairAddresses[_to] != address(0) &&
            routePairAddresses[_from] != routePairAddresses[_to]
        ) {
            if (routePairAddresses[_from] == WETH || routePairAddresses[_to] == WETH) {
                route = new address[](4);
                route[0] = _from;
                route[1] = routePairAddresses[_from];
                route[2] = routePairAddresses[_to];
                route[3] = _to;
            } else {
                route = new address[](5);
                route[0] = _from;
                route[1] = routePairAddresses[_from];
                route[2] = WETH;
                route[3] = routePairAddresses[_to];
                route[4] = _to;
            }
        } else if (routePairAddresses[_from] != address(0) && routePairAddresses[_from] != WETH) {
            route = new address[](4);
            route[0] = _from;
            route[1] = routePairAddresses[_from];
            route[2] = WETH;
            route[3] = _to;
        } else if (routePairAddresses[_to] != address(0) && routePairAddresses[_to] != WETH) {
            route = new address[](4);
            route[0] = _from;
            route[2] = WETH;
            route[1] = routePairAddresses[_to];
            route[3] = _to;
        } else if (_from == WETH || _to == WETH) {
            route = new address[](2);
            route[0] = _from;
            route[1] = _to;
        } else {
            route = new address[](3);
            route[0] = _from;
            route[1] = WETH;
            route[2] = _to;
        }
    }

    /* ========== RESTRICTED FUNCTIONS ========== */
    function setExchange(address _newExchange) external onlyAdmin {
        require(_newExchange != address(0), "!ZeroAddress");
        emit NewExchange(address(exchange), _newExchange);
        exchange = IUniswapRouter(_newExchange);

    }

    function setRoutePairAddress(address asset, address route) external onlyAdmin {
        routePairAddresses[asset] = route;
    }

    // Sweep airdroips / remains
    function sweep(address _token) external onlyAdmin {
        if (_token == address(0)) {
            payable(msg.sender).transfer(address(this).balance);
        } else {
            uint amount = IERC20(_token).balanceOf(address(this));
            IERC20(_token).safeTransfer(msg.sender, amount);
        }
    }
}
