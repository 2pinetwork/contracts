pragma solidity 0.8.9;

import "../ArchimedesAPI.sol";


contract ArchimedesAPIMockV3 is ArchimedesAPI {
    constructor(IPiToken _piToken, uint _startBlock, address _handler) ArchimedesAPI(_piToken, _startBlock, _handler) {}


    function getBlockNumber() external view returns(uint) {
        return _blockNumber();
    }

}