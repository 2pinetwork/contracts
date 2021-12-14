// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract CurvePoolMock is ERC20 {
    using SafeERC20 for IERC20;

    IERC20 public constant BTC = IERC20(0x6d925938Edb8A16B3035A4cF34FAA090f490202a);

    address private gauge = address(0xE9061F92bA9A3D9ef3f4eb8456ac9E552B3Ff5C8);

    constructor() ERC20("btcCRV", "btcCRV") {}

    function reset() public {
        _burn(gauge, balanceOf(gauge));
        BTC.transfer(address(1), BTC.balanceOf(address(this)));
    }

    function mint(uint _amount) public {
        _mint(msg.sender, _amount);
    }

    function add_liquidity(uint[2] calldata amounts, uint min_mint_amount, bool /* _use_underlying */) external {
        BTC.safeTransferFrom(msg.sender, address(this), amounts[0]);
        _mint(msg.sender, min_mint_amount);
    }
    function remove_liquidity_one_coin(uint _token_amount, int128 /* i */, uint _min_amount, bool /* _use_underlying */) external returns (uint) {
        _burn(msg.sender, _token_amount);

        BTC.transfer(msg.sender, _min_amount);
        return _min_amount;
    }

    function calc_withdraw_one_coin(uint _token_amount, int128 /* i */) external pure returns (uint) {
        return _token_amount / 1e10;
    }

    function calc_token_amount(uint[2] calldata _amounts, bool /* is_deposit */) external pure returns (uint) {
        return _amounts[0] * 1e10;
    }
}
