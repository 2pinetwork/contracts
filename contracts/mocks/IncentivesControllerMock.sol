// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

contract IncentivesControllerMock {
    function claimRewards(
        address[] calldata /*_assets*/,
        uint256 /*_amount*/,
        address /*_to*/
    ) public pure returns (uint) {
        return 0;
    }
}
