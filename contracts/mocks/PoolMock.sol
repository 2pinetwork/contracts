// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IDataProvider {
    function setDebtTokenBalance(uint256 _debtTokenBalance) external;
}

contract PoolMock {
    address public constant dataProvider = address(0x43ca3D2C94be00692D207C6A1e60D8B325c6f12f);
    uint256 currentHealthFactor = 1.05e18;

    function reset() public {
        currentHealthFactor = 1.05e18;
    }

    function setCurrentHealthFactor(uint256 _currentHealthFactor) public {
        currentHealthFactor = _currentHealthFactor;
    }

    function deposit(address /*_asset*/, uint /*_amount*/, address /*_onBehalfOf*/, uint16 /*_referralCode*/) public pure {
    }

    function withdraw(address _asset, uint _amount, address to) public returns (uint) {
        uint256 balance = IERC20(_asset).balanceOf(address(this));
        uint256 toWithdraw = _amount;

        if (_amount > balance) {
            toWithdraw = balance;
        }

        IDataProvider(dataProvider).setDebtTokenBalance(0);

        if (toWithdraw > 0) {
            IERC20(_asset).transferFrom(address(this), to, toWithdraw);
        }

        return _amount;
    }

    function borrow(
        address /*_asset*/,
        uint /*_amount*/,
        uint /*_interestRateMode*/,
        uint16 /*_referralCode*/,
        address /*_onBehalfOf*/
    ) public pure {
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
