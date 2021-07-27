// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract StratMock is ERC20 {
    address public farm;
    IERC20 public want;

    constructor(address _farm, address _want) ERC20("2pi Fake", "2piFake") {
        farm = _farm;

        want = IERC20(_want);
    }

    function wantBalance() public view returns (uint) {
        return want.balanceOf(address(this));
    }

    function deposit(address _senderUser, uint _amount) public returns (uint) {
        uint _before = wantBalance();

        want.transferFrom(
            farm, // Archimedes
            address(this),
            _amount
        );

        uint _after = wantBalance();
        uint _diff = _after - _before;

        uint shares;
        if (totalSupply() <= 0) {
            shares = _diff;
        } else {
            shares = (_diff * totalSupply()) / _before;
        }

        _mint(_senderUser, shares);

        return shares;
    }

    function withdraw(address _senderUser, uint _shares) public {
        uint _withdraw = (wantBalance() * _shares) / totalSupply();

        _burn(_senderUser, _shares);

        want.transfer(farm, _withdraw);
    }
}
