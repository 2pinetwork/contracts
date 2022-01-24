pragma solidity 0.8.9;

import "../ArchimedesAPI.sol";

contract ArchimedesApiMockV2 is ArchimedesAPI{

    uint private mockedBlockNumber;

    constructor(IPiToken _piToken, uint _startBlock, address _handler) ArchimedesAPI(_piToken, _startBlock, _handler) {}


    function setAccPiTokenPerShare(uint _pid, uint amount) external {
        PoolInfo storage p = poolInfo[_pid];
        p.accPiTokenPerShare = amount;
    }

    function setBlockNumber(uint _n) public {
        mockedBlockNumber = _n;
    }

    function _blockNumber() internal view override returns (uint) {
        return mockedBlockNumber == 0 ? block.number : mockedBlockNumber;
    }

    function callPayReferralCommission(uint _pid, address _user, uint _pending) external {
        _payReferralCommission(_pid, _user, _pending);
    }


    function mockSetPoolController(uint _pid, address _c) external {
        PoolInfo storage p = poolInfo[_pid];
        p.controller = _c;
    }


}