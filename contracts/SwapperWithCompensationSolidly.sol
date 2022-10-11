// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

import "./SwapperWithCompensationAbs.sol";
import "../interfaces/ISolidlyRouter.sol";

contract SwapperWithCompensationSolidly is SwapperWithCompensationAbs {
    mapping(address => mapping(address => ISolidlyRouter.route[])) public routes;

    constructor(
        IERC20Metadata _want,
        IUniswapPair _lp,
        address _strategy,
        address _exchange
    ) SwapperWithCompensationAbs(_want, _lp, _strategy, _exchange) { }

    function setRoute(address _from, ISolidlyRouter.route[] calldata _routes) external onlyAdmin {
        require(_from != address(0), "!ZeroAddress");
        require(_routes[0].from == _from, "First route isn't from");
        require(_routes[_routes.length - 1].to != _from, "Last route is same as from");
        require(_routes.length > 0, "Route length < 1");

        for (uint i = 0; i < _routes.length; i++) {
            routes[_from][_routes[_routes.length - 1].to].push(_routes[i]);
        }
    }

    function _swap(address _from, uint _amount, address _to) internal override returns (uint) {
        ISolidlyRouter.route[] memory _route = _getRoute(_from, _to);

        if (_amount > 0) {
            uint _expected = _expectedForSwap(_amount, _from, _to);

            if (_expected > 1) {
                _approveToken(_from, _amount);

                uint[] memory _amounts = ISolidlyRouter(exchange).swapExactTokensForTokens(
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
            ISolidlyRouter.route[] memory _route = _getRoute(address(_from), address(_to));
            uint[] memory amounts = ISolidlyRouter(exchange).getAmountsOut(_amount, _route);

            return amounts[amounts.length - 1];
        }
    }

    function _getRoute(address _from, address _to) internal view returns (ISolidlyRouter.route[] memory) {
        ISolidlyRouter.route[] memory _route = routes[_from][_to];

        require(_route.length > 0, "Invalid route!");

        return _route;
    }
}
