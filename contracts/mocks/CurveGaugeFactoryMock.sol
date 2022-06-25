// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../../interfaces/ICurve.sol";

interface ICurveMock is ICurveGauge {
    function claimed(address) external;
}

contract CurveGaugeFactoryMock {
    using SafeERC20 for IERC20;

    IERC20 CRV = IERC20(0x40bde52e6B80Ae11F34C58c14E1E7fE1f9c834C4);

    function mint(address _gauge) public {
        uint _Cbalance = CRV.balanceOf(address(this));
        uint _claimable = ICurveGauge(_gauge).claimable_tokens(msg.sender);

        if (_Cbalance > 0 && _claimable > 0) {
            CRV.safeTransfer(msg.sender, _claimable);
            ICurveMock(_gauge).claimed(msg.sender);
        }
    }

    function minted(address, address) public pure returns (uint256) {
        return 0;
    }
}
