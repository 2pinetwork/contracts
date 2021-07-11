//SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import "@openzeppelin/contracts/access/AccessControl.sol";

import "../vendor_contracts/NativeSuperTokenProxy.sol";

contract PiToken is NativeSuperTokenProxy, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    uint public MAX_SUPPLY = 1e25; // 10M tokens
    // 10k airdrop + 25k for liquidity
    uint public INITIAL_SUPPLY = 35000e18;

    // Be sure that the mint supply never be more than the expected per block
    // mechanism to avoid any "hack" or problem with mint/minter
    // Community reward per block => 0.233e18
    // Treasury reward per block => 0.033e18
    // Max reward per block => 0.27e18
    uint public constant MAX_MINT_PER_BLOCK = 0.27e18;
    uint private startRewardsBlock;

    constructor() {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function init() external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Only admin can initialize");

        ISuperToken(address(this)).initialize(
            IERC20(address(0x0)),
            18, // shouldn't matter if there's no wrapped token
            '2Pi',
            '2Pi'
        );

        ISuperToken(address(this)).selfMint(msg.sender, INITIAL_SUPPLY, new bytes(0));
    }

    function initRewardsOn(uint _blockNumber) external {
        require(startRewardsBlock <= 0, "Already set");
        startRewardsBlock = _blockNumber;
    }

    function addMinter(address newMinter) external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Only admin");
        _setupRole(MINTER_ROLE, newMinter);
    }

    function mint(address _receiver, uint _supply, bytes calldata data) external {
        require(hasRole(MINTER_ROLE, msg.sender), "Only minters");
        require(_receiver != address(0), "Can't mint to zero address");
        require(_supply > 0, "Insufficient supply");
        require(startRewardsBlock > 0, "Rewards not initialized");
        require(self().totalSupply() + _supply <= MAX_SUPPLY, "Mint capped to 10M");

        // double check for mint
        uint _maxMintableSupply = (
            (block.number - startRewardsBlock) * MAX_MINT_PER_BLOCK
        ) - (self().totalSupply() - INITIAL_SUPPLY);

        require(_supply <= _maxMintableSupply, "Can't mint more than expected");

        self().selfMint(_receiver, _supply, data);
    }

    // For future use, just in case
    function addBurner(address newBurner) external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Only admin");
        _setupRole(BURNER_ROLE, newBurner);
    }

    // prevent anyone can burn
    function burn(uint _amount, bytes calldata data) external {
        require(hasRole(BURNER_ROLE, msg.sender), "Only burners");

        self().selfBurn(msg.sender, _amount, data);
    }

    function self() internal view returns (ISuperToken) {
        return ISuperToken(address(this));
    }

    function cap() external view returns (uint) {
        return MAX_SUPPLY;
    }
}
