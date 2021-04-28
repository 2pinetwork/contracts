//SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract PiVault is ERC20 {
  using SafeERC20 for IERC20;
  using SafeMath for uint256;

  IERC20 public token;

	/**
	 * @dev Sets the value of {token} to the token that the vault will
	 * hold as underlying value.
	 * @param _token the token to maximize.
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
	 * It takes into account the vault contract balance, the strategy contract balance
	 * and the balance deployed in other contracts as part of the strategy.
	 */
  function balance() public view returns (uint) {
		// We should add here the strategy balance
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
	 * into the vault. The vault is then in charge of sending funds into the strategy.
	 */
  function deposit(uint _amount) public {
    token.safeTransferFrom(msg.sender, address(this), _amount);

    _mint(msg.sender, _amount);
  }

	/**
	 * @dev A helper function to call withdraw() with all the sender's funds.
	 */
  function withdrawAll() external {
    withdraw(balanceOf(msg.sender));
  }

	/**
	 * @dev Function to exit the system. The vault will withdraw the required tokens
	 * from the strategy and pay up the token holder.
	 */
  function withdraw(uint _amount) public {
    require(_amount <= balanceOf(msg.sender), "Can't withdraw more than available");

    _burn(msg.sender, _amount);
    token.safeTransfer(msg.sender, _amount);
  }
}
