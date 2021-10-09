//SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

// import "hardhat/console.sol";

contract BridgedPiToken is AccessControl {
    using SafeERC20 for IERC20;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    // Rates to mint per block
    uint public communityPerBlock;
    uint public apiPerBlock;

    IERC20 public immutable piToken;

    // First block in tranch
    uint public tranchesBlock;
    // Total "minted" in current tranch
    uint public mintedForCurrentTranch;
    // emulate totalSupply
    uint public totalMinted;
    // Last tranch rest accumulator
    uint internal restFromLastTranch;

    // Rates to "mint/transfer" per block
    uint public communityMintPerBlock;
    uint public apiMintPerBlock;


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

    function setCommunityMintPerBlock(uint _rate) external onlyAdmin {
        _beforeChangeMint();
        communityPerBlock = _rate;
        _updateCurrentTranch();
    }

    function setApiMintPerBlock(uint _rate) external onlyAdmin {
        _beforeChangeMint();
        apiPerBlock = _rate;
        _updateCurrentTranch();
    }

    function _beforeChangeMint() internal {
        if (tranchesBlock > 0 && blockNumber() > tranchesBlock && (apiMintPerBlock > 0 || communityMintPerBlock > 0)) {
            uint _maxMintableSupply = (blockNumber() - tranchesBlock) * (apiMintPerBlock + communityMintPerBlock);

            // For the max mintable supply, we rest the "already minted"
            _maxMintableSupply -= (totalMinted - mintedForCurrentTranch);

            restFromLastTranch += _maxMintableSupply;
        }
    }


    function _updateCurrentTranch() internal {
        // Update variables to making calculations from this moment
        if (tranchesBlock > 0 && blockNumber() > tranchesBlock) {
            tranchesBlock = blockNumber();
        }

        mintedForCurrentTranch = totalMinted;
    }

    function addMinter(address newMinter) external onlyAdmin {
        _setupRole(MINTER_ROLE, newMinter);
    }

    function available() public view returns (uint) {
        return piToken.balanceOf(address(this));
    }

    function _checkMintFor(address _receiver, uint _supply, uint _ratePerBlock) internal view {
        require(hasRole(MINTER_ROLE, msg.sender), "Only minters");
        require(_receiver != address(0), "Can't mint to zero address");
        require(_supply > 0, "Insufficient supply");
        require(tranchesBlock > 0, "Rewards not initialized");
        require(tranchesBlock < blockNumber(), "Still waiting for rewards block");
        require(_ratePerBlock > 0, "Mint ratio is 0");
        require(_supply <= available(), "Can't mint more than available");

        // Get the max mintable supply for the current tranche
        uint _maxMintableSupply = (blockNumber() - tranchesBlock) * (apiMintPerBlock + communityMintPerBlock) + restFromLastTranch;

        // For the max mintable supply, we rest the "already minted"
        _maxMintableSupply -= (totalMinted - mintedForCurrentTranch);

        // Check that "supply to be minted" is less or equal to max mintable in this tranch
        require(_supply <= _maxMintableSupply, "Can't mint more than expected");
    }

    // This function is called mint for contract compatibility but it doesn't mint,
    // it only transfers piTokens
    function communityMint(address _receiver, uint _supply) external {
        _checkMintFor(_receiver, _supply, communityMintPerBlock);
        require(_supply <= communityLeftToMint(), "Can't mint more than available");

        piToken.safeTransfer(_receiver, _supply);
        // emulate totalSupply
        totalMinted += _supply;
    }

    function apiMint(address _receiver, uint _supply) external {
        _checkMintFor(_receiver, _supply, apiMintPerBlock);
        require(_supply <= apiLeftToMint(), "Can't mint more than available");

        piToken.safeTransfer(_receiver, _supply);
        // emulate totalSupply
        totalMinted += _supply;
    }

    function communityLeftToMint() public view returns (uint) {
        if (apiMintPerBlock <= 0 && communityMintPerBlock > 0) {
            return available();
        } else if (apiPerBlock > 0 && communityMintPerBlock > 0) {
            return (available() + communityMintPerBlock) / (apiMintPerBlock + communityMintPerBlock);
        } else {
            return 0;
        }
    }

    function apiLeftToMint() public view returns (uint) {
        if (communityMintPerBlock <= 0 && apiMintPerBlock > 0) {
            return available();
        } else if (apiPerBlock > 0 && communityMintPerBlock > 0) {
            return (available() + apiMintPerBlock) / (apiMintPerBlock + communityMintPerBlock);
        } else {
            return 0;
        }
    }

    // Implemented to be mocked in tests
    function blockNumber() internal view virtual returns (uint) {
        return block.number;
    }
}
