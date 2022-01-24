pragma solidity 0.8.9;

import "../PiVault.sol";

contract PiVaultMock is PiVault{

    constructor(address _arch, uint _t, uint _t1) PiVault(_arch, _t, _t1){}


    function mockCallBeforeTokenTransfer(address _f, address _t) external {
        _beforeTokenTransfer(_f, _t, 0);
    }
}