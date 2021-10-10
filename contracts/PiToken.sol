//SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import "@openzeppelin/contracts/access/AccessControl.sol";
import { IERC1820Registry } from "@openzeppelin/contracts/utils/introspection/IERC1820Registry.sol";

import "hardhat/console.sol";
import "../vendor_contracts/NativeSuperTokenProxy.sol";

contract PiToken is NativeSuperTokenProxy, AccessControl {
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

    // variable to keep track in which block the current tranche
    // was initialized.
    uint internal tranchesBlock;
    uint internal mintedForCurrentTranch = INITIAL_SUPPLY;
    uint internal restFromLastTranch;

    constructor() {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    // Events from SuperToken
    // Minted, Burned, Transfer, Sent

    modifier onlyAdmin() {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Only admin");
        _;
    }

    // Should be called from a wallet
    function init() external onlyAdmin {
        require(self().totalSupply() <= 0, "Already initialized");

        self().initialize(IERC20(address(0x0)), 18, '2Pi', '2Pi');

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

    function _beforeChangeMint() internal {
        if (tranchesBlock > 0 && blockNumber() > tranchesBlock && (apiMintPerBlock > 0 || communityMintPerBlock > 0)) {
            uint _maxMintableSupply = (blockNumber() - tranchesBlock) * (apiMintPerBlock + communityMintPerBlock);

            // For the max mintable supply, we rest the "already minted"
            _maxMintableSupply -= (self().totalSupply() - mintedForCurrentTranch);

            restFromLastTranch += _maxMintableSupply;
        }
    }

    function setCommunityMintPerBlock(uint _rate) external onlyAdmin {
        _beforeChangeMint();
        communityMintPerBlock = _rate;
        _updateCurrentTranch();
    }

    function setApiMintPerBlock(uint _rate) external onlyAdmin {
        _beforeChangeMint();
        apiMintPerBlock = _rate;
        _updateCurrentTranch();
    }

    function _updateCurrentTranch() internal {
        // Update variables to making calculations from this moment
        if (tranchesBlock > 0 && blockNumber() > tranchesBlock) {
            tranchesBlock = blockNumber();
        }

        mintedForCurrentTranch = self().totalSupply();
    }

    // This function is made to mint an arbitrary amount for other chains
    function mintForMultiChain(uint _amount, bytes calldata data) external onlyAdmin {
        require(self().totalSupply() + _amount <= MAX_SUPPLY, "Cant' mint more than cap");

        _beforeChangeMint();

        // Mint + transfer to skip the 777-receiver callback
        self().selfMint(address(this), _amount, data);
        // SuperToken transfer is safe
        self().transfer(msg.sender, _amount);

        _updateCurrentTranch();
    }

    // This function checks for "most of revert scenarios" to prevent more minting than
    // expected. It's not 100% accurate (but it's better than nothing), because
    // it doesn't differenciate a limit for api and community ratePerBlock.
    // The check joins the max amount to mint both rates in the same block.
    function _checkMintFor(address _receiver, uint _supply, uint _ratePerBlock) internal {
        require(hasRole(MINTER_ROLE, msg.sender), "Only minters");
        require(_receiver != address(0), "Can't mint to zero address");
        require(_supply > 0, "Insufficient supply");
        require(tranchesBlock > 0, "Rewards not initialized");
        require(tranchesBlock < blockNumber(), "Still waiting for rewards block");
        require(_ratePerBlock > 0, "Mint ratio is 0");
        require(self().totalSupply() + _supply <= MAX_SUPPLY, "Mint capped to 62.8M");

        // Get the max mintable supply for the current tranche
        uint _maxMintableSupply = _leftToMintInBlock(apiMintPerBlock + communityMintPerBlock);

        // For the max mintable supply for current block, we rest the "already minted".
        // NOTE: this rest shouldn't be "out of bounds" because of the tranch logic and
        // the maxMintableSupply is calculated with both ratePerBlock .
        _maxMintableSupply -= _mintedInTranch();

        // if the _supply (mint amount) is less than the expected "everything is fine"
        if (_supply <= _maxMintableSupply) {
            return;
        } else {
            // If the supply is greater than expected, then check for the extra reserve
            uint rest = _supply - _maxMintableSupply;

            // If the reserve is not enough, the tx should be reverted
            require(rest <= restFromLastTranch, "Can't mint more than expected");
            // drop the minted "extra" amount from history reserve
            restFromLastTranch -= rest;
        }
    }

    function communityMint(address _receiver, uint _supply) external {
        _checkMintFor(_receiver, _supply, communityMintPerBlock);

        // Mint + transfer to skip the 777-receiver callback
        self().selfMint(address(this), _supply, abi.encodePacked(keccak256("Tokens for Community")));
        // require(self().transfer(_receiver, _supply), "Can't transfer minted tokens");
        // SuperToken transfer is safe
        self().transfer(_receiver, _supply);
    }

    function apiMint(address _receiver, uint _supply) external {
        _checkMintFor(_receiver, _supply, apiMintPerBlock);

        // Mint + transfer to skip the 777-receiver callback
        self().selfMint(address(this), _supply, abi.encodePacked(keccak256("Tokens for API")));
        // require(self().transfer(_receiver, _supply), "Can't transfer minted tokens");
        // SuperToken transfer is safe
        self().transfer(_receiver, _supply);
    }

    function communityLeftToMint() public view returns (uint) {
        return _leftToMint(communityMintPerBlock);
    }

    function apiLeftToMint() public view returns (uint) {
        return _leftToMint(apiMintPerBlock);
    }

    function _mintedInTranch() internal view returns (uint) {
        return self().totalSupply() - mintedForCurrentTranch;
    }
    function _leftToMintInBlock(uint ratePerBlock) internal view returns (uint) {
        if (tranchesBlock <= 0 || tranchesBlock > blockNumber()) {
            return 0;
        } else {
            return ((blockNumber() - tranchesBlock) * ratePerBlock);
        }
    }

    function _leftToMint(uint ratePerBlock) internal view returns (uint) {
        uint totalLeft = MAX_SUPPLY - self().totalSupply();
        uint leftToMint = _leftToMintInBlock(ratePerBlock) + restFromLastTranch;

        // This could be less because of the different ratePerBlock api/community
        if (leftToMint <= _mintedInTranch()) { return 0; }

        leftToMint -= _mintedInTranch();

        return (totalLeft < leftToMint) ? totalLeft : leftToMint;
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
