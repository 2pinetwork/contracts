// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

contract DataProviderMock {
    uint256 aTokenBalance;
    uint256 debtTokenBalance;

    function reset() public {
        setATokenBalance(0);
        setDebtTokenBalance(0);
    }

    function setATokenBalance(uint256 _aTokenBalance) public {
        aTokenBalance = _aTokenBalance;
    }

    function setDebtTokenBalance(uint256 _debtTokenBalance) public {
        debtTokenBalance = _debtTokenBalance;
    }

    function getReserveTokensAddresses(address /*_asset*/) public pure returns (
        address aTokenAddress,
        address stableDebtTokenAddress,
        address variableDebtTokenAddress
    ) {
        return (address(0), address(0), address(0));
    }

    function getUserReserveData(address /*_asset*/, address /*_user*/) public view returns (
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
        return (aTokenBalance, 0, debtTokenBalance, 0, 0, 0, 0, 0, true);
    }
}
