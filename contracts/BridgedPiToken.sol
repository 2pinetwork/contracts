//SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

import "hardhat/console.sol";

contract BridgedPiToken is AccessControl {
    using SafeERC20 for IERC20;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    IERC20 public immutable piToken;

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


    constructor(IERC20 _piToken) {
        piToken = _piToken;
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    modifier onlyAdmin() {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Only admin");
        _;
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

        // mintedForCurrentTranch = self().totalSupply();
        apiMintedForCurrentTranch = 0;
        communityMintedForCurrentTranch = 0;
    }


    function addMinter(address newMinter) external onlyAdmin {
        _setupRole(MINTER_ROLE, newMinter);
    }

    function available() public view returns (uint) {
        return piToken.balanceOf(address(this));
    }

    // This function checks for "most of revert scenarios" to prevent more minting than expected.
    // And keep track of minted / un-minted amounts
    function _checkMintFor(address _receiver, uint _supply, uint _type) internal {
        require(hasRole(MINTER_ROLE, msg.sender), "Only minters");
        require(_receiver != address(0), "Can't mint to zero address");
        require(_supply > 0, "Insufficient supply");
        require(tranchesBlock > 0, "Rewards not initialized");
        require(tranchesBlock < blockNumber(), "Still waiting for rewards block");
        require(available() >= _supply, "Can't mint more than available");

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

    // This function is called mint for contract compatibility but it doesn't mint,
    // it only transfers piTokens
    function communityMint(address _receiver, uint _supply) external {
        _checkMintFor(_receiver, _supply, COMMUNITY_TYPE);

        piToken.safeTransfer(_receiver, _supply);
    }

    function apiMint(address _receiver, uint _supply) external {
        _checkMintFor(_receiver, _supply, API_TYPE);

        piToken.safeTransfer(_receiver, _supply);
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
        uint totalLeft = available();
        if (totalLeft <= 0) { return 0; }

        // Get the max mintable supply for the current tranche
        uint _maxMintableSupply = _leftToMintForCurrentBlock(_type);

        // Add the _type accumulated un-minted supply
        _maxMintableSupply += (_type == API_TYPE ? apiReserveFromOldTranches : communityReserveFromOldTranches);

        return (totalLeft <= _maxMintableSupply ? totalLeft : _maxMintableSupply);
    }

    function communityLeftToMint() public view returns (uint) {
        return _leftToMint(COMMUNITY_TYPE);
    }

    function apiLeftToMint() public view returns (uint) {
        return _leftToMint(API_TYPE);
    }


    function balanceOf(address account) public view returns (uint) {
        return piToken.balanceOf(account);
    }

    // Implemented to be mocked in tests
    function blockNumber() internal view virtual returns (uint) {
        return block.number;
    }
}
