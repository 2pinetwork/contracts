// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "hardhat/console.sol";

import "../interfaces/IAave.sol";
import "../interfaces/IDataProvider.sol";
import "../interfaces/IUniswapRouter.sol";

contract ControllerAaveStrat is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant HARVEST_ROLE = keccak256("HARVEST_ROLE");

    address public constant wNative = address(0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f); // test
    // address public constant wNative = address(0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889); // Mumbai
    // address public constant wNative = address(0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270); // MATIC

    address public immutable want;
    address public immutable aToken;
    address public immutable debtToken;

    // Test Aave contracts
    address public constant dataProvider = address(0x43ca3D2C94be00692D207C6A1e60D8B325c6f12f);
    address public constant incentivesController = address(0xC469e7aE4aD962c30c7111dc580B4adbc7E914DD);
    address public constant pool = address(0xb09da8a5B236fE0295A345035287e80bb0008290);
    // Mumbai Aave contracts
    // address public constant dataProvider = address(0xFA3bD19110d986c5e5E9DD5F69362d05035D045B);
    // address public constant incentivesController = address(0xd41aE58e803Edf4304334acCE4DC4Ec34a63C644);
    // address public constant pool = address(0x9198F13B08E299d85E096929fA9781A1E3d5d827);
    // Matic Aave contracts
    // address public constant dataProvider = address(0x7551b5D2763519d4e37e8B81929D336De671d46d);
    // address public constant incentivesController = address(0x357D51124f59836DeD84c8a1730D72B749d8BC23);
    // address public constant pool = address(0x8dFf5E27EA6b7AC08EbFdf9eB090F32ee9a30fcf);

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


    // Fees
    uint constant public FEE_MAX = 10000;
    uint public performanceFee = 350; // 3.5%

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
        require(_controller != address(0), "Controller can't be 0 address");
        require(_treasury != address(0), "Treasury can't be 0 address");

        want = _want;
        borrowRate = _borrowRate;
        borrowRateMax = _borrowRateMax;
        borrowDepth = _borrowDepth;
        minLeverage = _minLeverage;
        controller = _controller;
        exchange = _exchange;
        treasury = _treasury;

        (aToken,,debtToken) = IDataProvider(dataProvider).getReserveTokensAddresses(_want);

        wNativeToWantRoute = [wNative, _want];

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(HARVEST_ROLE, msg.sender);
        _setupRole(HARVEST_ROLE, _controller); // to retire strat
        _giveAllowances(_want);
    }

    event NewTreasury(address old_treasury, address new_treasury);
    event NewExchange(address old_exchange, address new_exchange);
    event NewPerformanceFee(uint old_fee, uint new_fee);

    modifier onlyController() {
        require(msg.sender == controller, "Not from controller");
        _;
    }

    modifier onlyAdmin() {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Not an admin");
        _;
    }

    function setTreasury(address _treasury) external onlyAdmin nonReentrant {
        emit NewTreasury(treasury, _treasury);

        treasury = _treasury;
    }

    function setExchange(address _exchange) external onlyAdmin nonReentrant {
        emit NewExchange(exchange, _exchange);

        // Revoke current exchange
        IERC20(wNative).safeApprove(exchange, 0);

        exchange = _exchange;
        IERC20(wNative).safeApprove(exchange, type(uint).max);
    }

    function setSwapRoute(address[] calldata _route) external onlyAdmin nonReentrant {
        wNativeToWantRoute = _route;
    }

    function setPerformanceFee(uint _fee) external onlyAdmin nonReentrant {
        emit NewPerformanceFee(performanceFee, _fee);

        performanceFee = _fee;
    }

    function addHarvester(address newHarvester) external onlyAdmin nonReentrant {
        _setupRole(HARVEST_ROLE, newHarvester);
    }

    function deposit() external whenNotPaused onlyController nonReentrant {
        _leverage();
    }

    function withdraw(uint _amount) external onlyController nonReentrant {
        uint _balance = wantBalance();

        if (_balance < _amount) {
            uint _diff = _amount - _balance;

            // If the amount is at least the half of the real deposit
            // we have to do a full deleverage, in other case the withdraw+repay
            // will looping for ever.
            if ((_diff * 2) >= balanceOfPool()) {
                _fullDeleverage();
            } else {
                _partialDeleverage(_diff);
            }
        }

        IERC20(want).safeTransfer(controller, _amount);

        if (!paused()) {
            _leverage();
        }
    }

    function _leverage() internal {
        uint _amount = wantBalance();

        IAaveLendingPool(pool).deposit(want, _amount, address(this), 0);

        if (_amount < minLeverage) {
            return;
        }

        // Borrow & deposit strategy
        for (uint i = 0; i < borrowDepth; i++) {
            _amount = (_amount * borrowRate) / 100;

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

        while (toWithdraw > wantBalance()) {
            withdrawAndRepay(toWithdraw);
        }
    }

    function withdrawAndRepay(uint _needed) internal {
        (uint supplyBal, uint borrowBal) = supplyAndBorrow();
        // This amount with borrowDepth = 0 will return the entire deposit
        uint toWithdraw = maxWithdrawFromSupply(supplyBal);

        if (toWithdraw > _needed) {
            toWithdraw = _needed;
        }

        IAaveLendingPool(pool).withdraw(want, toWithdraw, address(this));

        // for depth > 0
        if (borrowBal > 0) {
            // Only repay the just amount

            uint toRepay = (toWithdraw * borrowRate) / 100;
            IAaveLendingPool(pool).repay(want, toRepay, INTEREST_RATE_MODE, address(this));
        }
    }

    function increaseHealthFactor() external onlyAdmin nonReentrant {
        (uint supplyBal,) = supplyAndBorrow();

        // Only withdraw the 10% of the max withdraw
        uint toWithdraw = (maxWithdrawFromSupply(supplyBal) * 100) / 10;

        IAaveLendingPool(pool).withdraw(want, toWithdraw, address(this));
        IAaveLendingPool(pool).repay(want, toWithdraw, INTEREST_RATE_MODE, address(this));
    }

    function rebalance(uint _borrowRate, uint _borrowDepth) external onlyAdmin nonReentrant {
        require(_borrowRate <= borrowRateMax, "Exceeds max borrow rate");
        require(_borrowDepth <= BORROW_DEPTH_MAX, "Exceeds max borrow depth");

        _fullDeleverage();

        borrowRate = _borrowRate;
        borrowDepth = _borrowDepth;

        _leverage();
    }

    // Divide the supply with HF less 0.5 to finish at least with HF~=1.05
    function maxWithdrawFromSupply(uint _supply) internal view returns (uint) {
        // The healthFactor value has the same representation than supply so
        // to do the math we should remove 12 places from healthFactor to get a HF
        // with only 6 "decimals" and add 6 "decimals" to supply to divide like we do IRL.
        return _supply - (
            (_supply * 1e6) / ((currentHealthFactor() / 1e12) - 0.05e6)
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
    function harvest(uint _maticToWantRatio) public nonReentrant {
        require(hasRole(HARVEST_ROLE, msg.sender), "Only harvest role");
        uint _before = wantBalance();

        claimRewards();

        // only need swap when is different =)
        if (want != wNative) {
            swapRewards(_maticToWantRatio);
        }

        uint harvested = wantBalance() - _before;

        chargeFees(harvested);

        if (!paused()) {
            // re-deposit
            _leverage();
        }
    }

    function swapRewards(uint _maticToWantRatio) internal {
        uint _balance = IERC20(wNative).balanceOf(address(this));

        if (_balance > 0) {
            // _maticToWantRatio is a 9 decimals ratio number calculated by the
            // caller before call harvest to get the minimum amount of want-tokens.
            // So the balance is multiplied by the ratio and then divided by 9 decimals
            // to get the same "precision". Then the result should be divided for the
            // decimal diff between tokens.
            // E.g want is USDT with  only 6 decimals:
            // _maticToWantRatio = 1_522_650_000 (1.52265 USDT/MATIC)
            // _balance = 1e18 (1.0 MATIC)
            // tokenDiffPrecision = 1e21 ((1e18 MATIC decimals / 1e6 USDT decimals) * 1e9 ratio precision)
            // expected = 1522650 (1e18 * 1_522_650_000 / 1e21) [1.52 in USDT decimals]

            uint tokenDiffPrecision = ((10 ** ERC20(wNative).decimals()) / (10 ** ERC20(want).decimals())) * 1e9;
            uint expected = (_balance * _maticToWantRatio) / tokenDiffPrecision;

            IUniswapRouter(exchange).swapExactTokensForTokens(
                _balance, expected, wNativeToWantRoute, address(this), block.timestamp + 60
            );
        }
    }

    /**
     * @dev Takes out performance fee.
     */
    function chargeFees(uint _harvested) internal {
        uint fee = (_harvested * performanceFee) / FEE_MAX;

        if (fee > 0) {
            // Pay to treasury a percentage of the total reward claimed
            IERC20(want).safeTransfer(treasury, fee);
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
    function retireStrat() external onlyController {
        _pause();
        _fullDeleverage();

        harvest(0);

        IERC20(want).safeTransfer(controller, wantBalance());

        _removeAllowances();
    }

    // pauses deposits and withdraws all funds from third party systems.
    function panic() external onlyAdmin nonReentrant {
        _fullDeleverage();
        pause();
    }

    function pause() public onlyAdmin {
        _pause();

        _removeAllowances();
    }

    function unpause() external onlyAdmin nonReentrant {
        _unpause();

        _giveAllowances(want);

        _leverage();
    }

    function _giveAllowances(address _want) internal {
        IERC20(_want).safeApprove(pool, type(uint).max);
        IERC20(wNative).safeApprove(exchange, type(uint).max);
    }

    function _removeAllowances() internal {
        IERC20(want).safeApprove(pool, 0);
        IERC20(wNative).safeApprove(exchange, 0);
    }
}
