// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import { ISuperToken } from "../vendor_contracts/NativeSuperTokenProxy.sol";

interface IPiToken is ISuperToken {
    function initRewardsOn(uint _startBlock) external;
    function mint(address _receiver, uint _supply, bytes calldata data) external;
    function addMinter(address newMinter) external;
    function addBurner(address newBurner) external;
    function INITIAL_SUPPLY() external view returns(uint);
    function MAX_SUPPLY() external view returns(uint);
    function cap() external view returns(uint);
    function communityMintPerBlock() external view returns(uint);
    function init() external;
}
