// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "./CommonContract.sol";

import "../interfaces/IAave.sol";
import "../interfaces/IController.sol";
import "../interfaces/IDataProvider.sol";
import "../interfaces/IUniswapRouter.sol";

contract AaveStrategy is CommonContract {
    using SafeERC20 for IERC20;
    using Address for address;
    using SafeMath for uint;
    using SafeMath for uint8;

    address public constant wmatic = address(0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270);

    address public want;
    address public aToken;
    address public debtToken;

    // Aave contracts
    address public constant dataProvider = address(0x7551b5D2763519d4e37e8B81929D336De671d46d);
    address public constant incentivesController = address(0x357D51124f59836DeD84c8a1730D72B749d8BC23);
    address public constant pool = address(0x8dFf5E27EA6b7AC08EbFdf9eB090F32ee9a30fcf);

    // Routes
    address[] public wmaticToWantRoute;

    address public controller;
    address public treasury;

    // Profitability vars
    uint public borrowRate;
    uint public borrowRateMax;
    uint public borrowDepth;
    uint public minLeverage;
    uint constant public BORROW_DEPTH_MAX = 10;
    uint constant public INTEREST_RATE_MODE = 2; // variable
    uint constant public MIN_HEALTH_FACTOR = 1.05e18;  // Always at least 1.05 to not enter default like Arg

    address public exchange;

    // Fees
    uint constant public FEE_MAX = 10000;
    uint constant public PERFORMANCE_FEE = 350; // 3.5%
    uint constant public MAX_WITHDRAW_FEE = 100; // 1%
    uint public withdrawFee = 10; // 0.1%

    constructor(
        address _want,
        uint _borrowRate,
        uint _borrowRateMax,
        uint _borrowDepth,
        uint _minLeverage,
        address _controller,
        address _exchange
    ) {
        require(_want != address(0), "want zero address");
        require(_controller != address(0), "controller zero address");
        require(IController(_controller).vaults(_want) != address(0), "Controller vault zero address");

        want = _want;
        borrowRate = _borrowRate;
        borrowRateMax = _borrowRateMax;
        borrowDepth = _borrowDepth;
        minLeverage = _minLeverage;
        controller = _controller;
        exchange = _exchange;
        treasury = msg.sender;

        wmaticToWantRoute = [wmatic, want];

        (aToken,,debtToken) = IDataProvider(dataProvider).getReserveTokensAddresses(want);

        _giveAllowances();
    }

    modifier onlyController() {
        require(msg.sender == controller, "!controller");
        _;
    }

    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
    }

    function setExchange(address _exchange) external onlyOwner {
        // Revoke current exchange
        IERC20(wmatic).safeApprove(exchange, 0);

        exchange = _exchange;
        IERC20(wmatic).safeApprove(exchange, type(uint).max);
    }

    // `withdrawFee` can't be more than 1%
    function setWithdrawFee(uint _fee) external onlyOwner {
        require(_fee <= MAX_WITHDRAW_FEE, "!cap");

        withdrawFee = _fee;
    }

    function setSwapRoute(address[] calldata _route) external onlyOwner {
        wmaticToWantRoute = _route;
    }

    function wantBalance() public view returns (uint) {
        return IERC20(want).balanceOf(address(this));
    }

    function deposit() public whenNotPaused {
        uint _balance = wantBalance();

        if (_balance > 0) {
            _leverage(_balance);
        }
    }

    function _leverage(uint _amount) internal {
        IAaveLendingPool(pool).deposit(want, _amount, address(this), 0);

        if (_amount < minLeverage) {
            return;
        }

        // Borrow & deposit strategy
        for (uint i = 0; i < borrowDepth; i++) {
            _amount = _amount.mul(borrowRate).div(100);

            IAaveLendingPool(pool).borrow(want, _amount, INTEREST_RATE_MODE, 0, address(this));
            IAaveLendingPool(pool).deposit(want, _amount, address(this), 0);

            if (_amount < minLeverage) {
                break;
            }
        }
    }

    function _fullDeleverage() internal {
        (uint supplyBal, uint borrowBal) = supplyAndBorrow();
        uint toWithdraw;

        while (borrowBal > 0) {
            toWithdraw = maxWithdrawFromSupply(supplyBal);

            IAaveLendingPool(pool).withdraw(want, toWithdraw, address(this));
            // Repay only will use the needed
            IAaveLendingPool(pool).repay(want, toWithdraw, INTEREST_RATE_MODE, address(this));

            (supplyBal, borrowBal) = supplyAndBorrow();
        }

        if (supplyBal > 0) {
            IAaveLendingPool(pool).withdraw(want, type(uint).max, address(this));
        }
    }

    function increaseHealthFactor() external onlyOwner {
        (uint supplyBal,) = supplyAndBorrow();

        // Only withdraw the 10% of the max withdraw
        uint toWithdraw = maxWithdrawFromSupply(supplyBal).mul(100).div(10);

        IAaveLendingPool(pool).withdraw(want, toWithdraw, address(this));
        IAaveLendingPool(pool).repay(want, toWithdraw, INTEREST_RATE_MODE, address(this));
    }

    function rebalance(uint _borrowRate, uint _borrowDepth) external onlyOwner {
        require(_borrowRate <= borrowRateMax, "!rate");
        require(_borrowDepth <= BORROW_DEPTH_MAX, "!depth");

        _fullDeleverage();
        borrowRate = _borrowRate;
        borrowDepth = _borrowDepth;

        deposit();
    }

    function vault() public view returns (address) {
        return IController(controller).vaults(want);
    }

    // Divide the supply with HF less 0.5 to finish at least with HF~=1.05
    function maxWithdrawFromSupply(uint _supply) internal view returns (uint) {
        // The healthFactor value has the same representation than supply so
        // to do the math we should remove 12 places from healthFactor to get a HF
        // with only 6 "decimals" and add 6 "decimals" to supply to divide like we do IRL.
        return _supply.sub(
            _supply.mul(1e6).div(
                currentHealthFactor().div(1e12).sub(0.05e6)
            )
        );
    }

    function _partialDeleverage(uint _needed) internal {
        // Instead of a require() to raise an exception, the fullDeleverage should
        // fix the health factor
        if (currentHealthFactor() <= MIN_HEALTH_FACTOR) {
            _fullDeleverage();

            return;
        }

        uint borrowBal;
        uint supplyBal;
        uint toWithdraw;
        uint toRepay;

        while (_needed > wantBalance()) {
            (supplyBal, borrowBal) = supplyAndBorrow();
            toWithdraw = maxWithdrawFromSupply(supplyBal);

            IAaveLendingPool(pool).withdraw(want, toWithdraw, address(this));

            // for depth == 0
            if (borrowBal > 0) {
                // Only repay the just amount
                toRepay = toWithdraw.mul(borrowRate).div(100);
                IAaveLendingPool(pool).repay(want, toRepay, INTEREST_RATE_MODE, address(this));
            }
        }
    }

    // Withdraw partial funds, normally used with a vault withdrawal
    function withdraw(uint _amount) external onlyController {
        uint balance = wantBalance();

        if (balance < _amount) {
            // If the amount is at least the half of the real deposit
            // we have to do a full deleverage, in other case the withdraw+repay
            // will looping for ever.
            if (_amount.mul(2) >= balanceOfPool()) {
                _fullDeleverage();
            } else {
                _partialDeleverage(_amount.sub(balance));
            }
        }

        if (tx.origin == owner()) {
            // Yield balancer
            IERC20(want).safeTransfer(vault(), _amount);
        } else {
            uint withdrawalFee = _amount.mul(withdrawFee).div(FEE_MAX);
            IERC20(want).safeTransfer(vault(), _amount.sub(withdrawalFee));
            IERC20(want).safeTransfer(treasury, withdrawalFee);
        }

        if (!paused()) {
            deposit();
        }
    }

    function balanceOf() public view returns (uint) {
        return wantBalance().add(balanceOfPool());
    }

    // it calculates how much 'want' the strategy has working in the farm.
    function balanceOfPool() public view returns (uint) {
        (uint supplyBal, uint borrowBal) = supplyAndBorrow();
        return supplyBal.sub(borrowBal);
    }


    function claimRewards() internal {
        // Incentive controller only receive aToken addresses
        address[] memory assets = new address[](2);
        assets[0] = aToken;
        assets[1] = debtToken;

        IAaveIncentivesController(incentivesController).claimRewards(
            assets, type(uint).max, address(this)
        );
    }

    // _maticToWantRatio is a pre-calculated ratio to prevent
    // sandwich attacks
    function harvest(uint _maticToWantRatio) public {
        require(
            _msgSender() == owner() || _msgSender() == controller,
            "Owner or controller only"
        );

        uint _before = wantBalance();

        claimRewards();

        // only need swap when is different =)
        if (want != wmatic) {
            swapRewards(_maticToWantRatio);
        }

        uint harvested = wantBalance().sub(_before);

        chargeFees(harvested);

        if (!paused()) {
            // re-deposit
            deposit();
        }
    }

    function swapRewards(uint _maticToWantRatio) internal {
        uint balance = IERC20(wmatic).balanceOf(address(this));

        if (balance > 0) {
            // _maticToWantRatio is a 9 decimals ratio number calculated by the
            // caller before call harvest to get the minimum amount of want-tokens.
            // So the balance is multiplied by the ratio and then divided by 9 decimals
            // to get the same "precision". Then the result should be divided for the
            // decimal diff between tokens.
            // E.g want is USDT with  only 6 decimals:
            // _maticToWantRatio = 1_522_650_000 (1.52265 USDT/MATIC)
            // balance = 1e18 (1.0 MATIC)
            // tokenDiffPrecision = 1e12 (1e18 MATIC decimals / 1e6 USDT decimals)
            // expected = 1522650 (1e18 * 1_522_650_000 / 1e9 / 1e12) [1.52 in USDT decimals]

            uint tokenDiffPrecision = ERC20(wmatic).decimals().div(
                ERC20(want).decimals()
            );
            uint expected = balance.mul(_maticToWantRatio).div(1e9).div(tokenDiffPrecision);

            IUniswapRouter(exchange).swapExactTokensForTokens(
                balance, expected, wmaticToWantRoute, address(this), block.timestamp.add(60)
            );
        }
    }

    /**
     * @dev Takes out 3.5% performance fee.
     */
    function chargeFees(uint _harvested) internal {
        uint performanceFee = _harvested.mul(PERFORMANCE_FEE).div(FEE_MAX); // 3%

        if (performanceFee > 0) {
            // Pay to treasury 3.5% of the total reward claimed
            IERC20(want).safeTransfer(treasury, performanceFee);
        }
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
        return IDataProvider(dataProvider).getUserReserveData(want, address(this));
    }

    function supplyAndBorrow() public view returns (uint, uint) {
        (uint supplyBal,,uint borrowBal,,,,,,) = userReserves();
        return (supplyBal, borrowBal);
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
        return IAaveLendingPool(pool).getUserAccountData(address(this));
    }

    function currentHealthFactor() public view returns (uint) {
        (,,,,, uint healthFactor) = userAccountData();

        return healthFactor;
    }

    // called as part of strat migration. Sends all the available funds back to the vault.
    function retireStrat(uint _maticToWantRatio) external onlyController {
        _pause();
        _fullDeleverage();

        harvest(_maticToWantRatio);

        IERC20(want).transfer(vault(), wantBalance());

        _removeAllowances();
    }

    // pauses deposits and withdraws all funds from third party systems.
    function panic() public onlyOwner {
        _fullDeleverage();
        pause();
    }

    function pause() public onlyOwner {
        _pause();

        _removeAllowances();
    }

    function unpause() external onlyOwner {
        _unpause();

        _giveAllowances();

        deposit();
    }

    function _giveAllowances() internal {
        IERC20(want).safeApprove(pool, type(uint).max);
        IERC20(wmatic).safeApprove(exchange, type(uint).max);
    }

    function _removeAllowances() internal {
        IERC20(want).safeApprove(pool, 0);
        IERC20(wmatic).safeApprove(exchange, 0);
    }
}
