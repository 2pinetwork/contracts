// SPDX-License-Identifier: MIT

pragma solidity 0.8.11;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IWNative is IERC20 {
    function deposit() external payable;
    function withdraw(uint amount) external;
}
