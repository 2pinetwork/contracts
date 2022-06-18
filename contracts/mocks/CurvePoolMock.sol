// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract CurvePoolMock is ERC20 {
    using SafeERC20 for IERC20;

    IERC20 public token;
    address private gauge;

    constructor(address _token, address _gauge, string memory _name) ERC20(_name, _name) {
        token = IERC20(_token);
        gauge = _gauge;
    }

    function setGauge(address _gauge) public {
        gauge = _gauge;
    }

    function reset() public {
        _burn(gauge, balanceOf(gauge));
        token.transfer(address(1), token.balanceOf(address(this)));
    }

    function mint(uint _amount) public {
        _mint(msg.sender, _amount);
    }

    function add_liquidity(uint[2] calldata amounts, uint min_mint_amount, bool /* _use_underlying */) external {
        token.safeTransferFrom(msg.sender, address(this), amounts[0]);
        _mint(msg.sender, min_mint_amount);
    }

    function add_liquidity(uint[4] calldata amounts, uint min_mint_amount) external {
        token.safeTransferFrom(msg.sender, address(this), amounts[0]);
        _mint(msg.sender, min_mint_amount);
    }

    function remove_liquidity_one_coin(uint _token_amount, int128 /* i */, uint _min_amount, bool /* _use_underlying */) external returns (uint) {
        _burn(msg.sender, _token_amount);

        token.transfer(msg.sender, _min_amount);
        return _min_amount;
    }

    function calc_withdraw_one_coin(uint _token_amount, int128 /* i */) external view returns (uint) {
        return _token_amount / 10 ** (18 - IERC20Metadata(address(token)).decimals());
    }

    function calc_token_amount(uint[2] calldata _amounts, bool /* is_deposit */) external view returns (uint) {
        return _amounts[0] * 10 ** (18 - IERC20Metadata(address(token)).decimals());
    }

    function calc_token_amount(uint[4] calldata _amounts, bool /* is_deposit */) external pure returns (uint) {
        return _amounts[0];
    }
}
