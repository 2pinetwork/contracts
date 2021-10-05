// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "hardhat/console.sol";

interface Farm {
    function piToken() external view returns (address);
}

// Used to test thegraph
contract ControllerWithoutStrat is ERC20, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20Metadata;

    // Address of Archimedes
    address public immutable farm;
    IERC20Metadata public immutable want;

    address public treasury;
    address public strategy = address(0x1111111111111111111111111111111111111111);

    // Fees
    uint constant public FEE_MAX = 10000;
    uint constant public MAX_WITHDRAW_FEE = 100; // 1%
    uint public withdrawFee = 10; // 0.1%

    constructor(
        IERC20Metadata _want,
        address _farm,
        address _treasury
    ) ERC20(
        string(abi.encodePacked("2pi-", _want.name())),
        string(abi.encodePacked("2pi", _want.symbol()))
    ) {
        require(Farm(_farm).piToken() != address(0), "Invalid PiToken on Farm");
        require(_treasury != address(0), "Treasury can't be 0 address");

        want = _want;
        farm = _farm;
        treasury = _treasury;
    }

    function decimals() override public view returns (uint8) {
        return want.decimals();
    }

    modifier onlyFarm() {
        require(msg.sender == farm, "Not from farm");
        _;
    }

    event NewTreasury(address old_treasury, address new_treasury);

    function setTreasury(address _treasury) external onlyOwner nonReentrant {
        emit NewTreasury(treasury, _treasury);

        treasury = _treasury;
    }

    function setWithdrawFee(uint _fee) external onlyOwner nonReentrant {
        require(_fee <= MAX_WITHDRAW_FEE, "!cap");

        withdrawFee = _fee;
    }


    function deposit(address _senderUser, uint _amount) external onlyFarm nonReentrant {
        uint _before = balance();

        want.safeTransferFrom(
            farm, // Archimedes
            address(this),
            _amount
        );

        uint _diff = balance() - _before;

        uint shares;
        if (totalSupply() <= 0) {
            shares = _diff;
        } else {
            shares = (_diff * totalSupply()) / _before;
        }

        _mint(_senderUser, shares);
    }

    // Withdraw partial funds, normally used with a vault withdrawal
    function withdraw(address _senderUser, uint _shares) external onlyFarm nonReentrant {
        // This line has to be calc before burn
        uint _withdraw = (balance() * _shares) / totalSupply();

        _burn(_senderUser, _shares);

        uint withdrawalFee = _withdraw * withdrawFee / FEE_MAX;
        want.safeTransfer(farm, _withdraw - withdrawalFee);
        want.safeTransfer(treasury, withdrawalFee);

    }

    function wantBalance() public view returns (uint) {
        return want.balanceOf(address(this));
    }

    function balance() public view returns (uint) {
        return wantBalance();
    }
}
