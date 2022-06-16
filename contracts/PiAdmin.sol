// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

import "@openzeppelin/contracts/access/AccessControl.sol";
// import "hardhat/console.sol";

abstract contract PiAdmin is AccessControl {
    constructor() {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    modifier onlyAdmin() {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Not an admin");
        _;
    }

    // @dev Used to break loops if gasleft is less than 20k
    function _outOfGasForLoop() internal view returns (bool) {
        return gasleft() <= 20_000;
    }
}
