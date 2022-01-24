pragma solidity 0.8.9;

import "../../interfaces/IDataProvider.sol";

contract DataProviderMockV2 is IDataProvider {
    constructor(){}

    address private _aTokenAddress;
    address private _stableDebtTokenAddress;
    address private _variableDebtTokenAddress;



    uint256 private _currentATokenBalance;
    uint256 private _currentStableDebt;
    uint256 private _currentVariableDebt;
    uint256 private _principalStableDebt;
    uint256 private _scaledVariableDebt;
    uint256 private _stableBorrowRate;
    uint256 private _liquidityRate;
    uint40 private _stableRateLastUpdated;
    bool private _usageAsCollateralEnabled;

    function setReserveTokensAddresses(address _a, address _s, address _v) external {
        _aTokenAddress = _a;
        _stableDebtTokenAddress = _s;
        _variableDebtTokenAddress = _v;
    }

    function getReserveTokensAddresses(address asset) external view returns (
        address aTokenAddress,
        address stableDebtTokenAddress,
        address variableDebtTokenAddress
    ) {
        return (_aTokenAddress, _stableDebtTokenAddress, _variableDebtTokenAddress);
    }


    function setUserReserveData(
        uint256 currentATokenBalance,
        uint256 currentStableDebt,
        uint256 currentVariableDebt,
        uint256 principalStableDebt,
        uint256 scaledVariableDebt,
        uint256 stableBorrowRate,
        uint256 liquidityRate,
        uint40 stableRateLastUpdated,
        bool usageAsCollateralEnabled )  external
        {
            _currentATokenBalance = currentATokenBalance;
            _currentStableDebt = currentStableDebt;
            _currentVariableDebt = currentVariableDebt;
            _principalStableDebt = principalStableDebt;
            _scaledVariableDebt = scaledVariableDebt;
            _stableBorrowRate = stableBorrowRate;
            _liquidityRate = liquidityRate;
            _stableRateLastUpdated = stableRateLastUpdated;
            _usageAsCollateralEnabled = usageAsCollateralEnabled;
        }

    function getUserReserveData(address asset, address user) external view returns (
        uint256 currentATokenBalance,
        uint256 currentStableDebt,
        uint256 currentVariableDebt,
        uint256 principalStableDebt,
        uint256 scaledVariableDebt,
        uint256 stableBorrowRate,
        uint256 liquidityRate,
        uint40 stableRateLastUpdated,
        bool usageAsCollateralEnabled
    )
    {
        return (_currentATokenBalance, _currentStableDebt, _currentVariableDebt, _principalStableDebt, _scaledVariableDebt, _stableBorrowRate, _liquidityRate, _stableRateLastUpdated, _usageAsCollateralEnabled);
    }
}