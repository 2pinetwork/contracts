// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface Strategy {
    function deposit(address _senderUser, uint _amount) external returns (uint);
}

contract FarmMock {
    address token;
    address strategy;

    constructor (address _token) {
        token = _token;
    }

    function setStrategy(address _strategy) public {
        strategy = _strategy;
    }

    function piToken() external view returns (address) {
        return token;
    }

    function deposit(address _senderUser, uint _amount) public returns (uint) {
        IERC20(token).approve(strategy, _amount);

        return Strategy(strategy).deposit(_senderUser, _amount);
    }
}
