// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import { ISuperToken } from "../vendor_contracts/NativeSuperTokenProxy.sol";

// Used in Archimedes
interface IPiToken is ISuperToken {
    function mint(address _receiver, uint _supply, bytes calldata data) external;
    function communityMintPerBlock() external view returns(uint);
}

// Used for tests
interface IPiTokenMocked is IPiToken {
    function initRewardsOn(uint _startBlock) external;
    function increaseCurrentTranche() external;
    function init() external;
    function addMinter(address newMinter) external;
    function addBurner(address newBurner) external;
    function cap() external view returns(uint);
    function INITIAL_SUPPLY() external view returns(uint);
    function MAX_SUPPLY() external view returns(uint);
    function totalMintPerBlock() external view returns(uint);
    function setBlockNumber(uint n) external;
}
