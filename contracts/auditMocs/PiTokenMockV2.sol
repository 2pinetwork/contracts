pragma solidity 0.8.9;

import "../mocks/PiTokenMock.sol";
import "../mocks/TokenMock.sol";

contract PiTokenMockV2 is PiTokenMock, TokenMock{

    constructor (string memory _name, string memory _symbol) TokenMock(_name, _symbol) {}


    /*function MAX_SUPPLY() external view returns(uint) {
        return 0;
    }*/

    function getBlockNumber() external view returns(uint) {
        return _blockNumber();
    }

    function getTranchesBlock() external view returns(uint){
        return tranchesBlock;
    }

    function getApiMintedForCurrentTranch() external view returns(uint) {
        return apiMintedForCurrentTranch;
    }

    function getCommunityMintedForCurrentTranch() external view returns(uint) {
        return communityMintedForCurrentTranch;
    }
}