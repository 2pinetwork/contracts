// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "hardhat/console.sol";

import "../interfaces/IPiToken.sol";

interface IReferral {
    function recordReferral(address, address referrer) external;
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

interface IController {
    function strategy() external view returns (address);
    function totalSupply() external view returns (uint);
    function balance() external view returns (uint);
    function balanceOf(address _user) external view returns (uint);
    function decimals() external view returns (uint);
    function farm() external view returns (address);
    function deposit(address _depositor, uint _amount) external;
    function withdraw(address _depositor, uint _shares) external;
}

contract Archimedes is Ownable, ReentrancyGuard {
    // using Address for address;
    using SafeERC20 for IERC20;

    // Used for MATIC (native token) deposits/withdraws
    IWMATIC public constant wmatic = IWMATIC(0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f); // test
    // IWMATIC public constant wmatic = IWMATIC(0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889); // Mumbai
    // IWMATIC public constant wmatic = IWMATIC(0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270); // Polygon

    // Info of each pool.
    struct PoolInfo {
        IERC20 want;             // Address of token contract.
        uint weighing;           // How much weighing assigned to this pool. PIes to distribute per block.
        uint lastRewardBlock;    // Last block number that PIes distribution occurs.
        uint accPiTokenPerShare; // Accumulated PIes per share, times SHARE_PRECISION. See below.
        address controller;        // Token controller
    }

    // IPiToken already have safe transfer from SuperToken
    IPiToken public piToken;
    bytes private constant txData = new bytes(0); // just to support SuperToken mint

    // Used to made multiplications and divitions over shares
    uint public constant SHARE_PRECISION = 1e18;

    // PI tokens created per block for community, 31.4M minted in 2 years
    // This Archimedes has 2/3 of the total LM
    uint public communityLeftToMint = 2.09e25;

    // Info of each pool.
    PoolInfo[] public poolInfo;
    // Pool existence mapping to prevent duplication
    // mapping(IERC20 => uint) public poolExistence; // anti duplication?
    // Info of each user that stakes tokens.
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

    // Whitelist to deposit/withdraw
    mapping(address => bool) public whitelist;

    event Deposit(address indexed user, uint indexed pid, uint amount);
    event Withdraw(address indexed user, uint indexed pid, uint amount);
    event EmergencyWithdraw(address indexed user, uint indexed pid, uint amount);

    constructor(
        IPiToken _piToken,
        uint _startBlock
    ) {
        require(address(_piToken) != address(0), "Pi address can't be zero address");
        require(_startBlock > blockNumber(), "StartBlock should be in the future");

        piToken = _piToken;
        startBlock = _startBlock;
    }

    receive() external payable { }

    // Add a new want token to the pool. Can only be called by the owner.
    function addNewPool(IERC20 _want, address _ctroller, uint _weighing, bool _massUpdate) external onlyOwner {
        require(address(_want) != address(0), "Address zero not allowed");
        // require(poolExistence[_want] <= 0, "nonDuplicated: duplicated"); // anti duplication?
        require(IController(_ctroller).farm() == address(this), "Not a farm controller");
        require(IController(_ctroller).strategy() != address(0), "Controller without strategy");

        // Update pools before a weighing change
        if (_massUpdate) {
            massUpdatePools();
        }

        uint lastRewardBlock = blockNumber() > startBlock ? blockNumber() : startBlock;

        totalWeighing += _weighing;

        poolInfo.push(PoolInfo({
            want: _want,
            weighing: _weighing,
            lastRewardBlock: lastRewardBlock,
            accPiTokenPerShare: 0,
            controller: _ctroller
        }));
    }

    // Update the given pool's PI allocation point and deposit fee. Can only be called by the owner.
    function changePoolWeighing(uint _pid, uint _weighing, bool _massUpdate) external onlyOwner {
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
    function getMultiplier(uint _from, uint _to) public pure returns (uint) {
        return _to - _from;
    }

    // View function to see pending PIes on frontend.
    function pendingPiToken(uint _pid) external view returns (uint) {
        if (communityLeftToMint <= 0) { return 0; }

        PoolInfo storage pool = poolInfo[_pid];

        uint accPiTokenPerShare = pool.accPiTokenPerShare;
        uint sharesTotal = controller(_pid).totalSupply();

        if (blockNumber() > pool.lastRewardBlock && sharesTotal > 0) {
            uint multiplier = getMultiplier(pool.lastRewardBlock, blockNumber());
            uint piTokenReward = (multiplier * piTokenPerBlock() * pool.weighing) / totalWeighing;
            accPiTokenPerShare += (piTokenReward * SHARE_PRECISION) / sharesTotal;
        }
        return ((userShares(_pid) * accPiTokenPerShare) / SHARE_PRECISION) - paidRewards(_pid);
    }

    // Update reward variables for all pools. Be careful of gas spending!
    function massUpdatePools() public {
        for (uint pid = 0; pid < poolInfo.length; ++pid) {
            updatePool(pid);
        }
    }

    // Mint community tokens for a given pool pid
    function updatePool(uint _pid) public {
        PoolInfo storage pool = poolInfo[_pid];

        // If same block as last update return
        if (blockNumber() <= pool.lastRewardBlock) { return; }
        // If community Mint is already finished
        if (communityLeftToMint <= 0) { return; }

        uint sharesTotal = controller(_pid).totalSupply();

        if (sharesTotal <= 0 || pool.weighing <= 0) {
            pool.lastRewardBlock = blockNumber();
            return;
        }

        uint multiplier = getMultiplier(pool.lastRewardBlock, blockNumber());
        uint piTokenReward = (multiplier * piTokenPerBlock() * pool.weighing) / totalWeighing;

        // No rewards =( update lastRewardBlock
        if (piTokenReward <= 0) {
            pool.lastRewardBlock = blockNumber();
            return;
        }

        // If the reward is greater than the left to mint
        if (piTokenReward > communityLeftToMint) {
            piTokenReward = communityLeftToMint;
        }

        communityLeftToMint -= piTokenReward;
        piToken.mint(address(this), piTokenReward, txData);

        pool.accPiTokenPerShare += (piTokenReward * SHARE_PRECISION) / sharesTotal;
        pool.lastRewardBlock = blockNumber();
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
        calcPendingAndPayRewards(_pid);

        // Transfer from user => Archimedes
        poolInfo[_pid].want.safeTransferFrom(msg.sender, address(this), _amount);

        // Deposit in the controller
        _depositInStrategy(_pid, _amount);
    }

    function depositAll(uint _pid, address _referrer) external {
        require(address(poolInfo[_pid].want) != address(wmatic), "Can't deposit all Matic");
        uint _balance = poolInfo[_pid].want.balanceOf(msg.sender);

        deposit(_pid, _balance, _referrer);
    }

    // Withdraw want token from Archimedes.
    function withdraw(uint _pid, uint _shares) public nonReentrant {
        require(_shares > 0, "0 shares");
        require(userShares(_pid) >= _shares, "withdraw: not sufficient founds");

        updatePool(_pid);

        // Pay rewards
        calcPendingAndPayRewards(_pid);

        PoolInfo storage pool = poolInfo[_pid];

        uint _before = wantBalance(pool);
        // this should burn shares and control the amount
        controller(_pid).withdraw(msg.sender, _shares);

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
        userPaidRewards[_pid][msg.sender] = (userShares(_pid) * pool.accPiTokenPerShare) / SHARE_PRECISION;

        emit Withdraw(msg.sender, _pid, _shares);
    }

    function withdrawAll(uint _pid) external {
        withdraw(_pid, userShares(_pid));
    }

    // Claim rewards for a pool
    function harvest(uint _pid) public nonReentrant {
        if (userShares(_pid) <= 0) {
            return;
        }

        updatePool(_pid);

        uint pending = calcPendingAndPayRewards(_pid);

        if (pending > 0) {
            userPaidRewards[_pid][msg.sender] += pending;
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

        userPaidRewards[_pid][msg.sender] = 0;

        uint _shares = userShares(_pid);

        uint _before = wantBalance(pool);
        // this should burn shares and control the amount
        controller(_pid).withdraw(msg.sender, _shares);

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
            userShares(_pid) <= 0 && // only if it's the first deposit
                _referrer != address(0) &&
                    _referrer != msg.sender &&
                        address(referralMgr) != address(0)) {

            referralMgr.recordReferral(msg.sender, _referrer);
        }
    }

    function _depositInStrategy(uint _pid, uint _amount) internal {
        PoolInfo storage pool = poolInfo[_pid];

        // Archimedes => controller transfer & deposit
        pool.want.safeIncreaseAllowance(pool.controller, _amount);
        controller(_pid).deposit(msg.sender, _amount);

        // This is to "save" like the new amount of shares was paid
        userPaidRewards[_pid][msg.sender] = (userShares(_pid) * pool.accPiTokenPerShare) / SHARE_PRECISION;

        emit Deposit(msg.sender, _pid, _amount);
    }

    // Pay rewards
    function calcPendingAndPayRewards(uint _pid) internal returns (uint pending) {
        uint _shares = userShares(_pid);

        if (_shares > 0) {
            pending = ((_shares * poolInfo[_pid].accPiTokenPerShare) / SHARE_PRECISION) - paidRewards(_pid);

            if (pending > 0) {
                safePiTokenTransfer(msg.sender, pending);
                payReferralCommission(pending);
            }
        }
    }

    // Safe piToken transfer function, just in case if rounding error causes pool to not have enough PI.
    function safePiTokenTransfer(address _to, uint _amount) internal {
        uint piTokenBal = piToken.balanceOf(address(this));

        // piToken.transfer is safe
        if (_amount > piTokenBal) {
            piToken.transfer(_to, piTokenBal);
        } else {
            piToken.transfer(_to, _amount);
        }
    }

    // Update the referral contract address by the owner
    function setReferralAddress(IReferral _newReferral) external onlyOwner {
        referralMgr = _newReferral;
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
            }
        }
    }

