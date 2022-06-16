// SPDX-License-Identifier: MIT

pragma solidity 0.8.13;

import "./ControllerStratAbs.sol";

contract ControllerDummyStrat is ControllerStratAbs {
    using SafeERC20 for IERC20;
    using SafeERC20 for IERC20Metadata;

    constructor(
        IERC20Metadata _want,
        address _controller,
        address _exchange,
        address _treasury
    ) ControllerStratAbs(_want, _controller, _exchange, _treasury) {}

    function identifier() external view returns (string memory) {
        return string(abi.encodePacked(want.symbol(), "@2pi-dummy#1.0.0"));
    }

    function harvest() public nonReentrant override {
        emit Harvested(address(want), 0);
    }

    function _deposit() internal override {
    }

    // amount is the `want` expected to be withdrawn
    function _withdraw(uint) internal pure override returns (uint) {
        return 0;
    }

    function _withdrawAll() internal pure override returns (uint) {
        return 0;
    }

    function balanceOfPool() public pure override returns (uint) {
        return 0;
    }

    function balanceOfPoolInWant() public pure override returns (uint) {
        return 0;
    }
}
