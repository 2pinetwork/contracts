//SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

contract LP {
    address public token0;
    address public token1;

    uint112 private reserve0;
    uint112 private reserve1;

    constructor(address _t0, address _t1) {
        token0 = _t0;
        token1 = _t1;
    }

    function setReserves(uint112 a, uint112 b) public {
        reserve0 = a;
        reserve1 = b;
    }

    function getReserves() public view returns (uint112, uint112, uint32){
        return (reserve0,reserve1,1);
    }
}
