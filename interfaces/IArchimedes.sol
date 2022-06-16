// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

interface IArchimedes {
    function piToken() external view returns (address);
    function beforeSharesTransfer(uint _pid, address _from, address _to, uint _amount) external;
    function afterSharesTransfer(uint _pid, address _from, address _to, uint _amount) external;
}
