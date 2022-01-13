// SPDX-License-Identifier: MIT

pragma solidity 0.8.11;

import "../PiToken.sol";

contract PiTokenMock is PiToken {
    uint private mockedBlockNumber;

    function setBlockNumber(uint _n) public {
        mockedBlockNumber = _n;
    }

    function _blockNumber() internal view override returns (uint) {
        return mockedBlockNumber == 0 ? block.number : mockedBlockNumber;
    }
}
