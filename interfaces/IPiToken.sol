// SPDX-License-Identifier: MIT

pragma solidity 0.8.13;

import "../vendor_contracts/NativeSuperTokenProxy.sol";

// Used in Archimedes
interface IPiToken is ISuperToken {
    function apiMint(address _receiver, uint _supply) external;
    function communityMint(address _receiver, uint _supply) external;
    function communityMintPerBlock() external view returns(uint);
    function apiMintPerBlock() external view returns(uint);
    function communityLeftToMint() external view returns(uint);
    function apiLeftToMint() external view returns(uint);
    function MAX_SUPPLY() external view returns(uint);
}

// Used for tests
interface IPiTokenMocked is IPiToken {
    function initRewardsOn(uint _startBlock) external;
    function init() external;
    function addMinter(address newMinter) external;
    function addBurner(address newBurner) external;
    function cap() external view returns(uint);
    function INITIAL_SUPPLY() external view returns(uint);
    function setBlockNumber(uint n) external;
    function setCommunityMintPerBlock(uint n) external;
    function setApiMintPerBlock(uint n) external;
    function mintForMultiChain(uint n, bytes calldata data) external;
}
