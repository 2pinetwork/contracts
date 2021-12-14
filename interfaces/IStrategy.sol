// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

interface IStrategy {
    function balance() external view returns (uint);
    function balanceOf() external view returns (uint);
    function beforeMovement() external;
    function deposit() external;
    function paused() external view returns (bool);
    function retireStrat() external;
    function want() external view returns (address);
    function withdraw(uint) external returns (uint);
}
