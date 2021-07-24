// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";

import "../interfaces/IStrategy.sol";

contract Controller is Ownable {
    using SafeERC20 for IERC20;
    using Address for address;

    address public strategist;

    mapping(address => address) public vaults;
    mapping(address => address) public strategies;
    mapping(address => mapping(address => bool)) public approvedStrategies;

    constructor() {
        strategist = msg.sender;
    }

    modifier onlyStrategist() {
        require(msg.sender == strategist || msg.sender == owner(), "!strategist");
        _;
    }

    function setStrategist(address _strategist) public onlyOwner {
        strategist = _strategist;
    }

    function setVault(address _token, address _vault) public onlyStrategist {
        require(vaults[_token] == address(0), "vault");
        vaults[_token] = _vault;
    }

    function approveStrategy(address _token, address _strategy) public onlyOwner {
        approvedStrategies[_token][_strategy] = true;
    }

    function revokeStrategy(address _token, address _strategy) public onlyOwner {
        approvedStrategies[_token][_strategy] = false;
    }

    function setStrategy(address _token, address _strategy, uint _maticToWantRatio) public onlyStrategist {
        require(approvedStrategies[_token][_strategy] == true, "!approved");

        address _current = strategies[_token];
        if (_current != address(0)) {
            IStrategy(_current).retireStrat(_maticToWantRatio);
        }
        strategies[_token] = _strategy;
    }

    function earn(address _token, uint256 _amount) public {
        address _strategy = strategies[_token];

        IERC20(_token).safeTransfer(_strategy, _amount);
        IStrategy(_strategy).deposit();
    }

    function balanceOf(address _token) external view returns (uint256) {
        return IStrategy(strategies[_token]).balanceOf();
    }

    function inCaseTokensGetStuck(address _token, uint256 _amount) public onlyStrategist {
        IERC20(_token).safeTransfer(msg.sender, _amount);
    }

    function withdraw(address _token, uint256 _amount) public {
        require(msg.sender == vaults[_token], "!vault");
        IStrategy(strategies[_token]).withdraw(_amount);
    }
}
