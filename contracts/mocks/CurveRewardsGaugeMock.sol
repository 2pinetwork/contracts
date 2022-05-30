// SPDX-License-Identifier: MIT

pragma solidity 0.8.13;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract CurveRewardsGaugeMock {
    using SafeERC20 for IERC20;

    IERC20 btcCRV = IERC20(0x40bde52e6B80Ae11F34C58c14E1E7fE1f9c834C4);
    IERC20 WMATIC = IERC20(0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f);
    IERC20 CRV = IERC20(0xED8CAB8a931A4C0489ad3E3FB5BdEA84f74fD23E);

    mapping(address => mapping(address => uint)) private claimable;
    mapping(address => uint) private counter;
    address[] private holders;
    address[] private claimers;

    function setClaimable(address _token, address _wallet, uint _amount) external {
        claimable[_token][_wallet] += _amount;
        claimers.push(_wallet);
    }

    function reset() public {
        WMATIC.transfer(address(1), WMATIC.balanceOf(address(this)));
        CRV.transfer(address(1), CRV.balanceOf(address(this)));

        for (uint i; i < holders.length; i++) {
            counter[holders[i]] = 0;
        }

        for (uint i; i < claimers.length; i++) {
            claimable[address(CRV)][claimers[i]] = 0;
            claimable[address(WMATIC)][claimers[i]] = 0;
        }
    }

    function balanceOf(address account) public view returns (uint) {
        return counter[account];
    }
    function claimable_tokens(address wallet) public view returns (uint) {
        return claimable[address(CRV)][wallet];
    }
    function claimable_reward(address _wallet, address _token) external view returns (uint) {
        return claimable[_token][_wallet];
    }

    function reward_count() public pure returns (uint) {
        return 1;
    }

    function reward_tokens(uint) public view returns (address) {
        return address(WMATIC);
    }

    function claim_rewards() external {
        uint _claimable = claimable[address(WMATIC)][msg.sender];

        if (WMATIC.balanceOf(address(this)) > 0 && _claimable > 0) {
            WMATIC.safeTransfer(msg.sender, _claimable);
            claimable[address(WMATIC)][msg.sender] = 0;
        }
    }
    function claimed(address _wallet) external {
        claimable[address(CRV)][_wallet] = 0;
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
