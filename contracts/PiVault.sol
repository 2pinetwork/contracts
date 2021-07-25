//SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract PiVault is ERC20 {
    using SafeERC20 for IERC20;

    IERC20 public token;

    /**
     * @dev Sets the address of 2pi token, the one that the vault will hold
     * as underlying value.
     * @param _token the 2pi token.
     * @param _name the name of the vault token.
     * @param _symbol the symbol of the vault token.
     */
    constructor(
        address _token,
        string memory _name,
        string memory _symbol
    ) ERC20(
        string(abi.encodePacked(_name)),
        string(abi.encodePacked(_symbol))
    ) {
        token = IERC20(_token);
    }

    /**
     * @dev It calculates the total underlying value of {token} held by the system.
     */
    function balance() public view returns (uint) {
        return token.balanceOf(address(this));
    }

    /**
     * @dev Custom logic in here for how much the vault allows to be borrowed.
     * We return 100% of tokens for now. Under certain conditions we might
     * want to keep some of the system funds at hand in the vault, instead
     * of putting them to work.
     */
    function available() public view returns (uint) {
        return token.balanceOf(address(this));
    }

    /**
     * @dev A helper function to call deposit() with all the sender's funds.
     */
    function depositAll() external {
        deposit(token.balanceOf(msg.sender));
    }

    /**
     * @dev The entrypoint of funds into the system. People deposit with this function
     * into the vault.
     */
    function deposit(uint _amount) public {
        uint shares = 0;
        uint _pool = balance();

        token.safeTransferFrom(msg.sender, address(this), _amount);

        uint _after = balance();
        _amount = _after - _pool; // Additional check for deflationary tokens

        if (totalSupply() == 0) {
            shares = _amount;
        } else {
            shares = _amount * totalSupply() / _pool;
        }

        _mint(msg.sender, shares);
    }

    /**
     * @dev A helper function to call withdraw() with all the sender's funds.
     */
    function withdrawAll() external {
        withdraw(balanceOf(msg.sender));
    }

    /**
     * @dev Function to exit the system. The vault will pay up the token holder.
     */
    function withdraw(uint _shares) public {
        require(_shares <= balanceOf(msg.sender), "Can't withdraw more than available");

        uint r = balance() * _shares / totalSupply();

        _burn(msg.sender, _shares);
        token.safeTransfer(msg.sender, r);
    }
}
