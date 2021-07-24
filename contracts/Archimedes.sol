// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
// import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "../interfaces/IPiToken.sol";

interface IReferral {
    function recordReferral(address user, address referrer) external;
    function referralPaid(address user, uint amount) external;
    function getReferrer(address user) external view returns (address);
}

interface IWMATIC is IERC20 {
    function deposit() external payable;
    function withdraw(uint wad) external;
}

// Archimedes is the master of PiToken. He can make PiToken and he is a fair guy.
//
// Note that it's ownable and the owner wields tremendous power. The ownership
// will be transferred to a governance smart contract once PiToken is sufficiently
// distributed and the community can show to govern itself.
// Have fun reading it. Hopefully it's bug-free. God bless.

interface IStrategy {
    function totalSupply() external view returns (uint);
    function balanceOf() external view returns (uint);
    function decimals() external view returns (uint);
    function farm() external view returns (address);
    function deposit(address _depositor, uint _amount) external returns (uint);
    function withdraw(address _depositor, uint _shares) external;
}

contract Archimedes is Ownable, ReentrancyGuard {
    // using Address for address;
    using SafeERC20 for IERC20;

    // Used for MATIC (native token) deposits/withdraws
    IWMATIC public constant wmatic = IWMATIC(0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889); // Mumbai
    // IWMATIC public constant wmatic = IWMATIC(0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270); // Polygon

    // Info of each user.
    struct UserInfo {
        uint shares;         // How many tokens the user has provided. // could be checked against the strategy
        uint paidReward;     // Reward debt. See explanation below.
        //
        // We do some fancy math here. Basically, any point in time, the amount of PIes
        // entitled to a user but is pending to be distributed is:
        //
        //   pending reward = (user.shares * pool.accPiTokenPerShare) - user.paidReward
        //
        // Whenever a user deposits or withdraws tokens to a pool. Here's what happens:
        //   1. The pool's `accPiTokenPerShare` (and `lastRewardBlock`) gets updated.
        //   2. User receives the pending reward sent to his/her address.
        //   3. User's `shares` gets updated.
        //   4. User's `paidReward` gets updated.
    }

    // Info of each pool.
    struct PoolInfo {
        IERC20 want;             // Address of token contract.
        uint weighing;           // How much weighing assigned to this pool. PIes to distribute per block.
        uint lastRewardBlock;    // Last block number that PIes distribution occurs.
        uint accPiTokenPerShare; // Accumulated PIes per share, times SHARE_PRECISION. See below.
        address strategy;        // Token strategy
    }

    IPiToken public piToken;
    bytes txData = new bytes(0); // just to support SuperToken mint

    // Used to made multiplications and divitions over shares
    uint public constant SHARE_PRECISION = 1e18;

    // PI tokens created per block for community, 31.4M minted in 2 years
    uint public communityLeftToMint = 3.14e25; // :sunglasses:

    // Info of each pool.
    PoolInfo[] public poolInfo;
    // Pool existence mapping to prevent duplication
    // mapping(IERC20 => uint) public poolExistence; // anti duplication?
    // Info of each user that stakes tokens.
    mapping(uint => mapping(address => UserInfo)) public userInfo;
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

    event Deposit(address indexed user, uint indexed pid, uint amount);
    event Withdraw(address indexed user, uint indexed pid, uint amount);
    event EmergencyWithdraw(address indexed user, uint indexed pid, uint amount);
    event SetReferralAddress(address indexed user, IReferral indexed newAddress);
    event ReferralCommissionPaid(address indexed user, address indexed referrer, uint commissionAmount);

    constructor(
        IPiToken _piToken,
        uint _startBlock,
        address _treasury
    ) {
        require(address(_piToken) != address(0), "Pi address can't be zero address");
        require(_startBlock > block.number, "StartBlock should be in the future");
        require(_treasury != address(0), "Treasury address can't be zero address");

        piToken = _piToken;
        startBlock = _startBlock;
    }

    receive() external payable { }

    // Add a new want token to the pool. Can only be called by the owner.
    function addNewPool(IERC20 _want, address _strat, uint _weighing) external onlyOwner {
        require(address(_want) != address(0), "Address zero not allowed");
        // require(poolExistence[_want] <= 0, "nonDuplicated: duplicated"); // anti duplication?
        require(IStrategy(_strat).farm() == address(this), "Not a farm strategy");

        uint lastRewardBlock = block.number > startBlock ? block.number : startBlock;

        totalWeighing += _weighing;

        // poolExistence[_want] = 1; // Anti duplication?

        poolInfo.push(PoolInfo({
            want: _want,
            weighing: _weighing,
            lastRewardBlock: lastRewardBlock,
            accPiTokenPerShare: 0,
            strategy: _strat
        }));
    }

    // Update the given pool's PI allocation point and deposit fee. Can only be called by the owner.
    function changePoolWeighing(uint _pid, uint _weighing) external onlyOwner {
        updatePool(_pid);

        totalWeighing = (totalWeighing - poolInfo[_pid].weighing) + _weighing;
        poolInfo[_pid].weighing = _weighing;
    }

    // Return reward multiplier over the given _from to _to block.
    function getMultiplier(uint _from, uint _to) public pure returns (uint) {
        return _to - _from;
    }

    // View function to see pending PIes on frontend.
    function pendingPiToken(uint _pid, address _user) external view returns (uint) {
        if (communityLeftToMint <= 0) { return 0; }

        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_user];

        uint accPiTokenPerShare = pool.accPiTokenPerShare;
        uint sharesTotal = IStrategy(pool.strategy).totalSupply();

        if (block.number > pool.lastRewardBlock && sharesTotal > 0) {
            uint multiplier = getMultiplier(pool.lastRewardBlock, block.number);
            uint piTokenReward = (multiplier * piTokenPerBlock() * pool.weighing) / totalWeighing;
            accPiTokenPerShare += (piTokenReward * SHARE_PRECISION) / sharesTotal;
        }
        return ((user.shares * accPiTokenPerShare) / SHARE_PRECISION) - user.paidReward;
    }

    // Update reward variables for all pools. Be careful of gas spending!
    function massUpdatePools() external {
        uint length = poolInfo.length;
        for (uint pid = 0; pid < length; ++pid) {
            updatePool(pid);
        }
    }

    // Mint community & treasury tokens for a given pool pid
    function updatePool(uint _pid) public {
        PoolInfo storage pool = poolInfo[_pid];

        // If same block as last update return
        if (block.number <= pool.lastRewardBlock) { return; }
        // If community Mint is already finished
        if (communityLeftToMint <= 0) { return; }

        uint sharesTotal = IStrategy(pool.strategy).totalSupply();

        if (sharesTotal <= 0 || pool.weighing <= 0) {
            pool.lastRewardBlock = block.number;
            return;
        }

        uint multiplier = getMultiplier(pool.lastRewardBlock, block.number);
        uint piTokenReward = (multiplier * piTokenPerBlock() * pool.weighing) / totalWeighing;

        // No rewards =( update lastRewardBlock
        if (piTokenReward <= 0) {
            pool.lastRewardBlock = block.number;
            return;
        }

        // If the reward is greater than the left to mint
        if (piTokenReward > communityLeftToMint) {
            piTokenReward = communityLeftToMint;
        }

        communityLeftToMint -= piTokenReward;
        piToken.mint(address(this), piTokenReward, txData);

        pool.accPiTokenPerShare += (piTokenReward * SHARE_PRECISION) / sharesTotal;
        pool.lastRewardBlock = block.number;
    }

    // Direct MATIC (native) deposit
    function depositMATIC(uint _pid, address _referrer) external payable nonReentrant {
        uint _amount = msg.value;
        require(_amount > 0, "Insufficient deposit");
        require(address(poolInfo[_pid].want) == address(wmatic), "Only MATIC pool");

        // Update pool rewards
        updatePool(_pid);

        // Record referral if it's needed
        _recordReferral(_pid, _referrer);

        // Pay rewards
        calcPendingAndPayRewards(_pid);

        // With that Archimedes already has the wmatics
        wmatic.deposit{value: _amount}();

        // Deposit in the strategy
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
        calcPendingAndPayRewards(_pid);

        // Transfer from user => Archimedes
        poolInfo[_pid].want.safeTransferFrom(msg.sender, address(this), _amount);

        // Deposit in the strategy
        _depositInStrategy(_pid, _amount);
    }

    // Withdraw want token from Archimedes.
    function withdraw(uint _pid, uint _shares) public nonReentrant {
        require(_shares > 0, "0 shares");
        UserInfo storage user = userInfo[_pid][msg.sender];
        require(user.shares >= _shares, "withdraw: not sufficient founds");

        updatePool(_pid);

        // Pay rewards
        calcPendingAndPayRewards(_pid);

        PoolInfo storage pool = poolInfo[_pid];

        // Esto no pasa asi derecho hay que arreglarlo
        user.shares -= _shares;

        uint _before = wantBalance(pool);
        // this should burn shares and control the amount
        IStrategy(pool.strategy).withdraw(msg.sender, _shares);

        uint _wantBalance = wantBalance(pool) - _before;

        // In case we have wmatic we unwrap to matic
        if (address(pool.want) == address(wmatic)) {
            // Unwrap WMATIC => MATIC
            wmatic.withdraw(_wantBalance);

            payable(msg.sender).transfer(_wantBalance);
        } else {
            pool.want.safeTransfer(address(msg.sender), _wantBalance);
        }

        // This is to "save" like the new amount of shares was paid
        user.paidReward = (user.shares * pool.accPiTokenPerShare) / SHARE_PRECISION;

        emit Withdraw(msg.sender, _pid, _shares);
    }

    function withdrawAll(uint _pid) external {
        withdraw(_pid, userInfo[_pid][msg.sender].shares);
    }

    // Claim rewards for a pool
    function harvest(uint _pid) public nonReentrant {
        if (userInfo[_pid][msg.sender].shares <= 0) {
            return;
        }

        updatePool(_pid);

        uint pending = calcPendingAndPayRewards(_pid);

        if (pending > 0) {
            userInfo[_pid][msg.sender].paidReward += pending;
        }
    }

    function harvestAll() external {
        uint length = poolInfo.length;
        for (uint pid = 0; pid < length; ++pid) {
            harvest(pid);
        }
    }

    // Withdraw without caring about rewards. EMERGENCY ONLY.
    function emergencyWithdraw(uint _pid) external nonReentrant {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];

        uint _shares = user.shares;

        user.shares = 0;
        user.paidReward = 0;

        uint _before = wantBalance(pool);
        // this should burn shares and control the amount
        IStrategy(pool.strategy).withdraw(msg.sender, _shares);

        uint _wantBalance = wantBalance(pool) - _before;
        pool.want.safeTransfer(address(msg.sender), _wantBalance);

        emit EmergencyWithdraw(msg.sender, _pid, _shares);
    }

    function wantBalance(PoolInfo memory _pool) internal view returns (uint) {
        return _pool.want.balanceOf(address(this));
    }

    // Record referral in referralMgr contract if needed
    function _recordReferral(uint _pid, address _referrer) internal {
        if (
            userInfo[_pid][msg.sender].shares <= 0 && // only if it's the first deposit
                _referrer != address(0) &&
                    _referrer != msg.sender &&
                        address(referralMgr) != address(0)) {

            referralMgr.recordReferral(msg.sender, _referrer);
        }
    }

    function _depositInStrategy(uint _pid, uint _amount) internal {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];

        // Archimedes => strategy transfer & deposit
        pool.want.safeIncreaseAllowance(pool.strategy, _amount);
        uint shares = IStrategy(pool.strategy).deposit(msg.sender, _amount);

        // This could be changed by Strategy(pool.strategy).balanceOf(msg.sender)
        user.shares += shares;
        // This is to "save" like the new amount of shares was paid
        user.paidReward = (user.shares * pool.accPiTokenPerShare) / SHARE_PRECISION;

        emit Deposit(msg.sender, _pid, _amount);
    }

    // Pay rewards
    function calcPendingAndPayRewards(uint _pid) internal returns (uint pending) {
        UserInfo storage user = userInfo[_pid][msg.sender];

        if (user.shares > 0) {
            pending = ((user.shares * poolInfo[_pid].accPiTokenPerShare) / SHARE_PRECISION) - user.paidReward;

            if (pending > 0) {
                safePiTokenTransfer(msg.sender, pending);
                payReferralCommission(pending);
            }
        }
    }

    // Safe piToken transfer function, just in case if rounding error causes pool to not have enough PI.
    function safePiTokenTransfer(address _to, uint _amount) internal {
        uint piTokenBal = piToken.balanceOf(address(this));
        bool transferSuccess = false;
        if (_amount > piTokenBal) {
            transferSuccess = piToken.transfer(_to, piTokenBal);
        } else {
            transferSuccess = piToken.transfer(_to, _amount);
        }
        require(transferSuccess, "safePiTokenTransfer: Transfer failed");
    }

    // Update the referral contract address by the owner
    function setReferralAddress(IReferral _newReferral) external onlyOwner {
        referralMgr = _newReferral;
        emit SetReferralAddress(msg.sender, referralMgr);
    }

    // Update referral commission rate by the owner
    function setReferralCommissionRate(uint16 _referralCommissionRate) external onlyOwner {
        require(_referralCommissionRate <= MAXIMUM_REFERRAL_COMMISSION_RATE, "setReferralCommissionRate: invalid referral commission rate basis points");
        referralCommissionRate = _referralCommissionRate;
    }

    // Pay referral commission to the referrer who referred this user.
    function payReferralCommission(uint _pending) internal {
        if (address(referralMgr) != address(0) && referralCommissionRate > 0) {
            address referrer = referralMgr.getReferrer(msg.sender);

            uint commissionAmount = (_pending * referralCommissionRate) / COMMISSION_RATE_PRECISION;
            if (referrer != address(0) && commissionAmount > 0) {
                piToken.mint(referrer, commissionAmount, txData);
                referralMgr.referralPaid(referrer, commissionAmount); // sum paid
                emit ReferralCommissionPaid(msg.sender, referrer, commissionAmount);
            }
        }
    }

    // View functions
    function poolLength() external view returns (uint) {
        return poolInfo.length;
    }

    // old vault functions
    function getPricePerFullShare(uint _pid) public view returns (uint) {
        IStrategy strat = IStrategy(poolInfo[_pid].strategy);

        uint _totalSupply = strat.totalSupply();

        return _totalSupply == 0 ? 1e18 : ((strat.balanceOf() * 1e18) / _totalSupply);
    }
    function decimals(uint _pid) public view returns (uint) {
        return IStrategy(poolInfo[_pid].strategy).decimals();
    }
    function balance(uint _pid) public view returns (uint) {
        return IStrategy(poolInfo[_pid].strategy).balanceOf();
    }
    function balanceOf(uint _pid, address _user) public view returns (uint) {
        return userInfo[_pid][_user].shares;
    }

    // 777 not working yet
    // function tokensReceived(
    //     address /*operator*/,
    //     address from,
    //     address /*to*/,
    //     uint256 /*amount*/,
    //     bytes calldata /*userData*/,
    //     bytes calldata /*operatorData*/
    // ) external view {
    //     require(from == address(piToken), "Invalid token");
    // }

    function piTokenPerBlock() public view returns (uint) {
        // Skip 1% of minting per block for Referrals
        return piToken.communityMintPerBlock() * 99 / 100;
    }
}
