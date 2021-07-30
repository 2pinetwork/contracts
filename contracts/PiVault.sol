//SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
// import "hardhat/console.sol";

contract PiVault is ERC20, Ownable {
    using SafeERC20 for IERC20;

    IERC20 public piToken;

    uint public immutable investorsLockTime;
    uint public immutable foundersLockTime;

    // Wallets
    mapping(address => bool) public investors;
    mapping(address => bool) public founders;

    // Individual max amount to release after the first year.
    uint public FOUNDERS_MAX_WITHDRAWS_AFTER_FIRST_YEAR = 1.57e24;
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


    /**
     * @dev Adds address to investors list
     */
    function addInvestor(address _wallet) external onlyOwner {
        investors[_wallet] = true;
    }

    /**
     * @dev Adds address to founders list
     */
    function addFounder(address _wallet) external onlyOwner {
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
     * @dev Custom logic in here for how much the vault allows to be borrowed.
     * We return 100% of piToken for now. Under certain conditions we might
     * want to keep some of the system funds at hand in the vault, instead
     * of putting them to work.
     */
    function available() public view returns (uint) {
        return piToken.balanceOf(address(this));
    }

    /**
     * @dev A helper function to call deposit() with all the sender's funds.
     */
    function depositAll() external {
        deposit(piToken.balanceOf(msg.sender));
    }

    /**
     * @dev The entrypoint of funds into the system. People deposit with this function
     * into the vault.
     */
    function deposit(uint _amount) public {
        uint shares = 0;
        uint _pool = balance();

        piToken.safeTransferFrom(msg.sender, address(this), _amount);

        uint _after = balance();
        _amount = _after - _pool; // Additional check for deflationary piToken

        if (totalSupply() == 0) {
            shares = _amount;
        } else {
            shares = _amount * totalSupply() / _pool;
        }
        // console.log("Minted shares: ", shares);

        _mint(msg.sender, shares);
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
    function withdraw(uint _shares) public {
        // console.log("Shares: ", _shares);
        require(_shares <= balanceOf(msg.sender), "Can't withdraw more than available");

        uint r = balance() * _shares / totalSupply();

        // console.log("R: ", r);
        checkWithdraw(r);

        _burn(msg.sender, _shares);
        piToken.safeTransfer(msg.sender, r);
    }

    /**
     * @dev Check if msg.sender is an investor or a founder to release the funds.
     */
    function checkWithdraw(uint _amount) internal {
        if (investors[msg.sender]) {
            require(block.timestamp >= investorsLockTime, "Still locked");
        } else if (founders[msg.sender]) {
            // Half of founders vesting will be release  at investorsLockTime
            require(block.timestamp >= investorsLockTime, "Still locked");

            // This branch is for the 2º year (between investors release and founders release)
            if (block.timestamp <= foundersLockTime) {
                require(_amount <= foundersLeftToWithdraw[msg.sender], "Can't withdraw more than expected");
                // Accumulate withdrawn for founder
                // (will revert if the amount is greater than the left to withdraw)
                foundersLeftToWithdraw[msg.sender] -= _amount;
            }
        }
    }
}
