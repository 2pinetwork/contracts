// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "hardhat/console.sol";

import "./Swappable.sol";
import "../interfaces/IPiToken.sol";
import "../interfaces/IController.sol";
import "../interfaces/IReferral.sol";

// Swappable contract has the AccessControl module
contract ArchimedesAPI is Swappable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using SafeERC20 for IPiToken;

    address public handler; // 0x640bb21185093058549dFB000D566358dc40C584
    address public exchange;
    mapping(uint => address[]) public piTokenToWantRoute;

    // Info of each pool.
    struct PoolInfo {
        IERC20 want;             // Address of token contract.
        uint weighing;           // How much weighing assigned to this pool. PIes to distribute per block.
        uint lastRewardBlock;    // Last block number that PIes distribution occurs.
        uint accPiTokenPerShare; // Accumulated PIes per share, times SHARE_PRECISION. See below.
        address controller;      // Token controller
    }

    // IPiToken already have safe transfer from SuperToken
    IPiToken public immutable piToken;
    bytes private constant txData = new bytes(0); // just to support SuperToken mint

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
    uint public immutable startBlock;

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
    event NewExchange(address oldExchange, address newExchange);
    event NewHandler(address oldHandler, address newHandler);

    constructor(IPiToken _piToken, uint _startBlock, address _handler) {
        require(address(_piToken) != address(0), "Pi address !ZeroAddress");
        require(_startBlock > _blockNumber(), "StartBlock must be in the future");
        require(_handler != address(0), "Handler !ZeroAddress");

        piToken = _piToken;
        startBlock = _startBlock;
        handler = _handler;
    }

    modifier onlyHandler() {
        require(msg.sender == handler, "Only handler");
        _;
    }

    function setExchange(address _newExchange) external onlyAdmin {
        require(_newExchange != exchange, "Same address");
        require(_newExchange != address(0), "!ZeroAddress");
        emit NewExchange(exchange, _newExchange);
        exchange = _newExchange;
    }

    function setRoute(uint _pid, address[] memory _route) external onlyAdmin {
        // Last address in path should be the same than pool.want
        require(_route[0] == address(piToken), "First token is not PiToken");
        require(_route[_route.length - 1] == address(poolInfo[_pid].want), "Last token is not want");
        require(poolInfo[_pid].controller != address(0), "Unknown pool");

        piTokenToWantRoute[_pid] = _route;
    }

    function setHandler(address _newHandler) external onlyAdmin {
        require(_newHandler != handler, "Same address");
        require(_newHandler != address(0), "!ZeroAddress");
        emit NewHandler(handler, _newHandler);
        handler = _newHandler;
    }

    // Add a new want token to the pool. Can only be called by the admin.
    function addNewPool(IERC20 _want, address _ctroller, uint _weighing, bool _massUpdate) external onlyAdmin {
        require(address(_want) != address(0), "Address zero not allowed");
        require(IController(_ctroller).archimedes() == address(this), "Not an Archimedes controller");
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
        uint _setPid = IController(_ctroller).setPid(_pid);
        require(_pid == _setPid, "Pid doesn't match");

        emit NewPool(_pid, address(_want),  _weighing);
    }

    // Update the given pool's PI rewards weighing
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

    // Update reward variables for all pools. Be careful of gas spending!
    function massUpdatePools() public {
        for (uint pid = 0; pid < poolInfo.length; ++pid) {
            updatePool(pid);
            if (_outOfGasForLoop()) { break; }
        }
    }

    // Mint api tokens for a given pool pid
    function updatePool(uint _pid) public {
        PoolInfo storage pool = poolInfo[_pid];

        // If same block as last update return
        if (_blockNumber() <= pool.lastRewardBlock) { return; }
        // If community Mint is already finished
        uint apiLeftToMint = piToken.apiLeftToMint();
        if (apiLeftToMint <= 0) {
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
        if (piTokenReward > apiLeftToMint) {
            piTokenReward = apiLeftToMint;
        }

        piToken.apiMint(address(this), piTokenReward);

        pool.accPiTokenPerShare += (piTokenReward * SHARE_PRECISION) / sharesTotal;
        pool.lastRewardBlock = _blockNumber();
    }

    // Deposit want token to Archimedes for PI allocation.
    function deposit(uint _pid, address _user, uint _amount, address _referrer) external nonReentrant onlyHandler {
        require(_amount > 0, "Insufficient deposit");

        // Update pool rewards
        updatePool(_pid);

        // Record referral if it's needed
        _recordReferral(_pid, _user, _referrer);

        uint _before = _wantBalance(poolInfo[_pid].want);

        // Pay rewards
        _calcPendingAndSwapRewards(_pid, _user);

        // Transfer from user => Archimedes
        // This is the only line that should transfer from msg.sender to Archimedes
        // And in case of swap rewards will be included in the deposit
        poolInfo[_pid].want.safeTransferFrom(msg.sender, address(this), _amount);
        uint _balance = _wantBalance(poolInfo[_pid].want) - _before;

        // Deposit in the controller
        _depositInController(_pid, _user, _balance);
    }

    // Withdraw want token from Archimedes.
    function withdraw(uint _pid, address _user, uint _shares) external nonReentrant onlyHandler {
        require(_shares > 0, "0 shares");
        require(_userShares(_pid, _user) >= _shares, "withdraw: not sufficient founds");

        updatePool(_pid);

        PoolInfo storage pool = poolInfo[_pid];

        uint _before = _wantBalance(pool.want);

        // Pay rewards
        _calcPendingAndSwapRewards(_pid, _user);

        // this should burn shares and control the amount
        uint withdrawn = _controller(_pid).withdraw(_user, _shares);
        require(withdrawn > 0, "Can't withdraw from controller");

        uint __wantBalance = _wantBalance(pool.want) - _before;

        pool.want.safeTransfer(_user, __wantBalance);

        // This is to "save" like the new amount of shares was paid
        _updateUserPaidRewards(_pid, _user);

        emit Withdraw(_pid, _user, _shares);
    }

    // Claim rewards for a pool
    function harvest(uint _pid, address _user) public nonReentrant {
        if (_userShares(_pid, _user) <= 0) { return; }

        updatePool(_pid);

        uint _before = _wantBalance(poolInfo[_pid].want);

        uint harvested = _calcPendingAndSwapRewards(_pid, _user);

        uint _balance = _wantBalance(poolInfo[_pid].want) - _before;

        if (_balance > 0) {
            _depositInController(_pid, _user, _balance);
        }

        if (harvested > 0) { emit Harvested(_pid, _user, harvested); }
    }

    function harvestAll(address _user) external {
        uint length = poolInfo.length;
        for (uint pid = 0; pid < length; ++pid) {
            harvest(pid, _user);
            if (_outOfGasForLoop()) { break; }
        }
    }

    // Withdraw without caring about rewards. EMERGENCY ONLY.
    function emergencyWithdraw(uint _pid, address _user) external nonReentrant {
        require(msg.sender == _user || hasRole(DEFAULT_ADMIN_ROLE, msg.sender) || msg.sender == handler, "Not authorized");
        IERC20 want = poolInfo[_pid].want;

        userPaidRewards[_pid][_user] = 0;

        uint _shares = _userShares(_pid, _user);

        uint _before = _wantBalance(want);
        // this should burn shares and control the amount
        _controller(_pid).withdraw(_user, _shares);

        uint __wantBalance = _wantBalance(want) - _before;
        want.safeTransfer(_user, __wantBalance);

        emit EmergencyWithdraw(_pid, _user, _shares);
    }

    // Controller callback before transfer to harvest users rewards
    function beforeSharesTransfer(uint /*_pid*/, address /*_from*/, address /*_to*/, uint /*amount*/) external pure {
        revert("API shares are handled by handler at the moment");
    }

    // Controller callback after transfer to update users rewards
    function afterSharesTransfer(uint /*_pid*/, address /*_from*/, address /*_to*/, uint /*amount*/) external pure {
        revert("API shares are handled by handler at the moment");
    }

    function _updateUserPaidRewards(uint _pid, address _user) internal {
        userPaidRewards[_pid][_user] = (_userShares(_pid, _user) * poolInfo[_pid].accPiTokenPerShare) / SHARE_PRECISION;
    }

    function _wantBalance(IERC20 _want) internal view returns (uint) {
        return _want.balanceOf(address(this));
    }

    // Record referral in referralMgr contract if needed
    function _recordReferral(uint _pid, address _user, address _referrer) internal {
        // only if it's the first deposit
        if (_userShares(_pid, _user) <= 0 && _referrer != address(0) &&
            _referrer != _user && address(referralMgr) != address(0)) {

            referralMgr.recordReferral(_user, _referrer);
        }
    }

    function _depositInController(uint _pid, address _user, uint _amount) internal {
        // Archimedes => controller transfer & deposit
        poolInfo[_pid].want.safeIncreaseAllowance(poolInfo[_pid].controller, _amount);
        _controller(_pid).deposit(_user, _amount);
        // This is to "save" like the new amount of shares was paid
        _updateUserPaidRewards(_pid, _user);

        emit Deposit(_pid, _user, _amount);
    }

    // Pay rewards
    function _calcPendingAndSwapRewards(uint _pid, address _user) internal returns (uint pending) {
        uint _shares = _userShares(_pid, _user);

        if (_shares > 0) {
            pending = ((_shares * poolInfo[_pid].accPiTokenPerShare) / SHARE_PRECISION) - paidRewards(_pid, _user);

            if (pending > 0) {
                _swapForWant(_pid, pending);
                _payReferralCommission(_pid, _user, pending);
            }
        }
    }

    function _swapForWant(uint _pid, uint _amount) internal returns (uint swapped) {
        uint piTokenBal = piToken.balanceOf(address(this));

        if (_amount > piTokenBal) { _amount = piTokenBal; }

        if (_amount > 0) {
            uint expected = _expectedForSwap(_amount, address(piToken), address(poolInfo[_pid].want));

            require(expected > 0, "Can't swap for 0 tokens");

            piToken.safeApprove(exchange, _amount);
            uint[] memory outAmounts = IUniswapRouter(exchange).swapExactTokensForTokens(
                _amount, expected, piTokenToWantRoute[_pid], address(this), block.timestamp + 60
            );

            // Only last amount is needed
            swapped = outAmounts[outAmounts.length - 1];
        }
    }

    // Update the referral contract address by the admin
    function setReferralAddress(IReferral _newReferral) external onlyAdmin {
        require(_newReferral != referralMgr, "Same Manager");
        require(address(_newReferral) != address(0), "!ZeroAddress");
        referralMgr = _newReferral;
    }

    // Update referral commission rate by the admin
    function setReferralCommissionRate(uint16 _referralCommissionRate) external onlyAdmin {
        require(_referralCommissionRate != referralCommissionRate, "Same rate");
        require(_referralCommissionRate <= MAXIMUM_REFERRAL_COMMISSION_RATE, "rate greater than MaxCommission");
        referralCommissionRate = _referralCommissionRate;
    }

    // Pay referral commission to the referrer who referred this user.
    function _payReferralCommission(uint _pid, address _user, uint _pending) internal {
        if (address(referralMgr) != address(0) && referralCommissionRate > 0) {
            address referrer = referralMgr.getReferrer(_user);

            uint commissionAmount = (_pending * referralCommissionRate) / COMMISSION_RATE_PRECISION;

            if (referrer != address(0) && commissionAmount > 0) {
                // Instead of mint to the user, we call mint, swap and transfer
                uint apiLeftToMint = piToken.apiLeftToMint();
                if (apiLeftToMint < commissionAmount) {
                    commissionAmount = apiLeftToMint;
                }

                if (commissionAmount > 0) {
                    piToken.apiMint(address(this), commissionAmount);

                    uint _reward = _swapForWant(_pid, commissionAmount);

                    poolInfo[_pid].want.safeTransfer(referrer, _reward);

                    referralMgr.referralPaid(referrer, commissionAmount); // sum paid
                }
            }
        }
    }

    // View functions
    function poolLength() external view returns (uint) {
        return poolInfo.length;
    }

    function _userShares(uint _pid, address _user) internal view returns (uint) {
        return _controller(_pid).balanceOf(_user);
    }

    function paidRewards(uint _pid, address _user) public view returns (uint) {
        return userPaidRewards[_pid][_user];
    }
    function _controller(uint _pid) internal view returns (IController) {
        return IController(poolInfo[_pid].controller);
    }

    // old vault functions
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
        // Skip x% of minting per block for Referrals
        uint reserve = COMMISSION_RATE_PRECISION - referralCommissionRate;
        return piToken.apiMintPerBlock() * reserve / COMMISSION_RATE_PRECISION;
    }

    // Only to be mocked
    function _blockNumber() internal view virtual returns (uint) {
        return block.number;
    }

    // In case of stucketd 2Pi tokens after 2 years
    // check if any holder has pending tokens then call this fn
    // E.g. in case of a few EmergencyWithdraw the rewards will be stucked
    function redeemStuckedPiTokens() external onlyAdmin {
        require(piToken.totalSupply() == piToken.MAX_SUPPLY(), "PiToken still minting");
        // 2.5 years (2.5 * 365 * 24 * 3600) / 2.4s per block == 32850000
        require(_blockNumber() > (startBlock + 32850000), "Still waiting");

        uint _balance = piToken.balanceOf(address(this));

        if (_balance > 0) { piToken.safeTransfer(msg.sender, _balance); }
    }
}
