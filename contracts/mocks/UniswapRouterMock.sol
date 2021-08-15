// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

contract UniswapRouterMock {
    function swapExactTokensForTokens(
        uint /*amountIn*/,
        uint /*amountOutMin*/,
        address[] calldata /*path*/,
        address /*to*/,
        uint /*deadline*/
    ) external pure returns (uint[] memory amounts) {
        return new uint256[](0);
    }
}
