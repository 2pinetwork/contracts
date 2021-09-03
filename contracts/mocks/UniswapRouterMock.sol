// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "hardhat/console.sol";

contract UniswapRouterMock {
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint /*deadline*/
    ) external returns (uint[] memory amounts) {
        uint idx = path.length - 1;
        // console.log("Swapped: ", amountIn);
        IERC20(path[0]).transferFrom(msg.sender, address(this), amountIn);
        IERC20(path[idx]).transfer(to, amountOutMin);

        uint[] memory a = new uint[](1);
        a[0] = amountOutMin;

        return a;
    }
}
