// SPDX-License-Identifier: MIT

pragma solidity 0.8.11;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TokenMock is ERC20 {
    uint8 private _decimals = 18;

    constructor (string memory _name, string memory _symbol) ERC20(_name, _symbol) {
        _mint(msg.sender, 100 * 10 ** uint(decimals()));
    }

    function setDecimals(uint8 newDecimals) external {
        _decimals = newDecimals;
    }

    function decimals() override public view returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint amount) public {
        _mint(to, amount);
    }

    function burn(uint amount) public {
        _burn(msg.sender, amount);
    }
}
