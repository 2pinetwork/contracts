// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

interface IRewardsGauge {
    function balanceOf(address account) external view returns (uint);
    function claim_rewards(address _addr) external;
    function deposit(uint _value) external;
    function withdraw(uint _value) external;
}
