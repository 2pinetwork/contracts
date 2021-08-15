//SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import "../MintAndSend.sol";

contract MintAndSendMock is MintAndSend {
    uint private mockedBlockNumber;

    constructor(address _piToken, address _piVault, address _treasury, uint _startBlock) MintAndSend(_piToken, _piVault, _treasury, _startBlock) {}

    function setBlockNumber(uint _n) public {
        mockedBlockNumber = _n;
    }

    function blockNumber() internal view override returns (uint) {
        return mockedBlockNumber == 0 ? block.number : mockedBlockNumber;
    }
}
