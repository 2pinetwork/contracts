// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

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
    address public immutable want; // LP

    constructor(address _controller, address _lp) {
        require(_controller != address(0), "Controller !ZeroAddress");
        require(_lp != address(0), "want !ZeroAddress");

        controller = _controller;
        want = _lp;
    }

    modifier onlyController() {
        require(msg.sender == controller, "Not from controller");
        _;
    }

    function identifier() external pure returns (string memory) {
        return string("any@LP#1.0.0");
    }

    // @dev Just receive LPs from Controller
    function deposit() external whenNotPaused onlyController nonReentrant {
        // This function is ALWAYS called from the Controller and is used just
        // to receive the LPs.
        // As Controller implementation:
        //       want.safeTransfer(strategy, _amount);
        //       IStrategy(strategy).deposit();
        //
        // At the moment we're not investing LPs in any pool. But to keep all the
        // strategies working in the same way we keep deposit/withdraw functions without
        // anything else more than receive and return LPs.
    }

    // @dev Just return LPs to Controller
    function withdraw(uint _amount) external onlyController nonReentrant returns (uint) {
        IERC20(want).safeTransfer(controller, _amount);

        return _amount;
    }

    // @dev Just to be called from Controller for compatibility
    function beforeMovement() external nonReentrant { }

    function wantBalance() public view returns (uint) {
        return IERC20(want).balanceOf(address(this));
    }
    function balance() public view returns (uint) {
        return wantBalance();
    }
    // called as part of strat migration. Sends all the available funds back to the vault.
    function retireStrat() external onlyController {
        _pause();

        IERC20(want).safeTransfer(controller, wantBalance());
    }

    function pause() public onlyAdmin {
        _pause();
    }

    function unpause() external onlyAdmin nonReentrant {
        _unpause();
    }
}
