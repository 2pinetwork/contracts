// SPDX-License-Identifier: MIT

pragma solidity 0.8.13;

import { Archimedes, IPiToken, IWNative } from "../Archimedes.sol";

contract ArchimedesMock is Archimedes {
    uint private mockedBlockNumber;

    constructor(
        IPiToken _piToken,
        uint _startBlock,
        IWNative _wNative
    ) Archimedes(_piToken, _startBlock, _wNative) { }

    function setBlockNumber(uint _n) public {
        mockedBlockNumber = _n;
    }

    function _blockNumber() internal view override returns (uint) {
        return mockedBlockNumber == 0 ? block.number : mockedBlockNumber;
    }
}
