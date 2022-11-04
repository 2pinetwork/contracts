// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

interface ISwapper {
   function want() external view returns (address);
   function lp() external view returns (address);
   function strategy() external view returns (address);
   function swapWantForLpTokens(uint) external returns (uint, uint);
   function swapLpTokensForWant(uint, uint) external returns (uint);
   function lpInWant(uint) external view returns (uint);
   function lpToMinAmounts(uint) external view returns (uint, uint);
   function wantToLP(uint) external view returns (uint);
   function rebalanceStrategy() external;
}
