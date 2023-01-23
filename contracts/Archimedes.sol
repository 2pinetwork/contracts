// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Address.sol";

import "./PiAdmin.sol";
import "../interfaces/IController.sol";
import "../interfaces/IStrategy.sol";
import "../interfaces/IWNative.sol";

contract Archimedes is PiAdmin, ReentrancyGuard {
    // using Address for address;
    using SafeERC20 for IERC20;

    // Used for native token deposits/withdraws
    IWNative public immutable WNative;

    // Info of each pool.
    struct PoolInfo {
        IERC20 want;             // Address of token contract.
        address controller;      // Token controller
    }

    // Info of each pool.
    PoolInfo[] public poolInfo;

    event Deposit(uint indexed pid, address indexed user, uint amount);
    event Withdraw(uint indexed pid, address indexed user, uint amount);
    event EmergencyWithdraw(uint indexed pid, address indexed user, uint amount);
    event NewPool(uint indexed pid, address want);

    constructor(IWNative _wNative) {
        require(address(_wNative) != address(0), "!ZeroAddress");
        // Minimal ERC20 check
        _wNative.symbol();
        _wNative.decimals();

        WNative = _wNative;
    }

    // Deposit Native
    receive() external payable { }

    // Add a new want token to the pool. Can only be called by the owner.
    function addNewPool(IERC20 _want, address _ctroller) external onlyAdmin {
        require(address(_want) != address(0), "Address zero not allowed");
        require(IController(_ctroller).archimedes() == address(this), "Not an Archimedes controller");
        require(IController(_ctroller).strategy() != address(0), "Controller without strategy");

        poolInfo.push(PoolInfo({
            want: _want,
            controller: _ctroller
        }));

        uint _pid = poolInfo.length - 1;
        uint _setPid = IController(_ctroller).setPid(_pid);
        require(_pid == _setPid, "Pid doesn't match");

        emit NewPool(_pid, address(_want), _weighing);
    }

    // Direct native deposit
    function depositNative(uint _pid) external payable nonReentrant {
        uint _amount = msg.value;
        require(_amount > 0, "Insufficient deposit");
        require(address(poolInfo[_pid].want) == address(WNative), "Only Native token pool");

        // With that Archimedes already has the wNative
        WNative.deposit{value: _amount}();

        // Deposit in the controller
        _depositInStrategy(_pid, _amount);
    }

    // Deposit want token to Archimedes
    function deposit(uint _pid, uint _amount) public nonReentrant {
        require(_amount > 0, "Insufficient deposit");

        // Deposit in the controller
        _depositInStrategy(_pid, _amount);
    }

    function depositAll(uint _pid) external {
        require(address(poolInfo[_pid].want) != address(WNative), "Can't deposit all Native");
        uint _balance = poolInfo[_pid].want.balanceOf(msg.sender);

        deposit(_pid, _balance, _referrer);
    }

    // Withdraw want token from Archimedes.
    function withdraw(uint _pid, uint _shares) public nonReentrant {
        require(_shares > 0, "0 shares");
        require(_userShares(_pid) >= _shares, "withdraw: not sufficient founds");

        PoolInfo storage pool = poolInfo[_pid];

        uint _before = _wantBalance(pool.want);
        // this should burn shares and control the amount
        uint withdrawn = _controller(_pid).withdraw(msg.sender, _shares);
        require(withdrawn > 0, "No funds withdrawn");

        uint _amount = _wantBalance(pool.want) - _before;

        // In case we have WNative we unwrap to Native
        if (address(pool.want) == address(WNative)) {
            // Unwrap WNative => Native
            WNative.withdraw(_amount);

            Address.sendValue(payable(msg.sender), _amount);
        } else {
            pool.want.safeTransfer(address(msg.sender), _amount);
        }

        emit Withdraw(_pid, msg.sender, _shares);
    }

    function withdrawAll(uint _pid) external {
        withdraw(_pid, _userShares(_pid));
    }

    // Withdraw without caring about rewards. EMERGENCY ONLY.
    function emergencyWithdraw(uint _pid) external nonReentrant {
        IERC20 want = poolInfo[_pid].want;

        uint _shares = _userShares(_pid);

        require(_shares > 0, "No shares to withdraw");

        uint _before = _wantBalance(want);
        // this should burn shares and control the amount
        _controller(_pid).withdraw(msg.sender, _shares);

        uint _amount = _wantBalance(want) - _before;
        want.safeTransfer(address(msg.sender), _amount);

        emit EmergencyWithdraw(_pid, msg.sender, _shares);
    }

    function _wantBalance(IERC20 _want) internal view returns (uint) {
        return _want.balanceOf(address(this));
    }

    function _depositInStrategy(uint _pid, uint _amount) internal {
        PoolInfo storage pool = poolInfo[_pid];

        // Archimedes => controller transfer & deposit
        pool.want.safeIncreaseAllowance(pool.controller, _amount);
        _controller(_pid).deposit(msg.sender, _amount);

        emit Deposit(_pid, msg.sender, _amount);
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

    function paused(uint _pid) external view returns (bool) {
        return IStrategy(_controller(_pid).strategy()).paused();
    }

    function availableDeposit(uint _pid) external view returns (uint) {
        return _controller(_pid).availableDeposit();
    }

    function availableUserDeposit(uint _pid, address _user) external view returns (uint) {
        return _controller(_pid).availableUserDeposit(_user);
    }

    function poolStrategyInfo(uint _pid) external view returns (
        IStrategy strategy,
        string memory stratIdentifier
    ) {
        strategy = IStrategy(_controller(_pid).strategy());
        stratIdentifier = strategy.identifier();
    }
}
