//SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import { ArchimedesAPI, IPiToken } from "../ArchimedesAPI.sol";

contract ArchimedesAPIMock is ArchimedesAPI {
    uint private mockedBlockNumber;

    constructor(
        IPiToken _piToken,
        uint _startBlock,
        address _handler
    ) ArchimedesAPI(_piToken, _startBlock, _handler) { }

    function setBlockNumber(uint _n) public {
        mockedBlockNumber = _n;
    }

    function blockNumber() internal view override returns (uint) {
        return mockedBlockNumber == 0 ? block.number : mockedBlockNumber;
    }
}
