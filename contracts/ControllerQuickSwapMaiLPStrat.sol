// SPDX-License-Identifier: MIT

pragma solidity 0.8.13;

import "./ControllerStratAbs.sol";

import "../interfaces/IMasterChef.sol";
import "../interfaces/IUniswapPair.sol";

interface Swapper {
   function lp() external view returns (address);
   function strategy() external view returns (address);
   function swapWantForLpTokens(uint) external returns (uint, uint);
   function swapLpTokensForWant(uint, uint) external returns (uint);
   function lpInWant(uint) external view returns (uint);
   function lpToMinAmounts(uint) external view returns (uint, uint);
   function wantToLP(uint) external view returns (uint);
}

contract ControllerQuickSwapMaiLPStrat is ControllerStratAbs {
    using SafeERC20 for IERC20;
    using SafeERC20 for IERC20Metadata;

    address constant public MAI_FARM = address(0x574Fe4E8120C4Da1741b5Fd45584de7A5b521F0F); // MAI-USDC farm
    address constant public QUICKSWAP_LP = address(0x160532D2536175d65C03B97b0630A9802c274daD); // USDC-MAI
    address constant public TOKEN_0 = address(0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174); // USDC
    address constant public TOKEN_1 = address(0xa3Fa99A148fA48D14Ed51d610c367C61876997F1); // MAI

    uint public constant POOL_ID = 1;
    uint public minWantToRedeposit;
    uint public liquidityToleration = 200; // 2%

    Swapper public swapper;

    bool private depositMutex = false;

    constructor(
        IERC20Metadata _want,
        address _controller,
        address _exchange,
        address _treasury,
        uint _minWantToRedeposit
    ) ControllerStratAbs(_want, _controller, _exchange, _treasury) {
        minWantToRedeposit = _minWantToRedeposit;
    }

    function identifier() external view returns (string memory) {
        return string(abi.encodePacked(want.symbol(), "@QuickSwapMaiLP#1.0.0"));
    }

    function setSwapper(Swapper _swapper) external onlyAdmin {
        require(address(_swapper) != address(0), "!ZeroAddress");
        require(_swapper != swapper, "Same swapper");
        require(_swapper.strategy() == address(this), "Unknown strategy");
        require(_swapper.lp() == QUICKSWAP_LP, "Unknown LP");

        swapper = _swapper;
    }


    function harvest() public nonReentrant override {
        uint _before = wantBalance();

        _claimRewards();
        _swapRewards();

        uint _harvested = wantBalance() - _before;

        // Charge performance fee for earned want + rewards
        _beforeMovement();

        // re-deposit
        if (!paused() && wantBalance() > minWantToRedeposit) {
            _deposit();
        }

        // Update lastBalance for the next movement
        _afterMovement();

        emit Harvested(address(want), _harvested);
    }

    function setMinWantToRedeposit(uint _minWantToRedeposit) external onlyAdmin {
        require(_minWantToRedeposit != minWantToRedeposit, "Same minimum value");

        minWantToRedeposit = _minWantToRedeposit;
    }

    function setLiquidityToleration(uint _liquidityToleration) external onlyAdmin {
        require(_liquidityToleration != liquidityToleration, "Same toleration");
        require(_liquidityToleration <= RATIO_PRECISION, "Toleration too big!");

        liquidityToleration = _liquidityToleration;
    }

    function balanceOfPool() public view override returns (uint) {
        (uint _amount,) = IMasterChef(MAI_FARM).userInfo(POOL_ID, address(this));

        return _amount;
    }

    function balanceOfPoolInWant() public view override returns (uint) {
        return _liquidityInWant(balanceOfPool());
    }

    function _deposit() internal override {
        uint _balance = wantBalance();

        if (_balance > 0) {
            want.safeApprove(address(swapper), _balance);

            (uint _amount0, uint _amount1) = swapper.swapWantForLpTokens(_balance);
            // just in case
            _removeAllowance(address(want), address(swapper));

            _addLiquidity(_amount0, _amount1);
        }

        if (depositMutex) { depositMutex = false; }
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
        // Weird behavior, but this mean "harvest" or "claim".
        IMasterChef(MAI_FARM).deposit(POOL_ID, 0);
    }

    function _addLiquidity(uint _amount0, uint _amount1) internal {
        // Approve only needed amounts
        _approveToken(TOKEN_0, exchange, _amount0);
        _approveToken(TOKEN_1, exchange, _amount1);

        // Add liquidity to the LP
        (, , uint _liquidity) = IUniswapRouter(exchange).addLiquidity(
            TOKEN_0,
            TOKEN_1,
            _amount0,
            _amount1,
            _amount0 * (RATIO_PRECISION - liquidityToleration) / RATIO_PRECISION,
            _amount1 * (RATIO_PRECISION - liquidityToleration) / RATIO_PRECISION,
            address(this),
            block.timestamp + 60
        );

        if (_liquidity > 0) {
            uint _lpLiquidity = IERC20(QUICKSWAP_LP).balanceOf(address(this));

            _approveToken(QUICKSWAP_LP, MAI_FARM, _lpLiquidity);

            // This has a 0.5% of deposit fee
            IMasterChef(MAI_FARM).deposit(POOL_ID, _lpLiquidity);
        }

        _removeAllowance(TOKEN_0, exchange);
        _removeAllowance(TOKEN_1, exchange);

        // Some recursion is needed when swaps required for LP are "not well balanced".
        if (wantBalance() > minWantToRedeposit && !depositMutex) {
            depositMutex = true;

            _deposit();
        }
    }

    function _swapLPTokensForWant() internal {
        uint _liquidity = IERC20(QUICKSWAP_LP).balanceOf(address(this));
        (uint _amount0Min, uint _amount1Min) = swapper.lpToMinAmounts(_liquidity);

        _amount0Min = _amount0Min * (RATIO_PRECISION - liquidityToleration) / RATIO_PRECISION;
        _amount1Min = _amount1Min * (RATIO_PRECISION - liquidityToleration) / RATIO_PRECISION;

        _approveToken(QUICKSWAP_LP, exchange, _liquidity);

        (uint _amount0, uint _amount1) = IUniswapRouter(exchange).removeLiquidity(
            TOKEN_0,
            TOKEN_1,
            _liquidity,
            _amount0Min,
            _amount1Min,
            address(this),
            block.timestamp + 60
        );

        _approveToken(TOKEN_0, address(swapper), _amount0);
        _approveToken(TOKEN_1, address(swapper), _amount1);

        swapper.swapLpTokensForWant(_amount0, _amount1);

        _removeAllowance(TOKEN_0, address(swapper));
        _removeAllowance(TOKEN_1, address(swapper));
    }

    function _withdrawFromPool(uint _liquidity) internal {
        IMasterChef(MAI_FARM).withdraw(POOL_ID, _liquidity);
    }

    function _liquidityInWant(uint _liquidity) internal view returns (uint) {
        if (_liquidity <= 0) { return 0; }

        return swapper.lpInWant(_liquidity);
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
