// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract StratMock is ERC20 {
    address public farm;

    constructor(address _farm) ERC20("2pi Fake", "2piFake") {
        farm = _farm;
    }

    function deposit(address _senderUser, uint _amount) public returns (uint) {
        _mint(_senderUser, _amount);

        return _amount;
    }

    function withdraw(address _senderUser, uint _shares) public {
        _burn(_senderUser, _shares);
    }
}
