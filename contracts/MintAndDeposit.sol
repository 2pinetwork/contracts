// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "hardhat/console.sol";

import { IPiToken } from "../interfaces/IPiToken.sol";

interface IPiVault is IERC20 {
    function depositAll() external;
}

contract MintAndDeposit is Ownable {
    using SafeERC20 for IPiVault;

    IPiToken public immutable piToken;
    IPiVault public immutable piVault;

    // to mint PiToken
    bytes private txData = new bytes(0);

    uint private lastBlock;

    // tokens per investor "ticket"
    uint public investorPerBlock = 1;
    // tokens per founder
    uint public founderPerBlock = 1;

    // investor wallet => investor tickets per block
    // private just to keep them anon ?
    mapping(address => uint) private investorTickets;
    address[] private investors;
    uint public investorsCount;

    //  3 founders has the same proportion =)
    uint public constant FOUNDERS_COUNT = 3;
    address[] public founders = new address[](FOUNDERS_COUNT);

    uint public leftTokensForInvestors = 1;
    uint public leftTokensForFounders = 1;

    constructor(address _piToken, address _piVault) {
        piToken = IPiToken(_piToken);
        piVault = IPiVault(_piVault);
        lastBlock = block.number; // deberia ser el del reward
    }

    // add new investor with his tickets
    function addInvestor(address _wallet, uint tickets) external onlyOwner {
        require(tickets > 0, "Zero compromise");
        require(tickets <= 2, "Max 2 per investor"); // just in case

        for (uint i = 0; i < investorsCount; i++) {
            require(investors[i] != _wallet, "already in");
        }

        investors.push(_wallet);
        investorTickets[_wallet] = tickets;
        investorsCount += 1;
    }

    // add new founder
    function addFounder(address _wallet) external onlyOwner {
        founders.push(_wallet);
    }

    function releaseAndDeposit() external onlyOwner {
        require(blockNumber() > lastBlock, "Have to wait");

        mintAndDepositToInvestors();
        mintAndDepositToFounders();

        lastBlock = blockNumber();
    }

    function mintAndDepositToInvestors() internal {
        if (leftTokensForInvestors <= 0) { return; }

        uint multiplier = blockNumber() - lastBlock;
        uint tickets;

        // Accumulate tickets
        for (uint i = 0; i < investorsCount; i++) {
            address wallet = investors[i];
            tickets += investorTickets[wallet];
        }

        uint toMint = multiplier * investorPerBlock * tickets;

        // Check for limit to mint
        if (toMint > leftTokensForInvestors) {
            toMint = leftTokensForInvestors;
        }

        leftTokensForInvestors -= toMint;

        // Call mint one time
        piToken.mint(address(this), toMint, txData);

        // Calc deposited shares
        uint _before = piVault.balanceOf(address(this));

        piVault.depositAll();

        uint shares = piVault.balanceOf(address(this)) - _before;

        // Calc how many shares correspond to each "ticket"
        uint sharesPerTicket = shares / tickets;

        for (uint i = 0; i < investorsCount; i++) {
            address wallet = investors[i];
            uint _amount = sharesPerTicket * investorTickets[wallet];

            // send deposited stk2Pi to each investor
            piVault.safeTransfer(wallet, _amount);
        }
    }

    function mintAndDepositToFounders() internal {
        if (leftTokensForFounders <= 0) { return; }

        uint multiplier = blockNumber() - lastBlock;
        uint toMint = multiplier * founderPerBlock * FOUNDERS_COUNT;

        // Check for limit to mint
        if (toMint > leftTokensForFounders) {
            toMint = leftTokensForFounders;
        }

        leftTokensForFounders -= toMint;

        // Call mint one time
        piToken.mint(address(this), toMint, txData);

        // Calc deposited shares
        uint _before = piVault.balanceOf(address(this));

        piVault.depositAll();

        uint shares = piVault.balanceOf(address(this)) - _before;

        // Calc how many shares correspond to each founder
        uint sharesPerFounder = shares / FOUNDERS_COUNT;

        for (uint i = 0; i < FOUNDERS_COUNT; i++) {
            // send deposited stk2Pi to each investor
            piVault.safeTransfer(founders[i], sharesPerFounder);
        }
    }

    // Only to be mocked
    function blockNumber() internal view returns (uint) {
        return block.number;
    }
}
