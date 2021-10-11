// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract UniswapRouterMock {
    // We always handle 1% of slippage so to get 1 expected token
    // 2 * 99 / 100 => 1
    uint private expected = 2;

    function reset() public {
        expected = 2;
    }

    function setExpected(uint _amount) public {
        expected = _amount;
    }

    function getAmountsOut(uint amountIn, address[] memory /*path*/) external view returns (uint[] memory amounts) {
        amounts = new uint[](2);
        amounts[0] = amountIn; // First always the same
        amounts[1] = expected;
    }


    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint /*deadline*/
    ) external returns (uint[] memory amounts) {
        uint idx = path.length - 1;

        IERC20(path[0]).transferFrom(msg.sender, address(this), amountIn);
        IERC20(path[idx]).transfer(to, amountOutMin);

        uint[] memory a = new uint[](1);
        a[0] = amountOutMin;

        return a;
    }
}