    // View functions
    function poolLength() external view returns (uint) {
        return poolInfo.length;
    }

    function userShares(uint _pid) public view returns (uint) {
        return controller(_pid).balanceOf(msg.sender);
    }

    function paidRewards(uint _pid) public view returns (uint) {
        return userPaidRewards[_pid][msg.sender];
    }
    function controller(uint _pid) internal view returns (IController) {
        return IController(poolInfo[_pid].controller);
    }

    // old vault functions
    function getPricePerFullShare(uint _pid) external view returns (uint) {
        uint _totalSupply = controller(_pid).totalSupply();

        return _totalSupply <= 0 ? 1e18 : ((controller(_pid).balance() * 1e18) / _totalSupply);
    }
    function decimals(uint _pid) external view returns (uint) {
        return controller(_pid).decimals();
    }
    function balance(uint _pid) external view returns (uint) {
        return controller(_pid).balance();
    }
    function balanceOf(uint _pid, address _user) external view returns (uint) {
        return controller(_pid).balanceOf(_user);
    }

    function piTokenPerBlock() public view returns (uint) {
        // Skip 1% of minting per block for Referrals
        return piToken.communityMintPerBlock() * 99 / 100;
    }

    // Only to be mocked
    function blockNumber() internal view virtual returns (uint) {
        return block.number;
    }
}
