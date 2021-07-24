// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./CommonContract.sol";

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "../interfaces/IController.sol";

contract Vault is ERC20, CommonContract {
    using SafeERC20 for IERC20;
    using Address for address;

    IERC20 public token;

    address public controller;

    constructor(address _token) ERC20(
        string(abi.encodePacked("2pi ", ERC20(_token).name())),
        string(abi.encodePacked("2pi", ERC20(_token).symbol()))
    ) {
        token = IERC20(_token);
    }

    function balance() public view returns (uint) {
        return token.balanceOf(address(this)) + IController(controller).balanceOf(address(token));
    }

    function setController(address _controller) external onlyOwner {
        controller = _controller;
    }

    function available() public view returns (uint) {
        return token.balanceOf(address(this));
    }

    function earn() public {
        uint _bal = available();
        token.safeTransfer(controller, _bal);
        IController(controller).earn(address(token), _bal);
    }

    function depositAll() external {
        deposit(token.balanceOf(msg.sender));
    }

    function deposit(uint _amount) public {
        uint _pool = balance();
        token.safeTransferFrom(msg.sender, address(this), _amount);

        earn();

        uint _after = balance();
        _amount = _after - _pool; // Additional check for deflationary tokens

        uint shares = 0;
        if (totalSupply() == 0) {
            shares = _amount;
        } else {
            shares = _amount * totalSupply() / _pool;
        }
        _mint(msg.sender, shares);
    }

    function withdrawAll() external {
        withdraw(balanceOf(msg.sender));
    }

    function withdraw(uint _shares) public {
        uint r = balance() * _shares / totalSupply();
        _burn(msg.sender, _shares);

        // Check balance
        uint b = token.balanceOf(address(this));
        if (b < r) {
            uint _withdraw = r - b;
            IController(controller).withdraw(address(token), _withdraw);
            uint _after = token.balanceOf(address(this));
            uint _diff = _after - b;
            if (_diff < _withdraw) {
                r = b + _diff;
            }
        }

        token.safeTransfer(msg.sender, r);
    }

    function getPricePerFullShare() public view returns (uint) {
        return totalSupply() == 0 ? 1e18 : balance() * 1e18 / totalSupply();
    }
}
