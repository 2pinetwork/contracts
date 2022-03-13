// SPDX-License-Identifier: MIT

pragma solidity 0.8.11;

interface ICurvePool {
    // _use_underlying If True, withdraw underlying assets instead of aTokens
    function add_liquidity(uint[2] calldata amounts, uint min_mint_amount, bool _use_underlying) external;
    function add_liquidity(uint[2] calldata amounts, uint min_mint_amount) external;
    function remove_liquidity_one_coin(uint _token_amount, int128 i, uint _min_amount) external returns (uint);
    function remove_liquidity_one_coin(uint _token_amount, int128 i, uint _min_amount, bool _use_underlying) external returns (uint);
    function calc_withdraw_one_coin(uint _token_amount, int128 i) external view returns (uint);
    function calc_token_amount(uint[2] calldata _amounts, bool is_deposit) external view returns (uint);
}
