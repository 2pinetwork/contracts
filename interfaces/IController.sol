// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

interface IController {
    function strategy() external view returns (address);
    function totalSupply() external view returns (uint);
    function balance() external view returns (uint);
    function balanceOf(address _user) external view returns (uint);
    function decimals() external view returns (uint);
    function farm() external view returns (address);
    function deposit(address _depositor, uint _amount) external;
    function withdraw(address _depositor, uint _shares) external returns (uint);
}
