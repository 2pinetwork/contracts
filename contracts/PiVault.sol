//SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
// import "hardhat/console.sol";
import "./PiAdmin.sol";

contract PiVault is ERC20, PiAdmin, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable piToken;

    // Investor & Founders funds will be deposited but not released
    uint public immutable investorsLockTime;
    uint public immutable foundersLockTime;

    // Wallets
    mapping(address => bool) public investors;
    mapping(address => bool) public founders;

    // Individual max amount to release after the first year.
    uint public constant FOUNDERS_MAX_WITHDRAWS_AFTER_FIRST_YEAR = 1.57e24;
    mapping(address => uint) public foundersLeftToWithdraw;

    /**
     * @dev Sets the address of 2pi token, the one that the vault will hold
     * as underlying value.
     * @param _token the 2pi token.
     */
    constructor(address _token, uint _investorsLock, uint _foundersLock) ERC20('stk2Pi', 'stk2Pi') {
        piToken = IERC20(_token);

        investorsLockTime = _investorsLock;
        foundersLockTime = _foundersLock;
    }

    event Deposit(address indexed user, uint amount);
    event Withdraw(address indexed user, uint amount);

    /**
     * @dev Adds address to investors list
     */
    function addInvestor(address _wallet) external onlyAdmin {
        investors[_wallet] = true;
    }

    /**
     * @dev Adds address to founders list
     */
    function addFounder(address _wallet) external onlyAdmin {
        founders[_wallet] = true;
        foundersLeftToWithdraw[_wallet] = FOUNDERS_MAX_WITHDRAWS_AFTER_FIRST_YEAR;
    }

    /**
     * @dev It calculates the total underlying value of {piToken} held by the system.
     */
    function balance() public view returns (uint) {
        return piToken.balanceOf(address(this));
    }

    /**
     * @dev A helper function to call deposit() with all the sender's funds.
     */
    function depositAll() external returns (uint) {
        return deposit(piToken.balanceOf(msg.sender));
    }

    /**
     * @dev The entrypoint of funds into the system. People deposit with this function
     * into the vault.
     */
    function deposit(uint _amount) public nonReentrant returns (uint) {
        uint shares = 0;
        uint _pool = balance();

        piToken.safeTransferFrom(msg.sender, address(this), _amount);

        uint _after = balance();
        _amount = _after - _pool; // Additional check for deflationary piToken

        if (totalSupply() <= 0) {
            shares = _amount;
        } else {
            shares = _amount * totalSupply() / _pool;
        }

        _mint(msg.sender, shares);
        emit Deposit(msg.sender, _amount);

        return shares;
    }

    /**
     * @dev A helper function to call withdraw() with all the sender's funds.
     */
    function withdrawAll() external {
        withdraw(balanceOf(msg.sender));
    }

    /**
     * @dev Function to exit the system. The vault will pay up the piToken holder.
     */
    function withdraw(uint _shares) public nonReentrant {
        require(_shares <= balanceOf(msg.sender), "Amount not available");

        uint r = balance() * _shares / totalSupply();

        _checkWithdraw(r);

        _burn(msg.sender, _shares);
        piToken.safeTransfer(msg.sender, r);

        emit Withdraw(msg.sender, _shares);
    }

    function getPricePerFullShare() external view returns (uint) {
        uint _totalSupply = totalSupply();

        return _totalSupply <= 0 ? 1e18 : ((balance() * 1e18) / _totalSupply);
    }

    /**
     * @dev Check if msg.sender is an investor or a founder to release the funds.
     */
    function _checkWithdraw(uint _amount) internal {
        if (investors[msg.sender]) {
            require(block.timestamp >= investorsLockTime, "Still locked");
        } else if (founders[msg.sender]) {
            // Half of founders vesting will be release  at investorsLockTime
            require(block.timestamp >= investorsLockTime, "Still locked");

            // This branch is for the 2º year (between investors release and founders release)
            if (block.timestamp <= foundersLockTime) {
                require(_amount <= foundersLeftToWithdraw[msg.sender], "Max withdraw reached");
                // Accumulate withdrawn for founder
                // (will revert if the amount is greater than the left to withdraw)
                foundersLeftToWithdraw[msg.sender] -= _amount;
            }
        }
    }

    function _beforeTokenTransfer(address from, address to, uint /*amount*/) internal virtual override {
        // Ignore mint/burn
        if (from != address(0) && to != address(0)) {
            // Founders & Investors can't transfer shares before timelock
            if (investors[from]) {
                require(block.timestamp >= investorsLockTime, "Still locked");
            } else if (founders[from]) {
                require(block.timestamp >= foundersLockTime, "Still locked");
            }
        }
    }
}
