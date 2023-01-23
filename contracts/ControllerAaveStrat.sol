// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

import "./ControllerStratAbs.sol";

import "../interfaces/IAave.sol";
import "../interfaces/IDataProvider.sol";
import "../interfaces/IUniswapV3.sol";

contract ControllerAaveStrat is ControllerStratAbs {
    using SafeERC20 for IERC20Metadata;

    address public immutable aToken;
    address public immutable debtToken;

    // Aave contracts (test addr)
    address public constant DATA_PROVIDER = address(0x43ca3D2C94be00692D207C6A1e60D8B325c6f12f);
    address public constant INCENTIVES = address(0xC469e7aE4aD962c30c7111dc580B4adbc7E914DD);
    address public constant POOL = address(0xb09da8a5B236fE0295A345035287e80bb0008290);

    // Profitability vars
    uint public borrowRate;
    uint public borrowRateMax;
    uint public borrowDepth;
    uint public minLeverage;
    uint constant public BORROW_DEPTH_MAX = 10;
    uint constant public INTEREST_RATE_MODE = 2; // variable
    uint constant public MIN_HEALTH_FACTOR = 1.05e18;  // Always at least 1.05 to not enter default like Arg

    // The healthFactor value has the same representation than supply so
    // to do the math we should remove 12 places from healthFactor to get a HF
    // with only 6 "decimals" and add 6 "decimals" to supply to divide like we do IRL.
    uint public constant HF_DECIMAL_FACTOR = 1e6;
    uint public constant HF_WITHDRAW_TOLERANCE = 0.05e6;

    // UniswapV3 has different fees between each pool (Commonly is 0.3% but can be 0.1% or 1%
    mapping(address => mapping(address => uint24)) public tokenToTokenSwapFee;

    constructor(
        IERC20Metadata _want,
        address _controller,
        address _exchange,
        address _treasury,
        uint _borrowRate,
        uint _borrowRateMax,
        uint _borrowDepth,
        uint _minLeverage
    ) ControllerStratAbs(_want, _controller, _exchange, _treasury) {
        require(_borrowRate <= _borrowRateMax, "!Borrow <= MaxBorrow");
        require(_borrowRateMax <= RATIO_PRECISION, "!MaxBorrow <= 100%");

        borrowRate = _borrowRate;
        borrowRateMax = _borrowRateMax;
        borrowDepth = _borrowDepth;
        minLeverage = _minLeverage;

        (aToken,,debtToken) = IDataProvider(DATA_PROVIDER).getReserveTokensAddresses(address(_want));
    }

    function identifier() external view returns (string memory) {
        return string(abi.encodePacked(
            want.symbol(), "@AaveV3#1.0.0"
        ));
    }

    function setTokenToTokenSwapFee(address _tokenA, address _tokenB, uint24 _fee) external onlyAdmin {
        require(_tokenA != address(0), "!ZeroAddress tokenA");
        require(_tokenB != address(0), "!ZeroAddress tokenB");
        require(_fee >= 0, "Fee can't be negative");

        tokenToTokenSwapFee[_tokenA][_tokenB] = _fee;
    }

    function _deposit() internal override {
        uint _amount = wantBalance();

        if (_amount <= 0 ) { return; }

        want.safeApprove(POOL, _amount);
        IAaveLendingPool(POOL).supply(address(want), _amount, address(this), 0);

        if (_amount < minLeverage) { return; }

        // Borrow & deposit strategy
        for (uint i = 0; i < borrowDepth; i++) {
            _amount = (_amount * borrowRate) / RATIO_PRECISION;

            IAaveLendingPool(POOL).borrow(address(want), _amount, INTEREST_RATE_MODE, 0, address(this));
            want.safeApprove(POOL, _amount);
            IAaveLendingPool(POOL).supply(address(want), _amount, address(this), 0);

            if (_amount < minLeverage || _outOfGasForLoop()) { break; }
        }
    }

    function _withdrawAll() internal override returns (uint) {
        uint _balance = wantBalance();

        // Repay all debt with aTokens
        IAaveLendingPool(POOL).repayWithATokens(address(want), type(uint).max, INTEREST_RATE_MODE);
        // Withdraw everything
        IAaveLendingPool(POOL).withdraw(address(want), type(uint).max, address(this));

        return wantBalance() - _balance;
    }

    function _withdraw(uint _needed) internal override returns (uint) {
        // Instead of a require() to raise an exception, the fullDeleverage should
        // fix the health factor
        if (currentHealthFactor() <= MIN_HEALTH_FACTOR) { return _withdrawAll(); }

        uint _balance = wantBalance();

        // Keep the "same" healthFactor after withdraw
        uint _toRepay = _needed * borrowRate / RATIO_PRECISION;
        IAaveLendingPool(POOL).repayWithATokens(address(want), _toRepay, INTEREST_RATE_MODE);

        IAaveLendingPool(POOL).withdraw(address(want), _needed, address(this));

        return wantBalance() - _balance;
    }

    // This function is useful to increase Aave HF (to prevent liquidation) and
    // in case of "stucked while loop for withdraws" the strategy can be paused, and then
    // use this function the N needed times to get all the resources out of the Aave pool
    function increaseHealthFactor(uint _byRatio) external onlyAdmin nonReentrant {
        require(_byRatio <= RATIO_PRECISION, "Can't be more than 100%");
        require(borrowDepth > 0, "Not needed");

        (uint _supplyBal, ) = supplyAndBorrow();

        uint _toRepay = (_maxWithdrawFromSupply(_supplyBal) * _byRatio) / RATIO_PRECISION;

        IAaveLendingPool(POOL).repayWithATokens(address(want), _toRepay, INTEREST_RATE_MODE);
    }

    function rebalance(uint _borrowRate, uint _borrowDepth) external onlyAdmin nonReentrant {
        require(_borrowRate <= borrowRateMax, "Exceeds max borrow rate");
        require(_borrowDepth <= BORROW_DEPTH_MAX, "Exceeds max borrow depth");

        _withdrawAll();

        borrowRate = _borrowRate;
        borrowDepth = _borrowDepth;

        if (!paused() && wantBalance() > 0) { _deposit(); }
    }

    // Divide the supply with HF less 0.5 to finish at least with HF~=1.05
    function _maxWithdrawFromSupply(uint _supply) internal view returns (uint) {
        // The healthFactor value has the same representation than supply so
        // to do the math we should remove 12 places from healthFactor to get a HF
        // with only 6 "decimals" and add 6 "decimals" to supply to divide like we do IRL.
        uint _hfDecimals = 1e18 / HF_DECIMAL_FACTOR;

        return _supply - (
            (_supply * HF_DECIMAL_FACTOR) / ((currentHealthFactor() / _hfDecimals) - HF_WITHDRAW_TOLERANCE)
        );
    }

    function balanceOfPoolInWant() public view override returns (uint) {
        return balanceOfPool();
    }

    // it calculates how much 'want' the strategy has working in the controller.
    function balanceOfPool() public view override returns (uint) {
        (uint _supplyBal, uint _borrowBal) = supplyAndBorrow();
        return _supplyBal - _borrowBal;
    }

    function _claimRewards() internal override {
        // Incentive controller only receive aToken addresses
        address[] memory _assets = new address[](2);
        _assets[0] = aToken;
        _assets[1] = debtToken;

        // If there's no rewards, it's because the reward == want
        address _reward;
        if (rewardTokens.length == 0 || rewardTokens[0] == address(0)) _reward = address(want);
        else _reward = rewardTokens[0];

        // aave reward should always be the first
        IAaveIncentivesController(INCENTIVES).claimRewards(
            _assets, type(uint).max, address(this), _reward
        );
    }

    function userReserves() public view returns (
        uint256 currentATokenBalance,
        uint256 currentStableDebt,
        uint256 currentVariableDebt,
        uint256 principalStableDebt,
        uint256 scaledVariableDebt,
        uint256 stableBorrowRate,
        uint256 liquidityRate,
        uint40 stableRateLastUpdated,
        bool usageAsCollateralEnabled
    ) {
        return IDataProvider(DATA_PROVIDER).getUserReserveData(address(want), address(this));
    }

    function supplyAndBorrow() public view returns (uint, uint) {
        (uint _supplyBal,, uint _borrowBal,,,,,,) = userReserves();
        return (_supplyBal, _borrowBal);
    }

    // returns the user account data across all the reserves
    function userAccountData() public view returns (
        uint totalCollateralETH,
        uint totalDebtETH,
        uint availableBorrowsETH,
        uint currentLiquidationThreshold,
        uint ltv,
        uint healthFactor
    ) {
        return IAaveLendingPool(POOL).getUserAccountData(address(this));
    }

    function currentHealthFactor() public view returns (uint) {
        (,,,,, uint _healthFactor) = userAccountData();

        return _healthFactor;
    }

    // UniswapV3
    function _swapRewards() internal override {
        for (uint i = 0; i < rewardTokens.length; i++) {
            address _rewardToken = rewardTokens[i];
            uint _balance = IERC20Metadata(_rewardToken).balanceOf(address(this));

            if (_balance > 0) {
                uint _expected = _expectedForSwap(_balance, _rewardToken, address(want));

                // Want price sometimes is too high so it requires a lot of rewards to swap
                if (_expected > 1) {
                    IERC20Metadata(_rewardToken).safeApprove(exchange, _balance);

                    bytes memory _path = abi.encodePacked(_rewardToken);

                    for (uint j = 1; j < rewardToWantRoute[_rewardToken].length; j++) {
                        uint24 _fee = tokenToTokenSwapFee[rewardToWantRoute[_rewardToken][j - 1]][rewardToWantRoute[_rewardToken][j]];

                        _path = abi.encodePacked(
                            _path,
                            _fee,
                            rewardToWantRoute[_rewardToken][j]
                        );
                    }

                    IUniswapV3Router(exchange).exactInput(IUniswapV3Router.ExactInputParams({
                        path: _path,
                        recipient: address(this),
                        deadline: block.timestamp + 60,
                        amountIn: _balance,
                        amountOutMinimum: _expected
                    }));
                }
            }
        }
    }
}
