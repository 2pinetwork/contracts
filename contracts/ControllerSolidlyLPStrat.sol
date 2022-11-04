// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

import "./ControllerStratAbs.sol";

import "../interfaces/ISolidlyPair.sol";
import "../interfaces/ISolidlyRouter.sol";
import "../interfaces/ISwapper.sol";

interface ISolidlyGauge {
    function deposit(uint amount, uint tokenId) external;
    function withdraw(uint amount) external;
    function getReward(address user, address[] memory rewards) external;
    function balanceOf(address user) external view returns (uint);
    function tokenIds(address token) external view returns (uint);
}

contract ControllerSolidlyLPStrat is ControllerStratAbs {
    using SafeERC20 for IERC20;
    using SafeERC20 for IERC20Metadata;

    ISolidlyGauge public immutable gauge;
    ISolidlyPair public immutable lp;
    address public immutable token0;
    address public immutable token1;
    uint public immutable tokenId;
    bool public immutable stable;

    ISwapper public swapper;

    uint public liquidityToleration = 200; // 2%

    mapping(address => ISolidlyRouter.route[]) public rewardToWantSolidlyRoute;

    constructor(
        IERC20Metadata _want,
        address _controller,
        address _exchange,
        address _treasury,
        ISolidlyGauge _gauge,
        ISolidlyPair _lp
    ) ControllerStratAbs(_want, _controller, _exchange, _treasury) {
        require(address(_gauge) != address(0), "!ZeroAddress");
        require(address(_lp) != address(0), "!ZeroAddress");
        require(_gauge.tokenIds(address(_lp))>=0, "Invalid gauge");

        gauge  = _gauge;
        lp = _lp;
        stable = _lp.stable();
        token0 = _lp.token0();
        token1 = _lp.token1();
        tokenId = _gauge.tokenIds(address(_lp));
    }

    function identifier() external view returns (string memory) {
        return string(abi.encodePacked(want.symbol(), "@SolidlyLP#1.0.0"));
    }

    function setSwapper(ISwapper _swapper) external onlyAdmin {
        require(address(_swapper) != address(0), "!ZeroAddress");
        require(_swapper != swapper, "Same swapper");
        require(_swapper.want() == address(want), "Wrong want");
        require(_swapper.strategy() == address(this), "Unknown strategy");
        require(_swapper.lp() == address(lp), "Unknown LP");

        swapper = _swapper;
    }

    function setLiquidityToleration(uint _liquidityToleration) external onlyAdmin {
        require(_liquidityToleration != liquidityToleration, "Same toleration");
        require(_liquidityToleration <= RATIO_PRECISION, "Toleration too big!");

        liquidityToleration = _liquidityToleration;
    }

    function balanceOfPool() public view override returns (uint) {
        return gauge.balanceOf(address(this));
    }

    function balanceOfPoolInWant() public view override returns (uint) {
        return _liquidityInWant(balanceOfPool());
    }

    function setRewardToWantSolidlyRoute(address _reward, ISolidlyRouter.route[] calldata _routes) external onlyAdmin {
        require(_reward != address(0), "!ZeroAddress");
        require(_routes[0].from == _reward, "First route isn't reward");
        require(_routes[_routes.length - 1].to == address(want), "Last route isn't want token");

        bool _newReward = true;

        for (uint i = 0; i < rewardTokens.length; i++) {
            if (rewardTokens[i] == _reward) {
                _newReward = false;
                break;
            }
        }

        if (_newReward) { rewardTokens.push(_reward); }

        delete rewardToWantSolidlyRoute[_reward];

        for (uint i = 0; i < _routes.length; i++) {
            rewardToWantSolidlyRoute[_reward].push(_routes[i]);
        }
    }

    function rebalance() external {
        (uint _amount0, uint _amount1) = _tokenBalances();

        _approveToken(token0, address(swapper), _amount0);
        _approveToken(token1, address(swapper), _amount1);

        swapper.rebalanceStrategy();

        _addLiquidity();
        _depositLiquidity();

        _removeAllowance(token0, address(swapper));
        _removeAllowance(token1, address(swapper));
    }

    function _deposit() internal override {
        uint _balance = wantBalance();

        if (_balance > 0) {
            _approveToken(address(want), address(swapper), _balance);

            swapper.swapWantForLpTokens(_balance);
            // just in case
            _removeAllowance(address(want), address(swapper));

            _addLiquidity();
            _depositLiquidity();
        }
    }

    // amount is the want expected to be withdrawn
    function _withdraw(uint _amount) internal override returns (uint) {
        uint _balance = wantBalance();

        if (_balance < _amount) {
            uint _liquidity = swapper.wantToLP(_amount);

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

    function _claimRewards() internal override {
        gauge.getReward(address(this), rewardTokens);
    }

    function _swapRewards() internal override virtual {
        for (uint i = 0; i < rewardTokens.length; i++) {
            address _rewardToken = rewardTokens[i];
            uint _balance = IERC20Metadata(_rewardToken).balanceOf(address(this));

            if (_balance > 0) {
                uint _expected = _expectedForSwap(_balance, _rewardToken, address(want));

                // Want price sometimes is too high so it requires a lot of rewards to swap
                if (_expected > 1) {
                    _approveToken(_rewardToken, exchange, _balance);

                    ISolidlyRouter(exchange).swapExactTokensForTokens(
                        _balance, _expected, rewardToWantSolidlyRoute[_rewardToken], address(this), block.timestamp + 60
                    );
                }
            }
        }
    }

    function _addLiquidity() internal {
        // Let's save some gas
        address _exchange = exchange;
        (uint _amount0, uint _amount1) = _tokenBalances();

        // Approve only needed amounts
        _approveToken(token0, _exchange, _amount0);
        _approveToken(token1, _exchange, _amount1);

        // Add liquidity to LP
        ISolidlyRouter(_exchange).addLiquidity(
            token0,
            token1,
            stable,
            _amount0,
            _amount1,
            _amount0 * (RATIO_PRECISION - liquidityToleration) / RATIO_PRECISION,
            _amount1 * (RATIO_PRECISION - liquidityToleration) / RATIO_PRECISION,
            address(this),
            block.timestamp + 60
        );

        _removeAllowance(token0, _exchange);
        _removeAllowance(token1, _exchange);
    }

    function _depositLiquidity() internal {
        uint _liquidity = lp.balanceOf(address(this));

        if (_liquidity > 0) {
            _approveToken(address(lp), address(gauge), _liquidity);

            gauge.deposit(_liquidity, tokenId);
        }
    }

    function _swapLPTokensForWant() internal {
        uint _liquidity = lp.balanceOf(address(this));
        (uint _amount0Min, uint _amount1Min) = swapper.lpToMinAmounts(_liquidity);

        _approveToken(address(lp), exchange, _liquidity);

        ISolidlyRouter(exchange).removeLiquidity(
            token0,
            token1,
            stable,
            _liquidity,
            _amount0Min * (RATIO_PRECISION - liquidityToleration) / RATIO_PRECISION,
            _amount1Min * (RATIO_PRECISION - liquidityToleration) / RATIO_PRECISION,
            address(this),
            block.timestamp + 60
        );

        (uint _amount0, uint _amount1) = _tokenBalances();

        _approveToken(token0, address(swapper), _amount0);
        _approveToken(token1, address(swapper), _amount1);

        swapper.swapLpTokensForWant(_amount0, _amount1);

        _removeAllowance(token0, address(swapper));
        _removeAllowance(token1, address(swapper));
    }

    function _withdrawFromPool(uint _liquidity) internal {
        gauge.withdraw(_liquidity);
    }

    function _liquidityInWant(uint _liquidity) internal view returns (uint) {
        if (_liquidity <= 0) { return 0; }

        return swapper.lpInWant(_liquidity);
    }

    function _tokenBalances() internal view returns (uint _amount0, uint _amount1) {
        _amount0 = IERC20Metadata(token0).balanceOf(address(this));
        _amount1 = IERC20Metadata(token1).balanceOf(address(this));
    }

    function _approveToken(address _token, address _dst, uint _amount) internal {
        IERC20(_token).safeApprove(_dst, _amount);
    }

    function _removeAllowance(address _token, address _dst) internal {
        if (IERC20(_token).allowance(address(this), _dst) > 0) {
            IERC20(_token).safeApprove(_dst, 0);
        }
    }
}
