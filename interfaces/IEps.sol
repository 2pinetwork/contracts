// SPDX-License-Identifier: MIT

pragma solidity 0.8.11;

interface IEpsPool {
    function add_liquidity(uint[3] memory amounts, uint min_mint_amount) external;
    function remove_liquidity_one_coin(uint _token_amount, int128 i, uint _min_amount) external;
    function coins(uint) external view returns (address);
    function calc_withdraw_one_coin(uint _token_amount, int128 i) external view returns (uint);
    function calc_token_amount(uint[3] calldata _amounts, bool is_deposit) external view returns (uint);
}

interface IEpsStaker {
    function poolInfo(uint256 _pid) external view returns (address, uint256, uint256, uint256, uint256);
    function userInfo(uint256 _pid, address _user) external view returns (uint256, uint256);
    function claimableReward(uint256 _pid, address _user) external view returns (uint256);
    function deposit(uint256 _pid, uint256 _amount) external;
    function withdraw(uint256 _pid, uint256 _amount) external;
    function emergencyWithdraw(uint256 _pid) external;
    function claim(uint256[] calldata _pids) external;
}

interface IEpsMultiFeeDistribution {
    function exit() external;
}
