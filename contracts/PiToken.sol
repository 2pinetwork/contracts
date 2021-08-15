//SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import "@openzeppelin/contracts/access/AccessControl.sol";
import { IERC1820Registry } from "@openzeppelin/contracts/utils/introspection/IERC1820Registry.sol";

// import "hardhat/console.sol";
import "../vendor_contracts/NativeSuperTokenProxy.sol";

contract PiToken is NativeSuperTokenProxy, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    bytes32 internal constant ERC777Recipient = keccak256("ERC777TokensRecipient");

    IERC1820Registry constant internal _ERC1820_REGISTRY =
        IERC1820Registry(0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24);

    uint public constant MAX_SUPPLY = 6.28e25; // (2 * pi) 62.8M tokens
    uint public constant INITIAL_SUPPLY = (
        2512000 + // Airdrop + incentives
         942000 + // Exchange
        7536000   // Future rounds (investors)
    ) * (10 ** 18);

    uint public currentTranche = 0; // first month rate

    // Rates to mint per block
    uint[] public TRANCHES_COMMUNITY_MINT_PER_BLOCK = new uint[](6);

    uint[] public EXPECTED_MINTED_PER_TRANCHE = new uint[](6);
    uint public constant INVESTORS_MINT_RATIO = 0.71689e18; // 9.42M in 1 year
    uint public constant FOUNDERS_MINT_RATIO =  0.35844e18; // 9.42M in 2 years
    uint public constant TREASURY_MINT_RATIO =  0.11948e18; // 1.57M in 1 year

    // variable to keep track in which block the current tranche
    // was initialized.
    uint private tranchesBlock;

    constructor() {
        TRANCHES_COMMUNITY_MINT_PER_BLOCK[0] = 0.29074e18; // for 1 month
        TRANCHES_COMMUNITY_MINT_PER_BLOCK[1] = 0.58148e18; // for 2 months
        TRANCHES_COMMUNITY_MINT_PER_BLOCK[2] = 0.72685e18; // for 6 months
        TRANCHES_COMMUNITY_MINT_PER_BLOCK[3] = 1.24603e18; // for 3 months, first year =D
        TRANCHES_COMMUNITY_MINT_PER_BLOCK[4] = 1.24603e18; // for 4 months
        TRANCHES_COMMUNITY_MINT_PER_BLOCK[5] = 1.81713e18; // for 8 months until the end

        // ACCUMULATED TOKENS for minting everything
        EXPECTED_MINTED_PER_TRANCHE[0] =  1622333e18 + INITIAL_SUPPLY; // for 1 month
        EXPECTED_MINTED_PER_TRANCHE[1] =  5495000e18 + INITIAL_SUPPLY; // for 2 months
        EXPECTED_MINTED_PER_TRANCHE[2] = 16000000e18 + INITIAL_SUPPLY; // for 6 months
        EXPECTED_MINTED_PER_TRANCHE[3] = 23000000e18 + INITIAL_SUPPLY; // for 3 months
        EXPECTED_MINTED_PER_TRANCHE[4] = 30000000e18 + INITIAL_SUPPLY; // for 4 months until the end
        EXPECTED_MINTED_PER_TRANCHE[5] = MAX_SUPPLY; // for 8 months until the end

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    event Mint(uint amount);
    event Burn(uint amount);
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Sent(
        address indexed operator,
        address indexed from,
        address indexed to,
        uint256 amount,
        bytes data,
        bytes operatorData
    );

    modifier onlyAdmin() {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Only admin");
        _;
    }

    function init() external onlyAdmin {
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

    function initRewardsOn(uint _blockNumber) external onlyAdmin {
        require(tranchesBlock <= 0, "Already set");
        tranchesBlock = _blockNumber;
    }

    // will be changed only when the entire amount for the tranche has been minted
    function increaseCurrentTranche() external onlyAdmin {
        require(
            EXPECTED_MINTED_PER_TRANCHE[currentTranche] <= self().totalSupply(),
            "not yet"
        );
        require(currentTranche < 5, "Mint is finished");

        currentTranche += 1;
        tranchesBlock = blockNumber();
    }

    function addMinter(address newMinter) external onlyAdmin {
        _setupRole(MINTER_ROLE, newMinter);
    }

    function mint(address _receiver, uint _supply, bytes calldata data) external {
        require(hasRole(MINTER_ROLE, msg.sender), "Only minters");
        require(_receiver != address(0), "Can't mint to zero address");
        require(_supply > 0, "Insufficient supply");
        require(tranchesBlock > 0, "Rewards not initialized");
        require(tranchesBlock < blockNumber(), "Still waiting for rewards block");
        require(self().totalSupply() + _supply <= MAX_SUPPLY, "Mint capped to 62.5M");

        // double check for mint
        uint _minted = self().totalSupply();

        // If the current trance is the first one we need to rest the initial supply only
        // but if it's greater than 0, we have to rest the expected minted to have
        // the maximum amount to mint for the current block.
        if (currentTranche > 0) {
            _minted -= EXPECTED_MINTED_PER_TRANCHE[currentTranche - 1];
        } else {
            _minted -= INITIAL_SUPPLY;
        }

        // Get the mintPerBlock for the current tranche
        uint _maxMintableSupply = (blockNumber() - tranchesBlock) * totalMintPerBlock() - _supply;
        require(_maxMintableSupply >= _minted, "Can't mint more than expected");

        self().selfMint(address(this), _supply, data);
        require(self().transfer(_receiver, _supply), "Can't transfer minted tokens");
        emit Mint(_supply);
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
    function addBurner(address newBurner) external onlyAdmin {
        _setupRole(BURNER_ROLE, newBurner);
    }

    // prevent anyone can burn
    function burn(uint _amount, bytes calldata data) external {
        require(hasRole(BURNER_ROLE, msg.sender), "Only burners");

        self().selfBurn(msg.sender, _amount, data);
        emit Burn(_amount);
    }

    function self() internal view returns (ISuperToken) {
        return ISuperToken(address(this));
    }

    function cap() external pure returns (uint) {
        return MAX_SUPPLY;
    }

    function communityMintPerBlock() external view returns (uint) {
        if (self().totalSupply() < MAX_SUPPLY) {
            return TRANCHES_COMMUNITY_MINT_PER_BLOCK[currentTranche];
        } else {
            return 0;
        }
    }

    function totalMintPerBlock() public view returns (uint) {
        if (self().totalSupply() < MAX_SUPPLY) {
            uint perBlock = TRANCHES_COMMUNITY_MINT_PER_BLOCK[currentTranche] + FOUNDERS_MINT_RATIO;

            // 0, 1, 2, 3 is the first year so it has to
            // include investors & treasury ratio
            if (currentTranche < 4) {
                perBlock += INVESTORS_MINT_RATIO;
                perBlock += TREASURY_MINT_RATIO;
            }

            return perBlock;
        } else {
            return 0;
        }
    }

    // Implemented to be mocked in tests
    function blockNumber() internal view virtual returns (uint) {
        return block.number;
    }
}
