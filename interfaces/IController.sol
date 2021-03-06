// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

interface IController {
    function strategy() external view returns (address);
    function totalSupply() external view returns (uint);
    function balance() external view returns (uint);
    function balanceOf(address _user) external view returns (uint);
    function decimals() external view returns (uint);
    function archimedes() external view returns (address);
    function deposit(address _depositor, uint _amount) external;
    function withdraw(address _depositor, uint _shares) external returns (uint);
    function setPid(uint pid) external returns (uint);
    function depositLimit() external view returns (uint);
    function userDepositLimit(address) external view returns (uint);
    function availableDeposit() external view returns (uint);
    function availableUserDeposit(address) external view returns (uint);
}
