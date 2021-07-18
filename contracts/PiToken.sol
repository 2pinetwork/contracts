//SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import "@openzeppelin/contracts/access/AccessControl.sol";
import { IERC1820Registry } from "@openzeppelin/contracts/utils/introspection/IERC1820Registry.sol";

import "../vendor_contracts/NativeSuperTokenProxy.sol";

contract PiToken is NativeSuperTokenProxy, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    bytes32 internal constant ERC777Recipient = keccak256("ERC777TokensRecipient");

    IERC1820Registry constant internal _ERC1820_REGISTRY =
        IERC1820Registry(0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24);


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

        _ERC1820_REGISTRY.setInterfaceImplementer(
            address(this),
            ERC777Recipient,
            address(this)
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

        // This part is under investigation to make Archimedes a recipient
        // _ERC1820_REGISTRY.setInterfaceImplementer(
        //     address(this),
        //     ERC777Recipient_HASH,
        //     newMinter
        // );
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

        // selfMint directly to receiver requires that receiver has been registered in ERC1820
        self().selfMint(address(this), _supply, data);
        require(self().transfer(_receiver, _supply), "Can't transfer minted tokens");
    }

    function tokensReceived(
        address /*operator*/,
        address /*from*/,
        address /*to*/,
        uint256 /*amount*/,
        bytes calldata /*userData*/,
        bytes calldata /*operatorData*/
    ) external view {
        require(msg.sender == address(this), "Invalid token");
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
