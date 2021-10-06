// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
// import "hardhat/console.sol";

import { IPiToken } from "../interfaces/IPiToken.sol";

interface IPiVault is IERC20 {
    function depositAll() external;
}

contract MintAndSend is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using SafeERC20 for IPiVault;

    IPiToken public immutable piToken;
    IPiVault public immutable piVault;

    // to mint PiToken
    bytes private constant txData = new bytes(0);

    uint private lastBlock;

    // tokens per investor "ticket"
    uint public constant INVESTOR_PER_BLOCK = 0.04779e18;
    // tokens per founder
    uint public constant FOUNDER_PER_BLOCK = 0.11948e18;
    // tokens for treasury
    uint public constant TREASURY_PER_BLOCK = 0.11948e18;

    address public treasury;

    // investor wallet => investor tickets per block
    mapping(address => uint) private investorTickets;
    uint public constant INVESTORS_TICKETS = 15;
    uint public constant INVESTORS_MAX_COUNT = 10;
    uint public investorsCount;
    address[] private investors;

    //  3 founders has the same proportion =)
    uint public constant FOUNDERS_COUNT = 3;
    address[] public founders = new address[](FOUNDERS_COUNT);

    uint public leftTokensForInvestors = 9.42e24; // 9.42M
    uint public leftTokensForFounders  = 9.42e24; // 9.42M
    uint public leftTokensForTreasury  = 1.57e24; // 1.57M

    constructor(
        address _piToken,
        address _piVault,
        address _treasury,
        uint _startBlock
    ) {
        require(block.number < _startBlock, "Block should be in the future");
        piToken = IPiToken(_piToken);
        piVault = IPiVault(_piVault);
        treasury = _treasury;
        lastBlock = _startBlock; // Same than PiToken & Archimedes
    }

    event NewTreasury(address oldTreasury, address newTreasury);

    /* @dev Add new investor with his tickets
     * We have 10 investors @Genesis each ticket is 942k 2Pi tokens
     * 7 with 1 ticket
     * 2 with 2 tickets
     * 1 with 4 tickets
    **/
    function addInvestor(address _wallet, uint _tickets) external onlyOwner nonReentrant {
        require(_wallet != address(0), "Can't be zero address");
        require(investorsCount < INVESTORS_MAX_COUNT, "Investors already completed");
        require(_tickets == 1 || _tickets == 2 || _tickets == 4, "1, 2 or 4 tickets per Investor");

        // Only 2 investors should have 2 tickets
        uint twoTickets = 0;

        for (uint i = 0; i < investorsCount; i++) {
            require(investors[i] != _wallet, "already in");

            if (investorTickets[investors[i]] == 2){
                twoTickets += 1;
            }

            // Only one investor with 4 tickets
            if (_tickets == 4) {
                require(investorTickets[investors[i]] < 4, "Only one investor with 4 tickets");
            }
        }

        if (_tickets >= 2) {
            require(twoTickets < 2, "Only 2 investors should have 2 tickets");
        }

        investors.push(_wallet);
        investorsCount += 1;
        investorTickets[_wallet] = _tickets;
    }

    // add new founder
    function addFounders(address[FOUNDERS_COUNT] memory _wallets) external onlyOwner nonReentrant {
        address zeroAddress = address(0);
        require(founders[0] == zeroAddress, "Already added");
        require(
            _wallets[0] != zeroAddress &&
            _wallets[1] != zeroAddress &&
            _wallets[2] != zeroAddress,
            "Should be 3 Founders"
        );
        require(
            _wallets[0] != _wallets[1] &&
            _wallets[0] != _wallets[2] &&
            _wallets[1] != _wallets[2],
            "Founders should have different wallets"
        );

        founders = _wallets;
    }

    function setTreasury(address _treasury) external onlyOwner nonReentrant {
        emit NewTreasury(treasury, _treasury);

        treasury = _treasury;
    }

    function mintAndSend() external onlyOwner nonReentrant {
        require(blockNumber() > lastBlock, "Have to wait");
        require(investorsCount == INVESTORS_MAX_COUNT, "should wait for more Investors");
        require(founders[2] != address(0), "should wait for Founders");
        require(
            leftTokensForInvestors > 0 ||
            leftTokensForFounders > 0 ||
            leftTokensForTreasury > 0,
            "Nothing more to do"
        );

        uint multiplier = blockNumber() - lastBlock;

        mintAndDepositToInvestors(multiplier);
        mintAndDepositToFounders(multiplier);
        mintAndTransferToTreasury(multiplier);

        lastBlock = blockNumber();
    }

    function mintAndDepositToInvestors(uint multiplier) internal {
        if (leftTokensForInvestors <= 0) { return; }

        uint toMint = multiplier * INVESTOR_PER_BLOCK * INVESTORS_TICKETS;

        // Check for limit to mint
        if (toMint > leftTokensForInvestors) {
            toMint = leftTokensForInvestors;
        }

        leftTokensForInvestors -= toMint;

        // Call mint one time
        piToken.mint(address(this), toMint, txData);

        // Calc deposited shares
        uint _before = piVault.balanceOf(address(this));

        uint piBalance = piToken.balanceOf(address(this));
        IERC20(piToken).safeApprove(address(piVault), piBalance);

        piVault.depositAll();

        uint shares = piVault.balanceOf(address(this)) - _before;

        // Calc how many shares correspond to each "ticket"
        uint sharesPerTicket = shares / INVESTORS_TICKETS;

        for (uint i = 0; i < investorsCount; i++) {
            address wallet = investors[i];
            uint _amount = sharesPerTicket * investorTickets[wallet];

            // send deposited stk2Pi to each investor
            piVault.safeTransfer(wallet, _amount);
        }
    }

    function mintAndDepositToFounders(uint multiplier) internal {
        uint toMint = multiplier * FOUNDER_PER_BLOCK * FOUNDERS_COUNT;

        // Check for limit to mint
        if (toMint > leftTokensForFounders) {
            toMint = leftTokensForFounders;
        }

        leftTokensForFounders -= toMint;

        // Call mint one time
        piToken.mint(address(this), toMint, txData);

        // Calc deposited shares
        uint _before = piVault.balanceOf(address(this));

        uint piBalance = piToken.balanceOf(address(this));
        IERC20(piToken).safeApprove(address(piVault), piBalance);

        piVault.depositAll();

        uint shares = piVault.balanceOf(address(this)) - _before;

        // Calc how many shares correspond to each founder
        uint sharesPerFounder = shares / FOUNDERS_COUNT;

        for (uint i = 0; i < FOUNDERS_COUNT; i++) {
            // send deposited stk2Pi to each investor
            piVault.safeTransfer(founders[i], sharesPerFounder);
        }
    }

    function mintAndTransferToTreasury(uint multiplier) internal {
        if (leftTokensForTreasury <= 0) { return; }

        uint toMint = multiplier * TREASURY_PER_BLOCK;

        // Check for limit to mint
        if (toMint > leftTokensForTreasury) {
            toMint = leftTokensForTreasury;
        }

        leftTokensForTreasury -= toMint;

        piToken.mint(treasury, toMint, txData);
    }

    // Only to be mocked
    function blockNumber() internal view virtual returns (uint) {
        return block.number;
    }
}
