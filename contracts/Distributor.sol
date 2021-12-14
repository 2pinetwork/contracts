// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
// import "hardhat/console.sol";

import "./PiAdmin.sol";
import { IPiToken } from "../interfaces/IPiToken.sol";

interface IPiVault is IERC20 {
    function deposit(uint amount) external returns (uint);
}

contract Distributor is PiAdmin, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using SafeERC20 for IPiVault;

    IPiToken public immutable piToken;
    IPiVault public immutable piVault;

    uint private lastBlock;

    // tokens per investor "ticket"
    uint public constant INVESTOR_PER_BLOCK = 0.04779e18;
    // tokens per founder
    uint public constant FOUNDER_PER_BLOCK = 0.11948e18;
    // tokens for treasury
    uint public constant TREASURY_PER_BLOCK = 0.11948e18;

    address public treasury;

    // investor wallet => investor tickets per block
    mapping(address => uint) public investorTickets;
    uint public constant INVESTORS_TICKETS = 15;
    uint public constant INVESTORS_COUNT = 10;
    address[] public investors = new address[](INVESTORS_COUNT);

    // 3 founders has the same proportion
    uint public constant FOUNDERS_COUNT = 3;
    address[] public founders = new address[](FOUNDERS_COUNT);

    uint public leftTokensForInvestors = 9.42e24; // 9.42M
    uint public leftTokensForFounders  = 9.42e24; // 9.42M
    uint public leftTokensForTreasury  = 1.57e24; // 1.57M

    constructor(address _piToken, address _piVault, address _treasury) {
        piToken = IPiToken(_piToken);
        piVault = IPiVault(_piVault);
        treasury = _treasury;
        lastBlock = _blockNumber();

        // Will be changed for the right wallets before deploy
        founders[0] = address(0x1cC86b9b67C93B8Fa411554DB761f68979E7995A);
        founders[1] = address(0xBF67C362d035e6B6e95C4F254fe359Eea8B8C7ea);
        founders[2] = address(0xc2d2fE7c1aD582723Df08e3e176762f70d7aC7eC);

        investors[0] = address(0x3181893d37BC1F89635B4dDAc5A7424d804FA9c9);
        investors[1] = address(0x610DA3A2b17a0611552E7519b804D2E554CbCE35);
        investors[2] = address(0x713C9aE2D300FE95f9778dC63DdA6B6a64E16474);
        investors[3] = address(0xD5399bE4abD48fBe728E5e20E352633a206Da795);
        investors[4] = address(0x774A1a1546Ff63135414b7394FD50779dfD0296d);
        investors[5] = address(0xc5A094F8AC2c9a51144930565Af590C51F1C1F66);
        investors[6] = address(0xe4eDB9B7b97884f37660b00aDfbB814bD4Bf1d61);
        investors[7] = address(0x75037D275A63f6449bbcAC7e971695696D6C2ce5);
        investors[8] = address(0x21E1A8CE937c0A0382ECebe687e9968c2f51731b);
        investors[9] = address(0x7341Fb8d04BE5FaEFe9152EC8Ca90908deBA1CB6);

        investorTickets[investors[0]] = 4;
        investorTickets[investors[1]] = 2;
        investorTickets[investors[2]] = 2;
        investorTickets[investors[3]] = 1;
        investorTickets[investors[4]] = 1;
        investorTickets[investors[5]] = 1;
        investorTickets[investors[6]] = 1;
        investorTickets[investors[7]] = 1;
        investorTickets[investors[8]] = 1;
        investorTickets[investors[9]] = 1;
    }

    event NewTreasury(address oldTreasury, address newTreasury);
    event InvestorsDistributed(uint amount);
    event FoundersDistributed(uint amount);
    event TreasoryDistributed(uint amount);

    function setTreasury(address _treasury) external onlyAdmin nonReentrant {
        require(_treasury != treasury, "Same address");
        require(_treasury != address(0), "!ZeroAddress");
        emit NewTreasury(treasury, _treasury);

        treasury = _treasury;
    }

    function distribute() external nonReentrant {
        require(_blockNumber() > lastBlock, "Have to wait");
        require(
            leftTokensForInvestors > 0 ||
            leftTokensForFounders > 0 ||
            leftTokensForTreasury > 0,
            "Nothing more to do"
        );

        uint multiplier = _blockNumber() - lastBlock;

        _depositToInvestors(multiplier);
        _depositToFounders(multiplier);
        _transferToTreasury(multiplier);

        lastBlock = _blockNumber();
    }

    function _depositToInvestors(uint multiplier) internal {
        if (leftTokensForInvestors <= 0) { return; }

        uint amount = multiplier * INVESTOR_PER_BLOCK * INVESTORS_TICKETS;

        // Check for limit to mint
        if (amount > leftTokensForInvestors) {
            amount = leftTokensForInvestors;
        }

        leftTokensForInvestors -= amount;

        IERC20(piToken).safeApprove(address(piVault), amount);
        uint shares = piVault.deposit(amount);

        // Calc how many shares correspond to each "ticket"
        uint sharesPerTicket = shares / INVESTORS_TICKETS;

        for (uint i = 0; i < INVESTORS_COUNT; i++) {
            address wallet = investors[i];
            uint _sharesAmount = sharesPerTicket * investorTickets[wallet];

            // send deposited stk2Pi to each investor
            piVault.safeTransfer(wallet, _sharesAmount);
        }

        emit InvestorsDistributed(amount);
    }

    function _depositToFounders(uint multiplier) internal {
        if (leftTokensForFounders <= 0) { return; }

        uint amount = multiplier * FOUNDER_PER_BLOCK * FOUNDERS_COUNT;

        // Check for limit to mint
        if (amount > leftTokensForFounders) {
            amount = leftTokensForFounders;
        }

        leftTokensForFounders -= amount;

        // Calc deposited shares
        IERC20(piToken).safeApprove(address(piVault), amount);
        uint shares = piVault.deposit(amount);

        // Calc how many shares correspond to each founder
        uint sharesPerFounder = shares / FOUNDERS_COUNT;

        for (uint i = 0; i < FOUNDERS_COUNT; i++) {
            // send deposited stk2Pi to each investor
            piVault.safeTransfer(founders[i], sharesPerFounder);
        }

        emit FoundersDistributed(amount);
    }

    function _transferToTreasury(uint multiplier) internal {
        // Just in case of division "rest"
        uint shares = piVault.balanceOf(address(this));
        if (shares > 0) { piVault.safeTransfer(treasury, shares); }

        if (leftTokensForTreasury <= 0) { return; }

        uint amount = multiplier * TREASURY_PER_BLOCK;

        // Check for limit to mint
        if (amount > leftTokensForTreasury) {
            amount = leftTokensForTreasury;
        }

        leftTokensForTreasury -= amount;

        // SuperToken transfer is safe
        piToken.transfer(treasury, amount);

        emit TreasoryDistributed(amount);
    }

    // Only to be mocked
    function _blockNumber() internal view virtual returns (uint) {
        return block.number;
    }
}
