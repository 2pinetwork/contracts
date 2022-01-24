//SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../BridgedPiToken.sol";

contract BridgePiTokenMockV2 is BridgedPiToken {
    uint private mockedBlockNumber;

    constructor(IERC20 _token) BridgedPiToken(_token) {}

    function setBlockNumber(uint _n) public {
        mockedBlockNumber = _n;
    }

    function _blockNumber() internal view override returns (uint) {
        return mockedBlockNumber == 0 ? block.number : mockedBlockNumber;
    }

    function mockSetTranschesBlock(uint _n) external {
        tranchesBlock = _n;
    }

    function mockSetApiReserveFromOldTranchse(uint _n) external {
        apiReserveFromOldTranches = _n;
    }
    function mockSetCommunityReserveFromOldTranchse(uint _n) external {
        communityReserveFromOldTranches = _n;
    }

    function mockCallBeforeChangeMinRate() external {
        _beforeChangeMintRate();
    }

    function mockSetApiMintPerBlock(uint _n) external {
        apiMintPerBlock = _n;
    }

    function mockSetCommunityMintPerBlock(uint _n) external {
        communityMintPerBlock = _n;
    }

    function mockCallUpdateCurrentTranch() external {
        _updateCurrentTranch();
    }

    function mockCallLeftToMintForCurrentBlock(uint _type) external view returns (uint){
        return _leftToMintForCurrentBlock(_type);
    }

    function mockCallLeftToMint(uint _type) external view returns (uint){
        return _leftToMint(_type);
    }

    function getTranschesBlock() external view returns(uint) {
        return tranchesBlock;
    } 

    function getApiReserveFromOldTranches() external view returns(uint){
        return apiReserveFromOldTranches;
    }

    function getCommunityReserveFromOldTranches() external view returns(uint) {
        return communityReserveFromOldTranches;
    }
}
