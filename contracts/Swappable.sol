// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "hardhat/console.sol";

import "../interfaces/IChainLink.sol";
import "../interfaces/IUniswapRouter.sol";

abstract contract Swappable is AccessControl {
    uint constant public SWAP_PRECISION = 1e18;
    uint constant public RATIO_PRECISION = 10000; // 100%
    uint public swapSlippageRatio = 100; // 1%

    mapping(address => IChainLink) public oracles;

    constructor() {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    modifier onlyAdmin() {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Not an admin");
        _;
    }

    function setSwapSlippageRatio(uint _ratio) public onlyAdmin {
        require(_ratio <= RATIO_PRECISION, "can't be more than 100%");
        swapSlippageRatio = _ratio;
    }

    function setPriceFeed(address _token, IChainLink _feed) external onlyAdmin {
        require(_token != address(0), "!ZeroAddress");
        (uint80 round, int256 price,,,) = _feed.latestRoundData();
        require(round > 0 && price > 0, "Invalid feed");

        oracles[_token] = _feed;
    }

    function _expectedForSwap(uint _amount, address _fromToken, address _toToken) internal view returns (uint) {
        // ratio is a 18 decimals ratio number calculated to get the minimum
        // amount of want-tokens. So the balance is multiplied by the ratio
        // and then divided by 9 decimals to get the same "precision".
        // Then the result should be divided for the decimal diff between tokens.
        // Oracle Price Feed has always 8 decimals.
        // E.g want is USDT with only 6 decimals:
        // tokenDiffPrecision = 1e21 ((1e18 MATIC decimals / 1e6 USDT decimals) * 1e9 ratio precision)
        // ratio = 1_507_423_500 ((152265000 * 1e9) / 100000000) * 99 / 100 [with 1.52 USDT/MATIC]
        // _balance = 1e18 (1.0 MATIC)
        // expected = 1507423 (1e18 * 1_507_423_500 / 1e21) [1.507 in USDT decimals]
        uint tokenDiffPrecision = (
            (10 ** IERC20Metadata(_fromToken).decimals()) / (10 ** IERC20Metadata(_toToken).decimals())
        ) * SWAP_PRECISION;
        uint ratio = (
            (getPriceFor(_fromToken) * SWAP_PRECISION) / getPriceFor(_toToken)
        ) * (RATIO_PRECISION - swapSlippageRatio) / RATIO_PRECISION;

        return (_amount * ratio / tokenDiffPrecision);
    }

    function getPriceFor(address _token) internal view returns (uint) {
        // This could be implemented with FeedRegistry but it's not available in polygon
        (, int256 price,,,) = oracles[_token].latestRoundData();

        return uint(price);
    }
}
