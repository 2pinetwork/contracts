// SPDX-License-Identifier: MIT

pragma solidity 0.8.11;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
// import "hardhat/console.sol";

import "./Swappable.sol";
import "../interfaces/IAave.sol";
import "../interfaces/IDataProvider.sol";
import "../interfaces/IWNative.sol";

// Swappable contract has the AccessControl module
contract ControllerAaveStrat is Pausable, ReentrancyGuard, Swappable {
    using SafeERC20 for IERC20;

    address public constant wNative = address(0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f); // test

    address public immutable want;
    address public immutable aToken;
    address public immutable debtToken;

    // Aave contracts (test addr)
    address public constant DATA_PROVIDER = address(0x43ca3D2C94be00692D207C6A1e60D8B325c6f12f);
    address public constant INCENTIVES = address(0xC469e7aE4aD962c30c7111dc580B4adbc7E914DD);
    address public constant POOL = address(0xb09da8a5B236fE0295A345035287e80bb0008290);

    // Routes
    address[] public wNativeToWantRoute;

    address public treasury;

    // Profitability vars
    uint public borrowRate;
    uint public borrowRateMax;
    uint public borrowDepth;
    uint public minLeverage;
    uint constant public BORROW_DEPTH_MAX = 10;
    uint constant public INTEREST_RATE_MODE = 2; // variable
    uint constant public MIN_HEALTH_FACTOR = 1.05e18;  // Always at least 1.05 to not enter default like Arg

    // In the case of leverage we should withdraw when the
    // amount to withdraw is 50%
    uint public ratioForFullWithdraw = 5000; // 50%

    // The healthFactor value has the same representation than supply so
    // to do the math we should remove 12 places from healthFactor to get a HF
    // with only 6 "decimals" and add 6 "decimals" to supply to divide like we do IRL.
    uint public constant HF_DECIMAL_FACTOR = 1e6;
    uint public constant HF_WITHDRAW_TOLERANCE = 0.05e6;

    // Fees
    uint constant public MAX_PERFORMANCE_FEE = 500; // 5% max
    uint public performanceFee = 350; // 3.5%
    uint internal lastBalance;

    address public exchange;
    address public immutable controller;

    constructor(
        address _want,
        uint _borrowRate,
        uint _borrowRateMax,
        uint _borrowDepth,
        uint _minLeverage,
        address _controller,
        address _exchange,
        address _treasury
    ) {
        require(_want != address(0), "want !ZeroAddress");
        require(_controller != address(0), "Controller !ZeroAddress");
        require(_treasury != address(0), "Treasury !ZeroAddress");
        require(_borrowRate <= _borrowRateMax, "!Borrow <= MaxBorrow");
        require(_borrowRateMax <= RATIO_PRECISION, "!MaxBorrow <= 100%");

        want = _want;
        borrowRate = _borrowRate;
        borrowRateMax = _borrowRateMax;
        borrowDepth = _borrowDepth;
        minLeverage = _minLeverage;
        controller = _controller;
        exchange = _exchange;
        treasury = _treasury;

        (aToken,,debtToken) = IDataProvider(DATA_PROVIDER).getReserveTokensAddresses(_want);

        wNativeToWantRoute = [wNative, _want];

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    event NewTreasury(address oldTreasury, address newTreasury);
    event NewExchange(address oldExchange, address newExchange);
    event NewPerformanceFee(uint oldFee, uint newFee);
    event Harvested(address _want, uint _amount);
    event PerformanceFee(uint _amount);

    modifier onlyController() {
        require(msg.sender == controller, "Not from controller");
        _;
    }

    function identifier() external view returns (string memory) {
        return string(abi.encodePacked(
            IERC20Metadata(want).symbol(), "@AaveV2#1.0.0"
        ));
    }

    function setTreasury(address _treasury) external onlyAdmin nonReentrant {
        require(_treasury != treasury, "Same address");
        require(_treasury != address(0), "!ZeroAddress");
        emit NewTreasury(treasury, _treasury);

        treasury = _treasury;
    }

    function setExchange(address _exchange) external onlyAdmin nonReentrant {
        require(_exchange != exchange, "Same address");
        require(_exchange != address(0), "!ZeroAddress");
        emit NewExchange(exchange, _exchange);

        exchange = _exchange;
    }

    function setSwapRoute(address[] calldata _route) external onlyAdmin nonReentrant {
        require(_route[0] == wNative, "route[0] isn't wNative");
        require(_route[_route.length - 1] == want, "Last route isn't want");
        wNativeToWantRoute = _route;
    }

    function setRatioForFullWithdraw(uint _ratio) public onlyAdmin {
        require(_ratio != ratioForFullWithdraw, "Same ratio");
        require(_ratio <= RATIO_PRECISION, "Can't be more than 100%");
        ratioForFullWithdraw = _ratio;
    }

    function setPerformanceFee(uint _fee) external onlyAdmin nonReentrant {
        require(_fee != performanceFee, "Same fee");
        require(_fee <= MAX_PERFORMANCE_FEE, "Can't be greater than max");
        emit NewPerformanceFee(performanceFee, _fee);

        performanceFee = _fee;
    }

    // Charge want auto-generation with performanceFee
    // Basically we assign `lastBalance` each time that we charge or make a movement
    function beforeMovement() external onlyController nonReentrant {
        _beforeMovement();
    }

    function _beforeMovement() internal {
        uint currentBalance = balance();

        if (currentBalance > lastBalance) {
            uint perfFee = ((currentBalance - lastBalance) * performanceFee) / RATIO_PRECISION;

            if (perfFee > 0) {
                uint _balance = wantBalance();

                if (_balance < perfFee) {
                    uint _diff = perfFee - _balance;

                    // Call partial because this fee should never be a big amount
                    _partialDeleverage(_diff);
                }

                // Just in case
                _balance = wantBalance();
                if (_balance < perfFee) { perfFee = _balance; }

                if (perfFee > 0) {
                    IERC20(want).safeTransfer(treasury, perfFee);
                    emit PerformanceFee(perfFee);
                }
            }
        }
    }

    // Update new `lastBalance` for the next charge
    function _afterMovement() internal {
        lastBalance = balance();
    }

    function depositNative() external payable whenNotPaused onlyController nonReentrant {
        IWNative(wNative).deposit{value: msg.value}();

        _leverage();
        _afterMovement();
    }

    function deposit() external whenNotPaused onlyController nonReentrant {
        _leverage();
        _afterMovement();
    }

    function withdraw(uint _amount) external onlyController nonReentrant returns (uint) {
        uint _balance = wantBalance();

        if (_balance < _amount) {
            uint _diff = _amount - _balance;

            // If the amount is at least the half of the real deposit
            // we have to do a full deleverage, in other case the withdraw+repay
            // will looping for ever.
            if ((balanceOfPool() * ratioForFullWithdraw / RATIO_PRECISION) <= _diff) {
                _fullDeleverage();
            } else {
                _partialDeleverage(_diff);
            }

           _balance =  wantBalance();
           if (_balance < _amount) { _amount = _balance; }
        }

        IERC20(want).safeTransfer(controller, _amount);

        if (!paused() && wantBalance() > 0) { _leverage(); }

        _afterMovement();

        return _amount;
    }

    function _leverage() internal {
        uint _amount = wantBalance();

        IERC20(want).safeApprove(POOL, _amount);
        IAaveLendingPool(POOL).deposit(want, _amount, address(this), 0);

        if (_amount < minLeverage) { return; }

        // Borrow & deposit strategy
        for (uint i = 0; i < borrowDepth; i++) {
            _amount = (_amount * borrowRate) / RATIO_PRECISION;

            IAaveLendingPool(POOL).borrow(want, _amount, INTEREST_RATE_MODE, 0, address(this));
            IERC20(want).safeApprove(POOL, _amount);
            IAaveLendingPool(POOL).deposit(want, _amount, address(this), 0);

            if (_amount < minLeverage || _outOfGasForLoop()) { break; }
        }
    }

    function _fullDeleverage() internal {
        (uint supplyBal, uint borrowBal) = supplyAndBorrow();
        uint toWithdraw;
        uint toRepay;

        while (borrowBal > 0) {
            toWithdraw = _maxWithdrawFromSupply(supplyBal);

            IAaveLendingPool(POOL).withdraw(want, toWithdraw, address(this));

            // This is made mainly for the approve != 0
            toRepay = toWithdraw;
            if (toWithdraw > borrowBal) { toRepay = borrowBal; }

            IERC20(want).safeApprove(POOL, toRepay);
            // Repay only will use the needed
            IAaveLendingPool(POOL).repay(want, toRepay, INTEREST_RATE_MODE, address(this));

            (supplyBal, borrowBal) = supplyAndBorrow();
        }

        if (supplyBal > 0) {
            IAaveLendingPool(POOL).withdraw(want, type(uint).max, address(this));
        }
    }

    function _partialDeleverage(uint _needed) internal {
        // Instead of a require() to raise an exception, the fullDeleverage should
        // fix the health factor
        if (currentHealthFactor() <= MIN_HEALTH_FACTOR) {
            _fullDeleverage();

            return;
        }

        // This is because we check the wantBalance in each iteration
        // but for partialDeleverage we need to withdraw the entire
        // _needed amount
        uint toWithdraw = wantBalance() + _needed;

        while (toWithdraw > wantBalance()) { _withdrawAndRepay(toWithdraw); }
    }

    function _withdrawAndRepay(uint _needed) internal {
        (uint supplyBal, uint borrowBal) = supplyAndBorrow();
        // This amount with borrowDepth = 0 will return the entire deposit
        uint toWithdraw = _maxWithdrawFromSupply(supplyBal);

        if (toWithdraw > _needed) { toWithdraw = _needed; }

        IAaveLendingPool(POOL).withdraw(want, toWithdraw, address(this));

        // for depth > 0
        if (borrowBal > 0) {
            // Only repay the just amount
            uint toRepay = (toWithdraw * borrowRate) / RATIO_PRECISION;
            if (toRepay > borrowBal) { toRepay = borrowBal; }

            // In case the toWithdraw is really low it fails to repay 0
            if (toRepay > 0) {
                IERC20(want).safeApprove(POOL, toRepay);
                IAaveLendingPool(POOL).repay(want, toRepay, INTEREST_RATE_MODE, address(this));
            }
        }
    }

    // This function is useful to increase Aave HF (to prevent liquidation) and
    // in case of "stucked while loop for withdraws" the strategy can be paused, and then
    // use this function the N needed times to get all the resources out of the Aave pool
    function increaseHealthFactor(uint byRatio) external onlyAdmin nonReentrant {
        require(byRatio <= RATIO_PRECISION, "Can't be more than 100%");
        (uint supplyBal, uint borrowBal) = supplyAndBorrow();

        uint toWithdraw = (_maxWithdrawFromSupply(supplyBal) * byRatio) / RATIO_PRECISION;

        IAaveLendingPool(POOL).withdraw(want, toWithdraw, address(this));

        //  just in case
        if (borrowBal > 0) {
            uint toRepay = toWithdraw;
            if (toWithdraw > borrowBal) { toRepay = borrowBal; }

            IERC20(want).safeApprove(POOL, toRepay);
            IAaveLendingPool(POOL).repay(want, toRepay, INTEREST_RATE_MODE, address(this));
        }
    }

    function rebalance(uint _borrowRate, uint _borrowDepth) external onlyAdmin nonReentrant {
        require(_borrowRate <= borrowRateMax, "Exceeds max borrow rate");
        require(_borrowDepth <= BORROW_DEPTH_MAX, "Exceeds max borrow depth");

        _fullDeleverage();

        borrowRate = _borrowRate;
        borrowDepth = _borrowDepth;

        if (!paused() && wantBalance() > 0) { _leverage(); }
    }

    // Divide the supply with HF less 0.5 to finish at least with HF~=1.05
    function _maxWithdrawFromSupply(uint _supply) internal view returns (uint) {
        // The healthFactor value has the same representation than supply so
        // to do the math we should remove 12 places from healthFactor to get a HF
        // with only 6 "decimals" and add 6 "decimals" to supply to divide like we do IRL.
        uint hfDecimals = 1e18 / HF_DECIMAL_FACTOR;

        return _supply - (
            (_supply * HF_DECIMAL_FACTOR) / ((currentHealthFactor() / hfDecimals) - HF_WITHDRAW_TOLERANCE)
        );
    }

    function wantBalance() public view returns (uint) {
        return IERC20(want).balanceOf(address(this));
    }

    function balance() public view returns (uint) {
        return wantBalance() + balanceOfPool();
    }

    // it calculates how much 'want' the strategy has working in the controller.
    function balanceOfPool() public view returns (uint) {
        (uint supplyBal, uint borrowBal) = supplyAndBorrow();
        return supplyBal - borrowBal;
    }

    function _claimRewards() internal {
        // Incentive controller only receive aToken addresses
        address[] memory assets = new address[](2);
        assets[0] = aToken;
        assets[1] = debtToken;

        IAaveIncentivesController(INCENTIVES).claimRewards(
            assets, type(uint).max, address(this)
        );
    }

    function harvest() public nonReentrant {
        uint _balance = balance();
        _claimRewards();

        // only need swap when is different =)
        if (want != wNative) { _swapRewards(); }

        uint harvested = balance() - _balance;

        // Charge performance fee for earned want + rewards
        _beforeMovement();

        // re-deposit
        if (!paused() && wantBalance() > 0) { _leverage(); }

        // Update lastBalance for the next movement
        _afterMovement();

        emit Harvested(want, harvested);
    }

    function _swapRewards() internal {
        uint _balance = IERC20(wNative).balanceOf(address(this));

        if (_balance > 0) {
            // _expectedForSwap checks with oracles to obtain the minExpected amount
            uint expected = _expectedForSwap(_balance, wNative, want);

            IERC20(wNative).safeApprove(exchange, _balance);
            IUniswapRouter(exchange).swapExactTokensForTokens(
                _balance, expected, wNativeToWantRoute, address(this), block.timestamp + 60
            );
        }
    }

    /**
     * @dev Takes out performance fee.
     */
    function _chargeFees(uint _harvested) internal {
        uint fee = (_harvested * performanceFee) / RATIO_PRECISION;

        // Pay to treasury a percentage of the total reward claimed
        if (fee > 0) { IERC20(want).safeTransfer(treasury, fee); }
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
        return IDataProvider(DATA_PROVIDER).getUserReserveData(want, address(this));
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
        return IAaveLendingPool(POOL).getUserAccountData(address(this));
    }

    function currentHealthFactor() public view returns (uint) {
        (,,,,, uint healthFactor) = userAccountData();

        return healthFactor;
    }

    // called as part of strat migration. Sends all the available funds back to the vault.
    function retireStrat() external onlyController {
        if (!paused()) { _pause(); }

        if (balanceOfPool() > 0) { _fullDeleverage(); }

        // Can be called without rewards
        harvest();

        require(balanceOfPool() <= 0, "Strategy still has deposits");
        IERC20(want).safeTransfer(controller, wantBalance());
    }

    // pauses deposits and withdraws all funds from third party systems.
    function panic() external onlyAdmin nonReentrant {
        _fullDeleverage();
        pause();
    }

    function pause() public onlyAdmin {
        _pause();
    }

    function unpause() external onlyAdmin nonReentrant {
        _unpause();

        if (wantBalance() > 0) { _leverage(); }
    }
}
