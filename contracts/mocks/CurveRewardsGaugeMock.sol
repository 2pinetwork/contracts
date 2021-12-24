// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract CurveRewardsGaugeMock {
    using SafeERC20 for IERC20;

    IERC20 btcCRV = IERC20(0x40bde52e6B80Ae11F34C58c14E1E7fE1f9c834C4);
    IERC20 WMATIC = IERC20(0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f);
    IERC20 CRV = IERC20(0xED8CAB8a931A4C0489ad3E3FB5BdEA84f74fD23E);

    mapping(address => uint) private counter;
    address[] private holders;

    function reset() public {
        WMATIC.transfer(address(1), WMATIC.balanceOf(address(this)));
        CRV.transfer(address(1), CRV.balanceOf(address(this)));

        for (uint i; i < holders.length; i++) {
            counter[holders[i]] = 0;
        }
    }

    function balanceOf(address account) external view returns (uint) {
        return counter[account];
    }
    function claim_rewards(address _addr) external {
        uint _Wbalance = WMATIC.balanceOf(address(this));
        uint _Cbalance = CRV.balanceOf(address(this));

        if (_Wbalance > 0) { WMATIC.safeTransfer(_addr, _Wbalance); }
        if (_Cbalance > 0) { CRV.safeTransfer(_addr, _Cbalance); }
    }

    function deposit(uint _value) external {
        btcCRV.safeTransferFrom(msg.sender, address(this), _value);
        counter[msg.sender] += _value;
        holders.push(msg.sender);
    }
    function withdraw(uint _value) external {
        btcCRV.safeTransfer(msg.sender, _value);

        counter[msg.sender] -= _value;
    }
}
