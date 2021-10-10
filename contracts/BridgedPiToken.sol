//SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

import "hardhat/console.sol";

contract BridgedPiToken is AccessControl {
    using SafeERC20 for IERC20;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

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
        communityMintPerBlock = _rate;
        _updateCurrentTranch();
    }

    function setApiMintPerBlock(uint _rate) external onlyAdmin {
        _beforeChangeMint();
        apiMintPerBlock = _rate;
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
        require(_supply <= available(), "Can't mint more than available");

        // Get the max mintable supply for the current tranche
        uint _maxMintableSupply = _leftToMintInBlock(apiMintPerBlock + communityMintPerBlock);

        // For the max mintable supply for current block, we rest the "already minted".
        // NOTE: thanks to the tranch logic this rest shouldn't be "out of bounds".
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

    // This function is called mint for contract compatibility but it doesn't mint,
    // it only transfers piTokens
    function communityMint(address _receiver, uint _supply) external {
        _checkMintFor(_receiver, _supply, communityMintPerBlock);

        piToken.safeTransfer(_receiver, _supply);
        // emulate totalSupply
        totalMinted += _supply;
    }

    function apiMint(address _receiver, uint _supply) external {
        _checkMintFor(_receiver, _supply, apiMintPerBlock);

        piToken.safeTransfer(_receiver, _supply);
        // emulate totalSupply
        totalMinted += _supply;
    }

    function _mintedInTranch() internal view returns (uint) {
        return totalMinted - mintedForCurrentTranch;
    }

    function _leftToMintInBlock(uint ratePerBlock) internal view returns (uint) {
        if (tranchesBlock <= 0 || tranchesBlock > blockNumber()) {
            return 0;
        } else {
            return ((blockNumber() - tranchesBlock) * ratePerBlock);
        }
    }

    function _leftToMint(uint ratePerBlock) internal view returns (uint) {
        if (ratePerBlock <= 0) { return 0; }

        uint totalLeft = available();
        uint leftToMint = _leftToMintInBlock(ratePerBlock) + restFromLastTranch;

        // This could be less because of the different ratePerBlock api/community
        if (leftToMint <= _mintedInTranch()) { return 0; }

        leftToMint -= _mintedInTranch();

        return (totalLeft < leftToMint) ? totalLeft : leftToMint;
    }

    function communityLeftToMint() public view returns (uint) {
        return _leftToMint(communityMintPerBlock);
    }

    function apiLeftToMint() public view returns (uint) {
        return _leftToMint(apiMintPerBlock);
    }

    function balanceOf(address account) public view returns (uint) {
        return piToken.balanceOf(account);
    }

    // Implemented to be mocked in tests
    function blockNumber() internal view virtual returns (uint) {
        return block.number;
    }
}
