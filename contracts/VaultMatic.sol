// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./CommonContract.sol";

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "../interfaces/IController.sol";

interface IWMATIC is IERC20 {
    function deposit() external payable;
    function withdraw(uint wad) external;
}

contract VaultMatic is ERC20, CommonContract {
    using SafeERC20 for IWMATIC;
    using Address for address;
    using SafeMath for uint;

    // IWMATIC public constant wmatic = IWMATIC(0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889); // Mumbai
    IWMATIC public constant wmatic = IWMATIC(0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270); // Polygon

    address public controller;

    constructor() ERC20(
        string(abi.encodePacked("2pi Matic")),
        string(abi.encodePacked("2piMatic"))
    ) { }

    // Needed to be payable contract, for unwrap MATIC
    fallback() external payable { }
    receive() external payable { }

    function balance() public view returns (uint) {
        return wmatic.balanceOf(address(this)).add(IController(controller).balanceOf(address(wmatic)));
    }

    function setController(address _controller) external onlyOwner {
        controller = _controller;
    }

    function available() public view returns (uint) {
        return wmatic.balanceOf(address(this));
    }

    function earn() public {
        uint _bal = available();
        wmatic.safeTransfer(controller, _bal);
        IController(controller).earn(address(wmatic), _bal);
    }

    function depositMATIC() public payable {
        uint _pool = balance();
        uint _amount = msg.value;

        // wrap matic to wmatic
        wmatic.deposit{value: _amount}();

        earn();

        uint _after = balance();
        _amount = _after.sub(_pool); // Additional check for deflationary tokens

        uint shares = 0;
        if (totalSupply() == 0) {
            shares = _amount;
        } else {
            shares = (_amount.mul(totalSupply())).div(_pool);
        }
        _mint(msg.sender, shares);
    }

    function withdrawAll() external {
        withdraw(balanceOf(msg.sender));
    }

    function withdraw(uint _shares) public {
        uint r = (balance().mul(_shares)).div(totalSupply());
        _burn(msg.sender, _shares);

        // Check balance
        uint b = wmatic.balanceOf(address(this));
        if (b < r) {
            uint _withdraw = r.sub(b);
            IController(controller).withdraw(address(wmatic), _withdraw);
            uint _after = wmatic.balanceOf(address(this));
            uint _diff = _after.sub(b);
            if (_diff < _withdraw) {
                r = b.add(_diff);
            }
        }

        // Unwrap MATIC
        wmatic.withdraw(r);

        payable(msg.sender).transfer(r);
    }

    function getPricePerFullShare() public view returns (uint) {
        return totalSupply() == 0 ? 1e18 : balance().mul(1e18).div(totalSupply());
    }
}
