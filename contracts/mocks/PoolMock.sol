// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IDataProvider {
    function setATokenBalance(uint _ATokenBalance) external;
    function setDebtTokenBalance(uint _debtTokenBalance) external;
}

contract PoolMock {
    address public constant dataProvider = address(0x43ca3D2C94be00692D207C6A1e60D8B325c6f12f);
    uint currentHealthFactor = 1.05e18;

    function reset() public {
        currentHealthFactor = 1.05e18;
    }

    function setCurrentHealthFactor(uint _currentHealthFactor) public {
        currentHealthFactor = _currentHealthFactor;
    }

    function deposit(address _asset, uint _amount, address /*_onBehalfOf*/, uint16 /*_referralCode*/) public {

        IDataProvider(dataProvider).setATokenBalance(_amount);
        IDataProvider(dataProvider).setDebtTokenBalance(0);
        IERC20(_asset).transferFrom(msg.sender, address(this), _amount);
    }

    function withdraw(address _asset, uint _amount, address to) public returns (uint) {
        uint balance = IERC20(_asset).balanceOf(address(this));
        uint toWithdraw = _amount;

        if (_amount > balance) {
            toWithdraw = balance;
        }

        if (toWithdraw > 0) {
            IERC20(_asset).transferFrom(address(this), to, toWithdraw);
        }

        IDataProvider(dataProvider).setATokenBalance(
            IERC20(_asset).balanceOf(address(this))
        );
        IDataProvider(dataProvider).setDebtTokenBalance(0);

        return _amount;
    }

    function borrow(
        address _asset,
        uint _amount,
        uint /*_interestRateMode*/,
        uint16 /*_referralCode*/,
        address /*_onBehalfOf*/
    ) public {
        IERC20(_asset).transfer(msg.sender, _amount);
    }

    function repay(address /*asset*/, uint _amount, uint /*rateMode*/, address /*onBehalfOf*/) public pure returns (uint) {
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
        return (0, 0, 0, 0, 0, currentHealthFactor);
    }
}
