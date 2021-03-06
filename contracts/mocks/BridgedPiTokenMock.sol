// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

import "../BridgedPiToken.sol";

contract BridgedPiTokenMock is BridgedPiToken {
    uint private mockedBlockNumber;

    constructor(IERC20 _token) BridgedPiToken(_token) {}

    function setBlockNumber(uint _n) public {
        mockedBlockNumber = _n;
    }

    function _blockNumber() internal view override returns (uint) {
        return mockedBlockNumber == 0 ? block.number : mockedBlockNumber;
    }
}
