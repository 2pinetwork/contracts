// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

interface ISolidlyPair {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function stable() external view returns (bool);
    function balanceOf(address user) external view returns (uint);
    function getAmountOut(uint amountIn, address tokenIn) external view returns (uint);
}
