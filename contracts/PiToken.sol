//SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract PiToken is ERC20Capped, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    uint public MAX_SUPPLY = 1e25; // 10M tokens
    uint public INITIAL_SUPPLY = 35000e18; // 10k airdrop + 25k for liquidity

    constructor() ERC20("2pi", "2PI") ERC20Capped(MAX_SUPPLY) {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    // After deploy initialize the supply token & revoke owner minter role
    function initialSupply() external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Only admin can initialize");
        require(totalSupply() <= 0, "Only to initialize the token");

        _mint(msg.sender, INITIAL_SUPPLY);
    }

    function addMinter(address newMinter) external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Only admin");
        _setupRole(MINTER_ROLE, newMinter);
    }

    function mint(uint supply) external {
        require(hasRole(MINTER_ROLE, msg.sender), "Only minters");
        _mint(msg.sender, supply);
    }

    // For future use, just in case
    function addBurner(address newBurner) external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Only admin");
        _setupRole(BURNER_ROLE, newBurner);
    }

    function burn(uint amount) external {
        require(hasRole(BURNER_ROLE, msg.sender), "Only burners");

        _burn(msg.sender, amount);
    }
}
