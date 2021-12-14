// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "./PiAdmin.sol";
import "../interfaces/IPiToken.sol";
import "../interfaces/IController.sol";
import "../interfaces/IReferral.sol";
import "../interfaces/IWNative.sol";


contract Archimedes is PiAdmin, ReentrancyGuard {
    // using Address for address;
    using SafeERC20 for IERC20;

    // Used for native token deposits/withdraws
    IWNative public immutable WNative;

    // Info of each pool.
    struct PoolInfo {
        IERC20 want;             // Address of token contract.
        uint weighing;           // How much weighing assigned to this pool. PIes to distribute per block.
        uint lastRewardBlock;    // Last block number that PIes distribution occurs.
        uint accPiTokenPerShare; // Accumulated PIes per share, times SHARE_PRECISION. See below.
        address controller;      // Token controller
    }

    // IPiToken already have safe transfer from SuperToken
    IPiToken public piToken;

    // Used to made multiplications and divitions over shares
    uint public constant SHARE_PRECISION = 1e18;

    // Info of each pool.
    PoolInfo[] public poolInfo;
    // Info of each user that stakes tokens.
    // Users can't transfer controller's minted tokens
    mapping(uint => mapping(address => uint)) public userPaidRewards;
    // Total weighing. Must be the sum of all pools weighing.
    uint public totalWeighing;
    // The block number when PI mining starts.
    uint public startBlock;

    // PiToken referral contract address.
    IReferral public referralMgr;
    // Referral commission rate in basis points.
    uint16 public referralCommissionRate = 10; // 1%
    // Max referral commission rate: 5%.
    uint16 public constant MAXIMUM_REFERRAL_COMMISSION_RATE = 50; // 5%
    uint16 public constant COMMISSION_RATE_PRECISION = 1000;

    event Deposit(uint indexed pid, address indexed user, uint amount);
    event Withdraw(uint indexed pid, address indexed user, uint amount);
    event EmergencyWithdraw(uint indexed pid, address indexed user, uint amount);
    event NewPool(uint indexed pid, address want, uint weighing);
    event PoolWeighingUpdated(uint indexed pid, uint oldWeighing, uint newWeighing);
    event Harvested(uint indexed pid, address indexed user, uint amount);

    constructor(IPiToken _piToken, uint _startBlock, IWNative _wNative) {
        require(address(_piToken) != address(0), "Pi address !ZeroAddress");
        require(_startBlock > _blockNumber(), "StartBlock must be in the future");

        piToken = _piToken;
        startBlock = _startBlock;
        WNative = _wNative;
    }

    // Deposit Native
    receive() external payable { }

    modifier onlyController(uint _pid) {
        require(poolInfo[_pid].controller == msg.sender, "!Controller");
        _;
    }

    // Add a new want token to the pool. Can only be called by the owner.
    function addNewPool(IERC20 _want, address _ctroller, uint _weighing, bool _massUpdate) external onlyAdmin {
        require(address(_want) != address(0), "Address zero not allowed");
        require(IController(_ctroller).farm() == address(this), "Not a farm controller");
        require(IController(_ctroller).strategy() != address(0), "Controller without strategy");

        // Update pools before a weighing change
        if (_massUpdate) { massUpdatePools(); }

        uint lastRewardBlock = _blockNumber() > startBlock ? _blockNumber() : startBlock;

        totalWeighing += _weighing;

        poolInfo.push(PoolInfo({
            want: _want,
            weighing: _weighing,
            lastRewardBlock: lastRewardBlock,
            accPiTokenPerShare: 0,
            controller: _ctroller
        }));

        uint _pid = poolInfo.length - 1;
        uint _setPid = IController(_ctroller).setFarmPid(_pid);
        require(_pid == _setPid, "Pid doesn't match");

        emit NewPool(_pid, address(_want), _weighing);
    }

    // Update the given pool's rewards weighing .
    function changePoolWeighing(uint _pid, uint _weighing, bool _massUpdate) external onlyAdmin {
        emit PoolWeighingUpdated(_pid, poolInfo[_pid].weighing, _weighing);

        // Update pools before a weighing change
        if (_massUpdate) {
            massUpdatePools();
        } else {
            updatePool(_pid);
        }

        totalWeighing = (totalWeighing - poolInfo[_pid].weighing) + _weighing;
        poolInfo[_pid].weighing = _weighing;
    }

    // Return reward multiplier over the given _from to _to block.
    function _getMultiplier(uint _from, uint _to) internal pure returns (uint) {
        return _to - _from;
    }

    // View function to see pending PIes on frontend.
    function pendingPiToken(uint _pid, address _user) external view returns (uint) {
        PoolInfo storage pool = poolInfo[_pid];

        uint accPiTokenPerShare = pool.accPiTokenPerShare;
        uint sharesTotal = _controller(_pid).totalSupply();

        if (_blockNumber() > pool.lastRewardBlock && sharesTotal > 0 && piToken.communityLeftToMint() > 0) {
            uint multiplier = _getMultiplier(pool.lastRewardBlock, _blockNumber());
            uint piTokenReward = (multiplier * piTokenPerBlock() * pool.weighing) / totalWeighing;
            accPiTokenPerShare += (piTokenReward * SHARE_PRECISION) / sharesTotal;
        }
        return ((_userShares(_pid, _user) * accPiTokenPerShare) / SHARE_PRECISION) - paidRewards(_pid, _user);
    }

    // Update reward variables for all pools. Be careful of gas spending!
    function massUpdatePools() public {
        for (uint pid = 0; pid < poolInfo.length; ++pid) {
            updatePool(pid);
            if (_outOfGasForLoop()) { break; }
        }
    }

    // Mint community tokens for a given pool pid
    function updatePool(uint _pid) public {
        PoolInfo storage pool = poolInfo[_pid];

        // If same block as last update return
        if (_blockNumber() <= pool.lastRewardBlock) { return; }

        // If community Mint is already finished
        uint communityLeftToMint = piToken.communityLeftToMint();
        if (communityLeftToMint <= 0) {
            pool.lastRewardBlock = _blockNumber();
            return;
        }

        uint sharesTotal = _controller(_pid).totalSupply();

        if (sharesTotal <= 0 || pool.weighing <= 0) {
            pool.lastRewardBlock = _blockNumber();
            return;
        }

        uint multiplier = _getMultiplier(pool.lastRewardBlock, _blockNumber());
        uint piTokenReward = (multiplier * piTokenPerBlock() * pool.weighing) / totalWeighing;

        // No rewards =( update lastRewardBlock
        if (piTokenReward <= 0) {
            pool.lastRewardBlock = _blockNumber();
            return;
        }

        // If the reward is greater than the left to mint
        if (piTokenReward > communityLeftToMint) {
            piTokenReward = communityLeftToMint;
        }

        piToken.communityMint(address(this), piTokenReward);

        pool.accPiTokenPerShare += (piTokenReward * SHARE_PRECISION) / sharesTotal;
        pool.lastRewardBlock = _blockNumber();
    }

    // Direct native deposit
    function depositNative(uint _pid, address _referrer) external payable nonReentrant {
        uint _amount = msg.value;
        require(_amount > 0, "Insufficient deposit");
        require(address(poolInfo[_pid].want) == address(WNative), "Only Native token pool");

        // Update pool rewards
        updatePool(_pid);

        // Record referral if it's needed
        _recordReferral(_pid, _referrer);

        // Pay rewards
        _calcPendingAndPayRewards(_pid, msg.sender);

        // With that Archimedes already has the wNative
        WNative.deposit{value: _amount}();

        // Deposit in the controller
        _depositInStrategy(_pid, _amount);
    }

    // Deposit want token to Archimedes for PI allocation.
    function deposit(uint _pid, uint _amount, address _referrer) public nonReentrant {
        require(_amount > 0, "Insufficient deposit");

        // Update pool rewards
        updatePool(_pid);

        // Record referral if it's needed
        _recordReferral(_pid, _referrer);

        // Pay rewards
        _calcPendingAndPayRewards(_pid, msg.sender);

        // Transfer from user => Archimedes
        poolInfo[_pid].want.safeTransferFrom(msg.sender, address(this), _amount);

        // Deposit in the controller
        _depositInStrategy(_pid, _amount);
    }

    function depositAll(uint _pid, address _referrer) external {
        require(address(poolInfo[_pid].want) != address(WNative), "Can't deposit all Native");
        uint _balance = poolInfo[_pid].want.balanceOf(msg.sender);

        deposit(_pid, _balance, _referrer);
    }

    // Withdraw want token from Archimedes.
    function withdraw(uint _pid, uint _shares) public nonReentrant {
        require(_shares > 0, "0 shares");
        require(_userShares(_pid) >= _shares, "withdraw: not sufficient founds");

        updatePool(_pid);

        // Pay rewards
        _calcPendingAndPayRewards(_pid, msg.sender);

        PoolInfo storage pool = poolInfo[_pid];

        uint _before = _wantBalance(pool.want);
        // this should burn shares and control the amount
        uint withdrawn = _controller(_pid).withdraw(msg.sender, _shares);
        require(withdrawn > 0, "No funds withdrawn");

        uint __wantBalance = _wantBalance(pool.want) - _before;

        // In case we have WNative we unwrap to Native
        if (address(pool.want) == address(WNative)) {
            // Unwrap WNative => Native
            WNative.withdraw(__wantBalance);

            payable(msg.sender).transfer(__wantBalance);
        } else {
            pool.want.safeTransfer(address(msg.sender), __wantBalance);
        }

        // This is to "save" like the new amount of shares was paid
        _updateUserPaidRewards(_pid, msg.sender);

        emit Withdraw(_pid, msg.sender, _shares);
    }

    function withdrawAll(uint _pid) external {
        withdraw(_pid, _userShares(_pid));
    }

    // Claim rewards for a pool
    function harvest(uint _pid) public nonReentrant {
        _harvest(_pid, msg.sender);
    }

    function _harvest(uint _pid, address _user) internal {
        if (_userShares(_pid, _user) <= 0) { return; }

        updatePool(_pid);

        _calcPendingAndPayRewards(_pid, _user);

        _updateUserPaidRewards(_pid, _user);
    }

    function harvestAll() external {
        uint length = poolInfo.length;
        for (uint pid = 0; pid < length; ++pid) {
            harvest(pid);
            if (_outOfGasForLoop()) { break; }
        }
    }

    // Withdraw without caring about rewards. EMERGENCY ONLY.
    function emergencyWithdraw(uint _pid) external nonReentrant {
        IERC20 want = poolInfo[_pid].want;

        userPaidRewards[_pid][msg.sender] = 0;

        uint _shares = _userShares(_pid);

        require(_shares > 0, "No shares to withdraw");

        uint _before = _wantBalance(want);
        // this should burn shares and control the amount
        _controller(_pid).withdraw(msg.sender, _shares);

        uint __wantBalance = _wantBalance(want) - _before;
        want.safeTransfer(address(msg.sender), __wantBalance);

        emit EmergencyWithdraw(_pid, msg.sender, _shares);
    }

    // Controller callback before transfer to harvest users rewards
    function beforeSharesTransfer(uint _pid, address _from, address _to, uint amount) external onlyController(_pid) {
        if (amount <= 0) { return; }

        // harvest rewards for
        _harvest(_pid, _from);

        // Harvest the shares receiver just in case
        _harvest(_pid, _to);
    }

    // Controller callback after transfer to update users rewards
    function afterSharesTransfer(uint _pid, address _from, address _to, uint amount) external onlyController(_pid) {
        if (amount <= 0) { return; }

        // Reset users "paidRewards"
        _updateUserPaidRewards(_pid, _from);
        _updateUserPaidRewards(_pid, _to);
    }

    function _updateUserPaidRewards(uint _pid, address _user) internal {
        userPaidRewards[_pid][_user] = (_userShares(_pid, _user) * poolInfo[_pid].accPiTokenPerShare) / SHARE_PRECISION;
    }

    function _wantBalance(IERC20 _want) internal view returns (uint) {
        return _want.balanceOf(address(this));
    }

    // Record referral in referralMgr contract if needed
    function _recordReferral(uint _pid, address _referrer) internal {
        // only if it's the first deposit
        if (_userShares(_pid) <= 0 && _referrer != address(0) &&
            _referrer != msg.sender && address(referralMgr) != address(0)) {

            referralMgr.recordReferral(msg.sender, _referrer);
        }
    }

    function _depositInStrategy(uint _pid, uint _amount) internal {
        PoolInfo storage pool = poolInfo[_pid];

        // Archimedes => controller transfer & deposit
        pool.want.safeIncreaseAllowance(pool.controller, _amount);
        _controller(_pid).deposit(msg.sender, _amount);

        // This is to "save" like the new amount of shares was paid
        _updateUserPaidRewards(_pid, msg.sender);

        emit Deposit(_pid, msg.sender, _amount);
    }

    // Pay rewards
    function _calcPendingAndPayRewards(uint _pid, address _user) internal returns (uint pending) {
        uint _shares = _userShares(_pid, _user);

        if (_shares > 0) {
            pending = ((_shares * poolInfo[_pid].accPiTokenPerShare) / SHARE_PRECISION) - paidRewards(_pid, _user);

            if (pending > 0) {
                _safePiTokenTransfer(_user, pending);
                _payReferralCommission(_user, pending);

                emit Harvested(_pid, _user, pending);
            }
        }
    }

    // Safe piToken transfer function, just in case if rounding error causes pool to not have enough PI.
    function _safePiTokenTransfer(address _to, uint _amount) internal {
        uint piTokenBal = piToken.balanceOf(address(this));

        if (_amount > piTokenBal) {
            _amount = piTokenBal;
        }

        // piToken.transfer is safe
        piToken.transfer(_to, _amount);
    }

    // Update the referral contract address by the owner
    function setReferralAddress(IReferral _newReferral) external onlyAdmin {
        referralMgr = _newReferral;
    }

    // Update referral commission rate by the owner
    function setReferralCommissionRate(uint16 _referralCommissionRate) external onlyAdmin {
        require(_referralCommissionRate <= MAXIMUM_REFERRAL_COMMISSION_RATE, "rate greater than MaxCommission");
        referralCommissionRate = _referralCommissionRate;
    }

    // Pay referral commission to the referrer who referred this user.
    function _payReferralCommission(address _user, uint _pending) internal {
        if (address(referralMgr) != address(0) && referralCommissionRate > 0) {
            address referrer = referralMgr.getReferrer(_user);

            uint commissionAmount = (_pending * referralCommissionRate) / COMMISSION_RATE_PRECISION;
            if (referrer != address(0) && commissionAmount > 0) {
                uint communityLeftToMint = piToken.communityLeftToMint();

                if (communityLeftToMint < commissionAmount) {
                    commissionAmount = communityLeftToMint;
                }

                if (commissionAmount > 0) {
                    piToken.communityMint(referrer, commissionAmount);
                    referralMgr.referralPaid(referrer, commissionAmount); // sum paid
                }
            }
        }
    }

    // View functions
    function poolLength() external view returns (uint) {
        return poolInfo.length;
    }

    function _userShares(uint _pid) public view returns (uint) {
        return _controller(_pid).balanceOf(msg.sender);
    }
    function _userShares(uint _pid, address _user) public view returns (uint) {
        return _controller(_pid).balanceOf(_user);
    }

    function paidRewards(uint _pid) public view returns (uint) {
        return userPaidRewards[_pid][msg.sender];
    }
    function paidRewards(uint _pid, address _user) public view returns (uint) {
        return userPaidRewards[_pid][_user];
    }
    function _controller(uint _pid) internal view returns (IController) {
        return IController(poolInfo[_pid].controller);
    }

    function getPricePerFullShare(uint _pid) external view returns (uint) {
        uint _totalSupply = _controller(_pid).totalSupply();
        uint precision = 10 ** decimals(_pid);

        return _totalSupply <= 0 ? precision : ((_controller(_pid).balance() * precision) / _totalSupply);
    }
    function decimals(uint _pid) public view returns (uint) {
        return _controller(_pid).decimals();
    }
    function balance(uint _pid) external view returns (uint) {
        return _controller(_pid).balance();
    }
    function balanceOf(uint _pid, address _user) external view returns (uint) {
        return _controller(_pid).balanceOf(_user);
    }

    function piTokenPerBlock() public view returns (uint) {
        // Skip 0~5% of minting per block for Referrals
        uint reserve = COMMISSION_RATE_PRECISION - referralCommissionRate;
        return piToken.communityMintPerBlock() * reserve / COMMISSION_RATE_PRECISION;
    }

    // Only to be mocked
    function _blockNumber() internal view virtual returns (uint) {
        return block.number;
    }

    // In case of stucketd 2Pi tokens after 2.5 years
    // check if any holder has pending tokens then call this fn
    // E.g. in case of a few EmergencyWithdraw the rewards will be stucked
    function redeemStuckedPiTokens() external onlyAdmin {
        require(piToken.totalSupply() == piToken.MAX_SUPPLY(), "PiToken still minting");
        // 2.5 years (2.5 * 365 * 24 * 3600) / 2.4s per block == 32850000
        require(_blockNumber() > (startBlock + 32850000), "Still waiting");

        uint _balance = piToken.balanceOf(address(this));

        if (_balance > 0) { piToken.transfer(msg.sender, _balance); }
    }
}
