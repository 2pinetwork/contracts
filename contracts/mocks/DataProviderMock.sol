// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

contract DataProviderMock {
    // For testing use the counters/balance will be based
    // on the msg.sender that should be always a different
    // strategy (instead of the asset)
    mapping(address => uint) public aTokenBalance;
    mapping(address => uint) public debtTokenBalance;

    address[] public users;

    function reset() public {
        for (uint i = 0; i < users.length; i++) {
            setATokenBalance(users[i], 0);
            setDebtTokenBalance(users[i], 0);
        }
    }

    function setATokenBalance(address _user, uint _aTokenBalance) public {
        aTokenBalance[_user] = _aTokenBalance;
    }

    function setDebtTokenBalance(address _user, uint _debtTokenBalance) public {
        debtTokenBalance[_user] = _debtTokenBalance;
    }

    function getReserveTokensAddresses(address /*asset*/) public pure returns (
        address aTokenAddress,
        address stableDebtTokenAddress,
        address variableDebtTokenAddress
    ) {
        return (address(0), address(0), address(0));
    }

    function getUserReserveData(address /*asset*/, address _user) public view returns (
        uint currentATokenBalance,
        uint currentStableDebt,
        uint currentVariableDebt,
        uint principalStableDebt,
        uint scaledVariableDebt,
        uint stableBorrowRate,
        uint liquidityRate,
        uint40 stableRateLastUpdated,
        bool usageAsCollateralEnabled
    ) {
        return (aTokenBalance[_user], 0, debtTokenBalance[_user], 0, 0, 0, 0, 0, true);
    }
}
