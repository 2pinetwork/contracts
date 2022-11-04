// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

import "./SwapperWithCompensationAbs.sol";
import "../interfaces/IUniswapRouter.sol";

contract SwapperWithCompensationUniV2 is SwapperWithCompensationAbs {
    mapping(address => mapping(address => address[])) public routes;

    constructor(
        IERC20Metadata _want,
        IUniswapPair _lp,
        address _strategy,
        address _exchange
    ) SwapperWithCompensationAbs(_want, _lp, _strategy, _exchange) { }

    function setRoute(address _from, address[] calldata _route) external onlyAdmin {
        require(_from != address(0), "!ZeroAddress");
        require(_route[0] == _from, "First route isn't from");
        require(_route[_route.length - 1] != _from, "Last route is same as from");
        require(_route.length > 1, "Route length < 2");

        routes[_from][_route[_route.length - 1]] = _route;
    }

    function _swap(address _from, uint _amount, address _to) internal override returns (uint) {
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

    function _getAmountsOut(IERC20Metadata _from, IERC20Metadata _to, uint _amount) internal override view returns (uint) {
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
}
