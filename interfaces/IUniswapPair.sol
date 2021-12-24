// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

interface IUniswapPair {
    function approve(address, uint) external returns (bool);
    function balanceOf(address) external view returns (uint);
    function token0() external view returns (address);
    function token1() external view returns (address);
    function skim(address to) external;
}
