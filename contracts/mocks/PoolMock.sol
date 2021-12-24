// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "hardhat/console.sol";

interface IDataProvider {
    function setATokenBalance(address _user, uint _ATokenBalance) external;
    function setDebtTokenBalance(address _user, uint _debtTokenBalance) external;
    function getUserReserveData(address _asset, address _user) external view returns (
        uint currentATokenBalance,
        uint currentStableDebt,
        uint currentVariableDebt,
        uint principalStableDebt,
        uint scaledVariableDebt,
        uint stableBorrowRate,
        uint liquidityRate,
        uint40 stableRateLastUpdated,
        bool usageAsCollateralEnabled
    );
}

contract PoolMock {
    address public constant dataProvider = address(0x43ca3D2C94be00692D207C6A1e60D8B325c6f12f);

    uint public fakeHF;

    function reset() public {
        fakeHF = 0;
    }

    function setHealthFactor(uint _hf) public {
        fakeHF = _hf;
    }

    function supplyAndBorrow() public view returns (uint, uint) {
        (uint _aTokens, ,uint _debt,,,,,,) = IDataProvider(dataProvider).getUserReserveData(msg.sender, msg.sender);

        return (_aTokens, _debt);
    }

    function deposit(address _asset, uint _amount, address /*_onBehalfOf*/, uint16 /*_referralCode*/) public {
        (uint aTokens,) = supplyAndBorrow();

        IDataProvider(dataProvider).setATokenBalance(msg.sender, aTokens + _amount);

        IERC20(_asset).transferFrom(msg.sender, address(this), _amount);
    }

    function withdraw(address _asset, uint _amount, address to) public returns (uint) {
        (uint aTokens,) = supplyAndBorrow();
        if (_amount > aTokens) {
            _amount = aTokens;
        }

        if (_amount > 0) {
            IERC20(_asset).transferFrom(address(this), to, _amount);
        }

        IDataProvider(dataProvider).setATokenBalance(msg.sender, aTokens - _amount);

        return _amount;
    }

    function borrow(
        address _asset,
        uint _amount,
        uint /*_interestRateMode*/,
        uint16 /*_referralCode*/,
        address /*_onBehalfOf*/
    ) public {
        (, uint _debt) = supplyAndBorrow();

        IDataProvider(dataProvider).setDebtTokenBalance(msg.sender, _debt + _amount);

        IERC20(_asset).transfer(msg.sender, _amount);
    }

    function repay(address _asset, uint _amount, uint /*rateMode*/, address /*onBehalfOf*/) public returns (uint) {
        (, uint _debt) = supplyAndBorrow();

        if (_debt <= _amount) {
            _amount = _debt; // to transfer only needed
            _debt = 0;
        } else {
            _debt -= _amount;
        }

        IDataProvider(dataProvider).setDebtTokenBalance(msg.sender, _debt);

        IERC20(_asset).transferFrom(msg.sender, address(this), _amount);

        return _amount;
    }

    function getUserAccountData(address /*user*/) public view returns (
        uint totalCollateralETH,
        uint totalDebtETH,
        uint availableBorrowsETH,
        uint currentLiquidationThreshold,
        uint ltv,
        uint healthFactor
    ) {
        (uint _aTokens, uint _debt) = supplyAndBorrow();

        if (fakeHF > 0 ) {
            healthFactor = fakeHF;
        } else if (_debt > 0 && _aTokens > 0) {
            // aTokens * 80% / _debt == 2 digits factor
            healthFactor = ((_aTokens * 80) / (_debt)) * 1e16;
        } else {
            healthFactor = 200e18;
        }

        return (0, 0, 0, 0, 0, healthFactor);
    }
}
