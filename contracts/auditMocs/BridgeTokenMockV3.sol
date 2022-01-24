//SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../BridgedPiToken.sol";

contract BridgePiTokenMockV3 is BridgedPiToken {
    constructor(IERC20 _token) BridgedPiToken(_token) {}

    function getBlockNumber() external view returns (uint) {
        return _blockNumber();
    }

}
