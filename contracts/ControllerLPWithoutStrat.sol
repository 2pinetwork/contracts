// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "hardhat/console.sol";

import "./PiAdmin.sol";

// "Strategy" that only keeps the LP
contract ControllerLPWithoutStrat is PiAdmin, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public immutable controller; // immutable to prevent anyone to change it and withdraw
    address public immutable LP;

    constructor(address _controller, address _lp) {
        require(_controller != address(0), "Controller !ZeroAddress");
        require(_lp != address(0), "LP !ZeroAddress");

        controller = _controller;
        LP = _lp;
    }

    modifier onlyController() {
        require(msg.sender == controller, "Not from controller");
        _;
    }

    function deposit() external whenNotPaused onlyController nonReentrant {
    }

    function withdraw(uint _amount) external onlyController nonReentrant returns (uint) {
        IERC20(LP).safeTransfer(controller, _amount);

        return _amount;
    }

    function LPBalance() public view returns (uint) {
        return IERC20(LP).balanceOf(address(this));
    }
    function balance() public view returns (uint) {
        return LPBalance();
    }
    // called as part of strat migration. Sends all the available funds back to the vault.
    function retireStrat() external onlyController {
        _pause();

        IERC20(LP).safeTransfer(controller, LPBalance());
    }

    function pause() public onlyAdmin {
        _pause();
    }

    function unpause() external onlyAdmin nonReentrant {
        _unpause();
    }
}
