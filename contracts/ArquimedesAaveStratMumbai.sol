// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

import "../interfaces/IAave.sol";
import "../interfaces/IDataProvider.sol";
import "../interfaces/IUniswapRouter.sol";

interface Farm {
    function piToken() external view returns (address);
}

contract ArquimedesAaveStratMumbai is ERC20, AccessControl, Pausable {
    using SafeERC20 for IERC20;

    bytes32 public constant HARVEST_ROLE = keccak256("HARVEST_ROLE");

    // Address of Arquimedes
    address public constant farm = address(0xcDe4a51587856dAFC7Cb289a98796CEb3985dF2a);

    address public constant wmatic = address(0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889);

    address public want;
    address public aToken;
    address public debtToken;

    // Aave contracts
    address public constant dataProvider = address(0xFA3bD19110d986c5e5E9DD5F69362d05035D045B);
    address public constant incentivesController = address(0xd41aE58e803Edf4304334acCE4DC4Ec34a63C644);
    address public constant pool = address(0x9198F13B08E299d85E096929fA9781A1E3d5d827);

    // Routes
    address[] public wmaticToWantRoute;

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
        address _exchange,
        address _treasury
    ) ERC20(
        string(abi.encodePacked("2pi ", ERC20(_want).name())),
        string(abi.encodePacked("2pi", ERC20(_want).symbol()))
    ) {
        require(_want != address(0), "want");
        require(_treasury != address(0), "treasury");

        want = _want;
        borrowRate = _borrowRate;
        borrowRateMax = _borrowRateMax;
        borrowDepth = _borrowDepth;
        minLeverage = _minLeverage;
        exchange = _exchange;
        treasury = _treasury;

        wmaticToWantRoute = [wmatic, want];

        (aToken,,debtToken) = IDataProvider(dataProvider).getReserveTokensAddresses(want);

        _giveAllowances();
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(HARVEST_ROLE, address(this));
    }

    modifier onlyFarm() {
        require(msg.sender == farm, "!farm");
        _;
    }

    modifier onlyAdmin() {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "!admin");
        _;
    }

    function setTreasury(address _treasury) external onlyAdmin {
        treasury = _treasury;
    }

    function setExchange(address _exchange) external onlyAdmin {
        // Revoke current exchange
        IERC20(wmatic).safeApprove(exchange, 0);

        exchange = _exchange;
        IERC20(wmatic).safeApprove(exchange, type(uint).max);
    }

    // `withdrawFee` can't be more than 1%
    function setWithdrawFee(uint _fee) external onlyAdmin {
        require(_fee <= MAX_WITHDRAW_FEE, "!cap");

        withdrawFee = _fee;
    }

    function setSwapRoute(address[] calldata _route) external onlyAdmin {
        wmaticToWantRoute = _route;
    }

    function addHarvester(address newHarvester) external onlyAdmin {
        _setupRole(HARVEST_ROLE, newHarvester);
    }

    function wantBalance() public view returns (uint) {
        return IERC20(want).balanceOf(address(this));
    }

    function deposit(address _senderUser, uint _amount) public whenNotPaused onlyFarm returns (uint) {
        uint _before = balanceOf();

        IERC20(want).safeTransferFrom(
            farm, // Arquimedes
            address(this),
            _amount
        );

        _leverage();

        uint _after = balanceOf();
        uint _diff = _after - _before;

        uint shares;
        if (totalSupply() <= 0) {
            shares = _diff;
        } else {
            shares = (_diff * totalSupply()) / _before;
        }

        _mint(_senderUser, shares);

        return shares;
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

    function increaseHealthFactor() external onlyAdmin {
        (uint supplyBal,) = supplyAndBorrow();

        // Only withdraw the 10% of the max withdraw
        uint toWithdraw = (maxWithdrawFromSupply(supplyBal) * 100) / 10;

        IAaveLendingPool(pool).withdraw(want, toWithdraw, address(this));
        IAaveLendingPool(pool).repay(want, toWithdraw, INTEREST_RATE_MODE, address(this));
    }

    function rebalance(uint _borrowRate, uint _borrowDepth) external onlyAdmin {
        require(_borrowRate <= borrowRateMax, "!rate");
        require(_borrowDepth <= BORROW_DEPTH_MAX, "!depth");

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
            // This amount with borrowDepth = 0 will return the entire deposit
            toWithdraw = maxWithdrawFromSupply(supplyBal);

            if (toWithdraw > _needed && borrowBal <= 0) {
                toWithdraw = _needed;
            }

            IAaveLendingPool(pool).withdraw(want, toWithdraw, address(this));

            // for depth > 0
            if (borrowBal > 0) {
                // Only repay the just amount
                toRepay = (toWithdraw * borrowRate) / 100;
                IAaveLendingPool(pool).repay(want, toRepay, INTEREST_RATE_MODE, address(this));
            }
        }
    }

    // Withdraw partial funds, normally used with a vault withdrawal
    function withdraw(address _senderUser, uint _shares) external onlyFarm {
        uint _withdraw = (balanceOf() * _shares) / totalSupply();

        _burn(_senderUser, _shares);

        uint _balance = wantBalance();

        if (_balance < _withdraw) {
            uint _diff = _withdraw - _balance;

            // If the amount is at least the half of the real deposit
            // we have to do a full deleverage, in other case the withdraw+repay
            // will looping for ever.
            if ((_diff * 2) >= balanceOfPool()) {
                _fullDeleverage();
            } else {
                _partialDeleverage(_diff);
            }
        }

        uint withdrawalFee = (_withdraw * withdrawFee) / FEE_MAX;

        IERC20(want).safeTransfer(treasury, withdrawalFee);
        IERC20(want).safeTransfer(farm, _withdraw - withdrawalFee);

        if (!paused()) {
            _leverage();
        }
    }

    function balanceOf() public view returns (uint) {
        return wantBalance() + balanceOfPool();
    }

    // it calculates how much 'want' the strategy has working in the farm.
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
    function harvest(uint _maticToWantRatio) public {
        require(hasRole(HARVEST_ROLE, msg.sender), "Only admin can initialize");
        uint _before = wantBalance();

        claimRewards();

        // only need swap when is different =)
        if (want != wmatic) {
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
            // tokenDiffPrecision = 1e21 ((1e18 MATIC decimals / 1e6 USDT decimals) * 1e9 ratio precision)
            // expected = 1522650 (1e18 * 1_522_650_000 / 1e21) [1.52 in USDT decimals]

            uint tokenDiffPrecision = ((10 ** ERC20(wmatic).decimals()) / (10 ** ERC20(want).decimals())) * 1e9;
            uint expected = (balance * _maticToWantRatio) / tokenDiffPrecision;

            IUniswapRouter(exchange).swapExactTokensForTokens(
                balance, expected, wmaticToWantRoute, address(this), block.timestamp + 60
            );
        }
    }

    /**
     * @dev Takes out 3.5% performance fee.
     */
    function chargeFees(uint _harvested) internal {
        uint performanceFee = (_harvested * PERFORMANCE_FEE) / FEE_MAX;

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
    // function retireStrat(uint _maticToWantRatio) external onlyController {
    //     _pause();
    //     _fullDeleverage();

    //     harvest(_maticToWantRatio);

    //     IERC20(want).transfer(vault(), wantBalance());

    //     _removeAllowances();
    // }

    // pauses deposits and withdraws all funds from third party systems.
    function panic() public onlyAdmin {
        _fullDeleverage();
        pause();
    }

    function pause() public onlyAdmin {
        _pause();

        _removeAllowances();
    }

    function unpause() external onlyAdmin {
        _unpause();

        _giveAllowances();

        _leverage();
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
