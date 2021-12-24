//SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import { IERC1820Registry } from "@openzeppelin/contracts/utils/introspection/IERC1820Registry.sol";

import "hardhat/console.sol";
import "./PiAdmin.sol";
import "../vendor_contracts/NativeSuperTokenProxy.sol";

contract PiToken is NativeSuperTokenProxy, PiAdmin {
    // mint/burn roles
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    // ERC777 registration in ERC1820
    bytes32 internal constant ERC777Recipient = keccak256("ERC777TokensRecipient");
    IERC1820Registry constant internal _ERC1820_REGISTRY =
        IERC1820Registry(0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24);

    uint public constant MAX_SUPPLY = 6.28e25; // (2 * pi) 62.8M tokens
    uint public constant INITIAL_SUPPLY = (
        2512000 +  // Airdrop + incentives 2.512M
         942000 +  // Exchange 942K
        7536000 +  // Future rounds (investors) 7.536M
        9420000 +  // Timelock Founders 9.42M
        9420000 +  // Timelock Investors 9.42M
        1570000    // Timelock Treasury 1.57M
    ) * (10 ** 18);

    // Rates to mint per block
    uint public communityMintPerBlock;
    uint public apiMintPerBlock;

    // Keep track in which block started the current tranche
    uint internal tranchesBlock;

    // Keep track of minted per type for current tranch
    uint internal apiMintedForCurrentTranch;
    uint internal communityMintedForCurrentTranch;
    // Keep track of un-minted per type for old tranches
    uint internal apiReserveFromOldTranches;
    uint internal communityReserveFromOldTranches;

    uint internal API_TYPE = 0;
    uint internal COMMUNITY_TYPE = 1;

    // Events from SuperToken
    // Minted, Burned, Transfer, Sent

    // Should be called from a wallet
    function init() external onlyAdmin {
        require(self().totalSupply() <= 0, "Already initialized");

        self().initialize(IERC20(address(0x0)), 18, 'Test-2Pi', 'Test-2Pi');

        _ERC1820_REGISTRY.setInterfaceImplementer(
            address(this),
            ERC777Recipient,
            address(this)
        );

        self().selfMint(msg.sender, INITIAL_SUPPLY, abi.encodePacked(keccak256("Tokens for INITIAL SUPPLY")));
    }

    function addMinter(address newMinter) external onlyAdmin {
        _setupRole(MINTER_ROLE, newMinter);
    }

    function initRewardsOn(uint _blockNumber) external onlyAdmin {
        require(tranchesBlock <= 0, "Already set");
        tranchesBlock = _blockNumber;
    }

    // Before change api or community RatePerBlock or before mintForMultiChain is called
    // Calculate and accumulate the un-minted amounts.
    function _beforeChangeMintRate() internal {
        if (tranchesBlock > 0 && blockNumber() > tranchesBlock && (apiMintPerBlock > 0 || communityMintPerBlock > 0)) {
            // Accumulate both proportions to keep track of "un-minted" amounts
            apiReserveFromOldTranches += _leftToMintForCurrentBlock(API_TYPE);
            communityReserveFromOldTranches += _leftToMintForCurrentBlock(COMMUNITY_TYPE);
        }
    }

    function setCommunityMintPerBlock(uint _rate) external onlyAdmin {
        _beforeChangeMintRate();
        communityMintPerBlock = _rate;
        _updateCurrentTranch();
    }

    function setApiMintPerBlock(uint _rate) external onlyAdmin {
        _beforeChangeMintRate();
        apiMintPerBlock = _rate;
        _updateCurrentTranch();
    }

    function _updateCurrentTranch() internal {
        // Update variables to making calculations from this moment
        if (tranchesBlock > 0 && blockNumber() > tranchesBlock) {
            tranchesBlock = blockNumber();
        }

        apiMintedForCurrentTranch = 0;
        communityMintedForCurrentTranch = 0;
    }

    // This function is made to mint an arbitrary amount for other chains
    function mintForMultiChain(uint _amount, bytes calldata data) external onlyAdmin {
        require(_amount > 0, "Insufficient supply");
        require(self().totalSupply() + _amount <= MAX_SUPPLY, "Cant' mint more than cap");

        _beforeChangeMintRate();

        // Mint + transfer to skip the 777-receiver callback
        self().selfMint(address(this), _amount, data);
        // SuperToken transfer is safe
        self().transfer(msg.sender, _amount);

        _updateCurrentTranch();
    }

    // This function checks for "most of revert scenarios" to prevent more minting than expected.
    // And keep track of minted / un-minted amounts
    function _checkMintFor(address _receiver, uint _supply, uint _type) internal {
        require(hasRole(MINTER_ROLE, msg.sender), "Only minters");
        require(_receiver != address(0), "Can't mint to zero address");
        require(_supply > 0, "Insufficient supply");
        require(tranchesBlock > 0, "Rewards not initialized");
        require(tranchesBlock < blockNumber(), "Still waiting for rewards block");
        require(self().totalSupply() + _supply <= MAX_SUPPLY, "Mint capped to 62.8M");

        uint _ratePerBlock = communityMintPerBlock;
        if (_type == API_TYPE) { _ratePerBlock = apiMintPerBlock; }

        require(_ratePerBlock > 0, "Mint ratio is 0");

        // Get the max mintable supply for the current tranche
        uint _maxMintableSupply = _leftToMintForCurrentBlock(_type);

        // Create other variable to add to the MintedForCurrentTranch
        uint _toMint = _supply;

        // if the _supply (mint amount) is less than the expected "everything is fine" but
        // if its greater we have to check the "ReserveFromOldTranches"
        if (_toMint > _maxMintableSupply) {
            // fromReserve is the amount that will be "minted" from the old tranches reserve
            uint fromReserve = _toMint - _maxMintableSupply;

            // Drop the "reserve" amount to track only the "real" tranch minted amount
            _toMint -= fromReserve;

            // Check reserve for type
            if (_type == API_TYPE) {
                require(fromReserve <= apiReserveFromOldTranches, "Can't mint more than expected");

                // drop the minted "extra" amount from old tranches reserve
                apiReserveFromOldTranches -= fromReserve;
            } else {
                require(fromReserve <= communityReserveFromOldTranches, "Can't mint more than expected");

                // drop the minted "extra" amount from history reserve
                communityReserveFromOldTranches -= fromReserve;
            }
        }

        if (_type == API_TYPE) {
            apiMintedForCurrentTranch += _toMint;
        } else {
            communityMintedForCurrentTranch += _toMint;
        }
    }

    function communityMint(address _receiver, uint _supply) external {
        _checkMintFor(_receiver, _supply, COMMUNITY_TYPE);

        // Mint + transfer to skip the 777-receiver callback
        self().selfMint(address(this), _supply, abi.encodePacked(keccak256("Tokens for Community")));
        // SuperToken transfer is safe
        self().transfer(_receiver, _supply);
    }

    function apiMint(address _receiver, uint _supply) external {
        _checkMintFor(_receiver, _supply, API_TYPE);

        // Mint + transfer to skip the 777-receiver callback
        self().selfMint(address(this), _supply, abi.encodePacked(keccak256("Tokens for API")));
        // SuperToken transfer is safe
        self().transfer(_receiver, _supply);
    }

    function communityLeftToMint() public view returns (uint) {
        return _leftToMint(COMMUNITY_TYPE);
    }

    function apiLeftToMint() public view returns (uint) {
        return _leftToMint(API_TYPE);
    }

    function _leftToMintForCurrentBlock(uint _type) internal view returns (uint) {
        if (tranchesBlock <= 0 || tranchesBlock > blockNumber()) { return 0; }

       uint left = blockNumber() - tranchesBlock;

       if (_type == API_TYPE) {
           left *= apiMintPerBlock;
           left -= apiMintedForCurrentTranch;
       } else {
           left *= communityMintPerBlock;
           left -= communityMintedForCurrentTranch;
       }

       return left;
    }

    function _leftToMint(uint _type) internal view returns (uint) {
        uint totalLeft = MAX_SUPPLY - self().totalSupply();
        if (totalLeft <= 0) { return 0; }

        // Get the max mintable supply for the current tranche
        uint _maxMintableSupply = _leftToMintForCurrentBlock(_type);

        // Add the _type accumulated un-minted supply
        _maxMintableSupply += (_type == API_TYPE ? apiReserveFromOldTranches : communityReserveFromOldTranches);

        return (totalLeft <= _maxMintableSupply ? totalLeft : _maxMintableSupply);
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
    }

    function self() internal view returns (ISuperToken) {
        return ISuperToken(address(this));
    }

    function cap() external pure returns (uint) {
        return MAX_SUPPLY;
    }

    // Implemented to be mocked in tests
    function blockNumber() internal view virtual returns (uint) {
        return block.number;
    }
}
