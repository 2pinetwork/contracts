// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

interface IAaveIncentivesController {
  function claimRewards(
    address[] calldata assets,
    uint amount,
    address to,
    address reward
  ) external returns (uint);
}

interface IAaveLendingPool {
    function supply(address asset, uint amount, address onBehalfOf, uint16 referralCode) external;
    function withdraw(address asset, uint amount, address to) external returns (uint);
    function borrow(address asset, uint amount, uint interestRateMode, uint16 referralCode, address onBehalfOf) external;
    function repay(address asset, uint amount, uint rateMode, address onBehalfOf) external returns (uint);

    function getUserAccountData(address user) external view returns (
        uint totalCollateralETH,
        uint totalDebtETH,
        uint availableBorrowsETH,
        uint currentLiquidationThreshold,
        uint ltv,
        uint healthFactor
    );

    function repayWithATokens(address, uint, uint) external;
}
