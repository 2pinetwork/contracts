// SPDX-License-Identifier: MIT

pragma solidity 0.8.13;

import "./ControllerStratAbs.sol";

import "../interfaces/IMasterChef.sol";
import "../interfaces/IUniswapPair.sol";

contract ControllerQuickSwapMaiLPStrat is ControllerStratAbs {
    using SafeERC20 for IERC20;
    using SafeERC20 for IERC20Metadata;

    address constant public MAI_FARM = address(0x574Fe4E8120C4Da1741b5Fd45584de7A5b521F0F); // MIM-USDC farm
    address constant public QUICKSWAP_LP = address(0x160532D2536175d65C03B97b0630A9802c274daD); // USDC-MIM
    address constant public TOKEN_0 = address(0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174); // USDC
    address constant public TOKEN_1 = address(0xa3Fa99A148fA48D14Ed51d610c367C61876997F1); // MIM

    uint public constant POOL_ID = 1;
    uint public constant LIQUIDITY_PRECISION = 10000; // 100%
    uint public MAX_WANT_BALANCE;
    uint public LIQUIDITY_TOLERATION = 3000; // 30%

    bool private depositMutex = false;

    mapping(address => mapping(address => address[])) public routes;

    constructor(
        IERC20Metadata _want,
        address _controller,
        address _exchange,
        address _treasury,
        uint _maxWantBalance
    ) ControllerStratAbs(_want, _controller, _exchange, _treasury) {
        MAX_WANT_BALANCE = _maxWantBalance;
    }

    function identifier() external view returns (string memory) {
        return string(abi.encodePacked(want.symbol(), "@QuickSwapMaiLP#1.0.0"));
    }

    function harvest() public nonReentrant override {
        uint _before = wantBalance();

        _claimRewards();
        _swapRewards();

        uint _harvested = wantBalance() - _before;

        // Charge performance fee for earned want + rewards
        _beforeMovement();

        // re-deposit
        if (!paused() && wantBalance() > MAX_WANT_BALANCE) {
            _deposit();
        }

        // Update lastBalance for the next movement
        _afterMovement();

        emit Harvested(address(want), _harvested);
    }

    function setRoute(address _from, address[] calldata _route) external onlyAdmin {
        require(_from != address(0), "!ZeroAddress");
        require(_route[0] == _from, "First route isn't from");
        require(_route[_route.length - 1] != _from, "Last route is same as from");
        require(_route.length > 1, "Route length < 2");

        routes[_from][_route[_route.length - 1]] = _route;
    }

    function setMaxWantBalance(uint _maxWantBalance) external onlyAdmin {
        require(_maxWantBalance != MAX_WANT_BALANCE, "Same want balance");

        MAX_WANT_BALANCE = _maxWantBalance;
    }

    function setLiquidityToleration(uint _liquidityToleration) external onlyAdmin {
        require(_liquidityToleration != LIQUIDITY_TOLERATION, "Same toleration");
        require(_liquidityToleration <= LIQUIDITY_PRECISION, "Toleration too big!");

        LIQUIDITY_TOLERATION = _liquidityToleration;
    }

    function balanceOfPool() public view override returns (uint) {
        (uint _amount,) = IMasterChef(MAI_FARM).userInfo(POOL_ID, address(this));

        return _amount;
    }

    function balanceOfPoolInWant() public view override returns (uint) {
        return _liquidityInWant(balanceOfPool());
    }

    function _deposit() internal override {
        (uint _amount0, uint _amount1) = _swapWantForLPTokens();

        _addLiquidity(_amount0, _amount1);

        if (depositMutex) { depositMutex = false; }
    }

    // amount is the want expected to be withdrawn
    function _withdraw(uint _amount) internal override returns (uint) {
        uint _balance = wantBalance();

        if (_balance < _amount) {
            uint _sellAmount = _amount / 2;
            uint _amount0 = _getAmountsOut(address(want), TOKEN_0, _sellAmount);
            uint _amount1 = _getAmountsOut(address(want), TOKEN_1, _amount - _sellAmount);
            uint _liquidity = _estimateLPLiquidity(_amount0, _amount1);

            _withdrawFromPool(_liquidity);
            _swapLPTokensForWant();
        }

        uint _withdrawn = wantBalance() - _balance;

        return (_withdrawn > _amount) ? _amount : _withdrawn;
    }

    function _withdrawAll() internal override returns (uint) {
        uint _balance = wantBalance();
        uint _liquidity = balanceOfPool();

        if (_liquidity > 0) {
            _withdrawFromPool(_liquidity);
            _swapLPTokensForWant();
        }

        return wantBalance() - _balance;
    }

    function _claimRewards() internal {
        // Weird behavior, but this mean "harvest" or "claim".
        IMasterChef(MAI_FARM).deposit(POOL_ID, 0);
    }

    function _addLiquidity(uint _amount0, uint _amount1) internal {
        // Approve only needed amounts
        _approveToken(TOKEN_0, _amount0);
        _approveToken(TOKEN_1, _amount1);

        // Add liquidity to the LP
        (,, uint _liquidity) = IUniswapRouter(exchange).addLiquidity(
            TOKEN_0,
            TOKEN_1,
            _amount0,
            _amount1,
            _amount0 * (LIQUIDITY_PRECISION - LIQUIDITY_TOLERATION) / LIQUIDITY_PRECISION,
            _amount1 * (LIQUIDITY_PRECISION - LIQUIDITY_TOLERATION) / LIQUIDITY_PRECISION,
            address(this),
            block.timestamp + 60
        );

        if (_liquidity > 0) {
            uint _lpLiquidity = IERC20(QUICKSWAP_LP).balanceOf(address(this));

            IERC20(QUICKSWAP_LP).safeApprove(MAI_FARM, _lpLiquidity);

            IMasterChef(MAI_FARM).deposit(POOL_ID, _lpLiquidity);
        }

        _removeAllowance(TOKEN_0);
        _removeAllowance(TOKEN_1);

        // Some recursion is needed when swaps required for LP are "not well balanced".
        if (wantBalance() > MAX_WANT_BALANCE && !depositMutex) {
            depositMutex = true;

            _deposit();
        }
    }

    function _swapWantForLPTokens() internal returns (uint _amount0, uint _amount1) {
        uint _balance = wantBalance();
        uint _sellAmount = _balance / 2;

        _amount0 = _balance - _sellAmount;

        // If want is one of the LP tokens we need to swap just 1
        if (address(want) == TOKEN_0) {
            _amount1 = _swap(address(want), _sellAmount, TOKEN_1);
        } else if (address(want) == TOKEN_1) {
            _amount1 = _amount0; // _balance - _sellAmount
            _amount0 = _swap(address(want), _sellAmount, TOKEN_0);
        } else {
            // If want isn't one of LP tokens we swap half for each one
            _amount1 = _swap(address(want), _amount0, TOKEN_1);
            _amount0 = _swap(address(want), _sellAmount, TOKEN_0);
        }
    }

    function _swapLPTokensForWant() internal {
        uint _liquidity = IERC20(QUICKSWAP_LP).balanceOf(address(this));
        (uint _amount0Min, uint _amount1Min) = _estimateMinAmounts(_liquidity);

        IERC20(QUICKSWAP_LP).safeApprove(exchange, _liquidity);

        (uint _amount0, uint _amount1) = IUniswapRouter(exchange).removeLiquidity(
            TOKEN_0,
            TOKEN_1,
            _liquidity,
            _amount0Min,
            _amount1Min,
            address(this),
            block.timestamp + 60
        );

        if (address(want) == TOKEN_0) {
            _swap(TOKEN_1, _amount1, address(want));
        } else if (address(want) == TOKEN_1) {
            _swap(TOKEN_0, _amount0, address(want));
        } else {
            _swap(TOKEN_0, _amount0, address(want));
            _swap(TOKEN_1, _amount1, address(want));
        }
    }

    function _withdrawFromPool(uint _liquidity) internal {
        IMasterChef(MAI_FARM).withdraw(POOL_ID, _liquidity);
    }

    function _estimateMinAmounts(uint _liquidity) internal view returns (uint _amount0Min, uint _amount1Min) {
        IUniswapPair _pair = IUniswapPair(QUICKSWAP_LP);
        uint _lpTotalSupply = _pair.totalSupply();
        (uint112 _reserve0, uint112 _reserve1,) = _pair.getReserves();

        _amount0Min = _liquidity * _reserve0 / _lpTotalSupply;
        _amount1Min = _liquidity * _reserve1 / _lpTotalSupply;
    }

    function _estimateLPLiquidity(uint _amount0, uint _amount1) internal view returns (uint) {
        (uint112 _reserve0, uint112 _reserve1,) = IUniswapPair(QUICKSWAP_LP).getReserves();
        uint _lpTotalSupply = IUniswapPair(QUICKSWAP_LP).totalSupply();
        uint _expected0 = _amount0 * (RATIO_PRECISION + poolSlippageRatio) / RATIO_PRECISION;
        uint _expected1 = _amount1 * (RATIO_PRECISION + poolSlippageRatio) / RATIO_PRECISION;

        // They should be equal, but just in case we strive for maximum liquidity =)
        return _max(_expected0 * _lpTotalSupply / _reserve0, _expected1 * _lpTotalSupply / _reserve1);
    }

    function _liquidityInWant(uint _liquidity) internal view returns (uint) {
        if (_liquidity <= 0) {
            return 0;
        } else {
            IUniswapPair _pair = IUniswapPair(QUICKSWAP_LP);

            (uint112 _reserve0, uint112 _reserve1,) = _pair.getReserves();

            uint _lpTotalSupply = _pair.totalSupply();
            uint _amount0 = _reserve0 * _liquidity / _lpTotalSupply;
            uint _amount1 = _reserve1 * _liquidity / _lpTotalSupply;
            uint _received0 = _getAmountsOut(TOKEN_0, address(want), _amount0);
            uint _received1 = _getAmountsOut(TOKEN_1, address(want), _amount1);

            return _received0 + _received1;
        }
    }

    function _getAmountsOut(address _from, address _to, uint _amount) internal view returns (uint) {
        if (_from == _to) {
            return _amount;
        } else {
            address[] memory _route = _getRoute(_from, _to);
            uint[] memory amounts = IUniswapRouter(exchange).getAmountsOut(_amount, _route);

            return amounts[amounts.length - 1];
        }
    }

    function _getRoute(address _from, address _to) internal view returns (address[] memory) {
        address[] memory _route = routes[_from][_to];

        require(_route.length > 1, "Invalid route!");

        return _route;
    }

    function _swapRewards() internal {
        for (uint i = 0; i < rewardTokens.length; i++) {
            address _rewardToken = rewardTokens[i];
            uint _balance = IERC20(_rewardToken).balanceOf(address(this));

            if (_balance > 0) {
                uint _expected = _expectedForSwap(_balance, _rewardToken, address(want));

                // Want price sometimes is too high so it requires a lot of rewards to swap
                if (_expected > 1) {
                    IERC20(_rewardToken).safeApprove(exchange, _balance);

                    IUniswapRouter(exchange).swapExactTokensForTokens(
                        _balance, _expected, rewardToWantRoute[_rewardToken], address(this), block.timestamp + 60
                    );
                }
            }
        }
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

    function _approveToken(address _token, uint _amount) internal {
        IERC20(_token).safeApprove(address(exchange), _amount);
    }

    function _removeAllowance(address _token) internal {
        if (IERC20(_token).allowance(address(this), address(exchange)) > 0) {
            IERC20(_token).safeApprove(address(exchange), 0);
        }
    }

    function _max(uint _x, uint _y) internal pure returns (uint) {
        return _x > _y ? _x : _y;
    }
}
