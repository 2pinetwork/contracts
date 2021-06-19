// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
// import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "./PiToken.sol";

interface IReferral {
    function recordReferral(address user, address referrer) external;
    function getReferrer(address user) external view returns (address);
}

// Arquimedes is the master of PiToken. He can make PiToken and he is a fair guy.
//
// Note that it's ownable and the owner wields tremendous power. The ownership
// will be transferred to a governance smart contract once PiToken is sufficiently
// distributed and the community can show to govern itself.
//
// Have fun reading it. Hopefully it's bug-free. God bless.
contract Arquimedes is Ownable, ReentrancyGuard {
    using Address for address;
    // using SafeMath for uint;
    using SafeERC20 for IERC20;

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
    }

    PiToken public piToken;

    // Used to made multiplications and divitions over shares
    uint public constant SHARE_PRECISION = 1e18;

    // PI tokens created per block for community, 7M minted in ~2 years
    uint public piTokenPerBlock = 0.233067e18;
    uint public communityLeftToMint = 7000000e18;

    // PI tokens created per block for treasury, advisors, etc, 1M minted in ~2 years
    uint public treasuryTokensPerCommunity = 7;
    uint public treasuryLeftToMint = 1000000e18;

    // Info of each pool.
    PoolInfo[] public poolInfo;
    // Pool existence mapping to prevent duplication
    mapping(IERC20 => uint) public poolExistence;
    // Info of each user that stakes tokens.
    mapping(uint => mapping(address => UserInfo)) public userInfo;
    // Total weighing. Must be the sum of all pools weighing.
    uint public totalWeighing;
    // The block number when PI mining starts.
    uint public startBlock;

    // BATUDDO ALL YOURS
    // PiToken referral contract address.
    IReferral public referral;
    // Referral commission rate in basis points.
    uint16 public referralCommissionRate = 200;
    // Max referral commission rate: 5%.
    uint16 public constant MAXIMUM_REFERRAL_COMMISSION_RATE = 500;

    event Deposit(address indexed user, uint indexed pid, uint amount);
    event Withdraw(address indexed user, uint indexed pid, uint amount);
    event EmergencyWithdraw(address indexed user, uint indexed pid, uint amount);
    event SetReferralAddress(address indexed user, IReferral indexed newAddress);
    // BATUDO
    event ReferralCommissionPaid(address indexed user, address indexed referrer, uint commissionAmount);

    constructor(
        PiToken _piToken,
        uint _startBlock,
        address _treasury
    ) {
        require(address(_piToken) != address(0), "Pi address can't be zero address");
        require(_startBlock > block.number, "StartBlock should be in the future");
        require(_treasury != address(0), "Treasury address can't be zero address");

        piToken = _piToken;
        startBlock = _startBlock;
        treasuryAddress = _treasury;
    }

    // Add a new want token to the pool. Can only be called by the owner.
    function add(IERC20 _want, uint _weighing) external onlyOwner nonDuplicated(_want) {
        require(address(_want) != address(0), "Address zero not allowed");
        require(poolExistence[_want] <= 0, "nonDuplicated: duplicated");

        uint lastRewardBlock = block.number > startBlock ? block.number : startBlock;

        totalWeighing += _weighing;

        poolExistence[_want] = 1;

        // CHECK this shouldn't be first initialized as storage?
        poolInfo.push(PoolInfo({
            want: _want,
            weighing: _weighing,
            lastRewardBlock: lastRewardBlock,
            accPiTokenPerShare: 0
        }));
    }

    // Update the given pool's PI allocation point and deposit fee. Can only be called by the owner.
    function set(uint _pid, uint _weighing) external onlyOwner {
        totalWeighing = (totalWeighing - poolInfo[_pid].weighing) + _weighing;
        poolInfo[_pid].weighing = _weighing;
    }

    // Return reward multiplier over the given _from to _to block.
    function getMultiplier(uint _from, uint _to) public pure returns (uint) {
        return _to - _from;
    }

    // View function to see pending PIes on frontend.
    function pendingPiToken(uint _pid, address _user) external view returns (uint) {
        if (communityLeftToMint <= 0) {
            return 0;
        }

        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_user];

        uint accPiTokenPerShare = pool.accPiTokenPerShare;
        uint sharesTotal = IStrategy(pool.strat).sharesTotal();

        if (block.number > pool.lastRewardBlock && sharesTotal > 0) {
            uint multiplier = getMultiplier(pool.lastRewardBlock, block.number);
            uint piTokenReward = (multiplier * piTokenPerBlock * pool.weighing) / totalWeighing;
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

        if (block.number <= pool.lastRewardBlock) { return; }

        uint sharesTotal = IStrategy(pool.strat).sharesTotal();

        if (sharesTotal <= 0 || pool.weighing <= 0) {
            pool.lastRewardBlock = block.number;
            return;
        }
        if (treasuryLeftToMint <= 0 && communityLeftToMint <= 0) { return; }

        uint multiplier = getMultiplier(pool.lastRewardBlock, block.number);
        uint piTokenReward = (multiplier * piTokenPerBlock * pool.weighing) / totalWeighing;

        // No rewards =( update lastRewardBlock
        if (piTokenReward <= 0) {
            pool.lastRewardBlock = block.number;
            return;
        }

        // Tokens bounded for treasury
        if (treasuryLeftToMint > 0) {
            // 7 treasury tokens per 1 reward token
            uint treasuryAmount = piTokenReward / treasuryTokensPerCommunity;

            // If the amount is greater than the left to mint
            if (treasuryAmount > treasuryLeftToMint) {
                treasuryAmount = treasuryLeftToMint;
            }

            if (treasuryAmount > 0) {
                treasuryLeftToMint -= treasuryAmount;
                piToken.mint(treasuryAddress, treasuryAmount);
            }
        }

        // Community rewards for the pool
        if (communityLeftToMint > 0) {
            // If the reward is greater than the left to mint
            if (piTokenReward > communityLeftToMint) {
                piTokenReward = communityLeftToMint;
            }

            communityLeftToMint -= piTokenReward;
            piToken.mint(address(this), piTokenReward);

            pool.accPiTokenPerShare += (piTokenReward * SHARE_PRECISION) / sharesTotal;
        }

        // in case that treasury was minted but not the community (weird)
        pool.lastRewardBlock = block.number;
    }

    // Deposit want token to Arquimedes for PI allocation.
    function deposit(uint _pid, uint _amount, address _referrer) public nonReentrant {
        require(_amount > 0, "Insufficient deposit");

        updatePool(_pid);

        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];

        // BATUDO
        if (address(referral) != address(0) && _referrer != address(0) && _referrer != msg.sender) {
            referral.recordReferral(msg.sender, _referrer);
        }

        if (user.shares > 0) {
            uint pending = ((user.shares * pool.accPiTokenPerShare) / SHARE_PRECISION) - user.paidReward;
            if (pending > 0) {
                safePiTokenTransfer(msg.sender, pending);
                // BATUDO
                // payReferralCommission(msg.sender, pending);
            }
        }

        // uint _before = balance(pool);
        pool.want.safeTransferFrom(msg.sender, address(this), _amount);
        pool.want.safeTransferFrom(address(this), pool.strategy, _amount);

        // Esto no pasa asi derecho hay que arreglarlo
        uint shares = IStrategy(pool.strategy).deposit(msg.sender, _amount);

        // This could be changed by Strategy(pool.strategy).balanceOf(msg.sender)
        user.shares += shares
        // This is to "save" like the new amount of shares was paid
        user.paidReward = (user.shares * pool.accPiTokenPerShare) / SHARE_PRECISION);

        emit Deposit(msg.sender, _pid, _amount);
    }

    // Withdraw want token from Arquimedes.
    function withdraw(uint _pid, uint _shares) public nonReentrant {
        UserInfo storage user = userInfo[_pid][msg.sender];
        require(user.shares >= _shares, "withdraw: not sufficient founds");

        updatePool(_pid);

        PoolInfo storage pool = poolInfo[_pid];

        uint pending = ((user.shares * pool.accPiTokenPerShare) / SHARE_PRECISION) - user.paidReward;

        if (pending > 0) {
            safePiTokenTransfer(msg.sender, pending);
            // BATUDO
            // payReferralCommission(msg.sender, pending);
        }

        // WIthdraw with _shares in 0 is for harvest ??????
        if (_shares > 0) {
            // Esto no pasa asi derecho hay que arreglarlo
            user.shares -= _shares;

            uint _before = pool.want.balanceOf();
            // this should burn shares and control the amount
            IStrategy(pool.strategy).withdraw(msg.sender, _shares);

            // Como que para esto no deberia haber NADA
            uint wantBalance = pool.want.balanceOf() - _before;
            pool.want.safeTransfer(address(msg.sender), wantBalance);
        }

        // This is to "save" like the new amount of shares was paid
        user.paidReward = (user.shares * pool.accPiTokenPerShare) / SHARE_PRECISION);

        emit Withdraw(msg.sender, _pid, _shares);
    }

    //
    function withdrawAll(uint _pid) external nonReentrant {
        without(_pid, userInfo[_pid][msg.sender].shares);
    }

    // Claim rewards for a pool
    function harvest(uint _pid) public nonReentrant {
        if (userInfo[_pid][msg.sender].shares <= 0) {
            return;
        }

        updatePool(_pid);

        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];

        if (user.shares > 0) {
            uint pending = ((user.shares * pool.accPiTokenPerShare) / SHARE_PRECISION) - user.paidReward;
            if (pending > 0) {
                safePiTokenTransfer(msg.sender, pending);
                // BATUDO
                // payReferralCommission(msg.sender, pending);
                user.paidReward += pending;
            }
        }
    }

    function harvestAll(uint _pid) external nonReentrant {
        uint length = poolInfo.length;
        for (uint pid = 0; pid < length; ++pid) {
            harvest(pid);
        }
    }

    // Withdraw without caring about rewards. EMERGENCY ONLY.
    function emergencyWithdraw(uint _pid) external nonReentrant {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];

        uint shares = user.shares;

        user.shares = 0;
        user.paidReward = 0;

        // HACER EL CALCULO DEL WITHDRAW
        uint _before = pool.want.balanceOf();
        // this should burn shares and control the amount
        IStrategy(pool.strategy).withdraw(msg.sender, _shares);

        // Como que para esto no deberia haber NADA
        uint wantBalance = pool.want.balanceOf() - _before;
        pool.want.safeTransfer(address(msg.sender), wantBalance);

        emit EmergencyWithdraw(msg.sender, _pid, amount);
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

    // BATUDO
    // Update the referral contract address by the owner
    function setReferralAddress(IReferral _referral) external onlyOwner {
        referral = _referral;
        emit SetReferralAddress(msg.sender, _referral);
    }

    // Update referral commission rate by the owner
    function setReferralCommissionRate(uint16 _referralCommissionRate) external onlyOwner {
        require(_referralCommissionRate <= MAXIMUM_REFERRAL_COMMISSION_RATE, "setReferralCommissionRate: invalid referral commission rate basis points");
        referralCommissionRate = _referralCommissionRate;
    }

    // Pay referral commission to the referrer who referred this user.
    function payReferralCommission(address _user, uint _pending) internal {
        if (address(referral) != address(0) && referralCommissionRate > 0) {
            address referrer = referral.getReferrer(_user);
            uint commissionAmount = _pending.mul(referralCommissionRate).div(10000);

            if (referrer != address(0) && commissionAmount > 0) {
                piToken.mint(referrer, commissionAmount);
                emit ReferralCommissionPaid(_user, referrer, commissionAmount);
            }
        }
    }

    // View functions
    function poolLength() external view returns (uint) {
        return poolInfo.length;
    }
}
