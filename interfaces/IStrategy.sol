// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

interface IStrategy {
    function want() external view returns (address);

    function deposit() external;

    function withdraw(uint256) external;

    function retireStrat(uint256) external;

    function balanceOf() external view returns (uint256);
}
