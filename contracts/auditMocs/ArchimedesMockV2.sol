//SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import { Archimedes, IReferral, IPiToken, IWNative } from "../Archimedes.sol";

contract ArchimedesMockV2 is Archimedes {
    uint private mockedBlockNumber;

    constructor(
        IPiToken _piToken,
        uint _startBlock,
        IWNative _wNative
    ) Archimedes(_piToken, _startBlock, _wNative) { }

    function setBlockNumber(uint _n) public {
        mockedBlockNumber = _n;
    }

    function _blockNumber() internal view override returns (uint) {
        return mockedBlockNumber == 0 ? block.number : mockedBlockNumber;
    }

    function mockCallBlockNumber() external view returns(uint) {
        return _blockNumber();
    }

    function mockSetReferralManager(address _ref) external {
        referralMgr = IReferral(_ref);
    }

    function mockCallUserShares(uint _pid) external view returns(uint){
        return _userShares(_pid);
    }

    function mockCallUserSharesWithAddress(uint _pid, address _user ) external view returns(uint){
        return _userShares(_pid,_user);
    }

    function mockCallPaidRewards(uint _pid) external view returns(uint) {
        return paidRewards(_pid);
    }
    function mockCallPaidRewardsWithAddress(uint _pid, address _user) external view returns(uint) {
        return paidRewards(_pid, _user);
    }

    function mockSetControllerForPool(uint _pid, address _ctrl) external {
        poolInfo[_pid].controller = _ctrl;
    }

    function mockCallSafePiTokenTransfer(address _to, uint _amount) external {
        _safePiTokenTransfer(_to, _amount);
    }

    function mockCallPayReferralCommission(address _user, uint _pending) external {
        _payReferralCommission(_user, _pending);
    }

    function mockCallGetMultiplier(uint _from, uint _to) external view returns(uint){
       return  _getMultiplier(_from, _to);
    }

    function mockSetPoolLastRewardBlock(uint _pid, uint lastRewardBlock) external {
        PoolInfo storage pool = poolInfo[_pid];
        pool.lastRewardBlock = lastRewardBlock;
    }

    function mockSetPollWheighting(uint _pid, uint _w) external {
        PoolInfo storage pool = poolInfo[_pid];
        pool.weighing = _w;
    }

    function mockSetTotalWheight(uint _w) external {
        totalWeighing = _w;
    }   
}
