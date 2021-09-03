// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/access/Ownable.sol";

contract Handler is Ownable {
    address[] internal users;

    function harvest(uint _pid, address _user) public {
        // apimedes.harvest(_pid, user);
    }

    function harvestPid(uint _pid) public {
        // This will call updatePool just the first time
        for (uint i; i < users.length; i++) {
            // apimedes.harvest(_pid, users[i]);
        }
    }
}
