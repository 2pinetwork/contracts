//SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import { Archimedes, IPiToken } from "../Archimedes.sol";

contract ArchimedesMock is Archimedes {
    uint private mockedBlockNumber;

    constructor(
        IPiToken _piToken,
        uint _startBlock
    ) Archimedes(_piToken, _startBlock) { }

    function setBlockNumber(uint _n) public {
        mockedBlockNumber = _n;
    }

    function blockNumber() internal view override returns (uint) {
        return mockedBlockNumber == 0 ? block.number : mockedBlockNumber;
    }
}
