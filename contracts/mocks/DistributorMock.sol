//SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "../Distributor.sol";

contract DistributorMock is Distributor {
    uint private mockedBlockNumber;

    constructor(address _piToken, address _piVault, address _treasury) Distributor(_piToken, _piVault, _treasury) {}

    function setBlockNumber(uint _n) public {
        mockedBlockNumber = _n;
    }

    function blockNumber() internal view override returns (uint) {
        return mockedBlockNumber == 0 ? block.number : mockedBlockNumber;
    }
}
