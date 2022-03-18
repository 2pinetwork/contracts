// SPDX-License-Identifier: MIT

pragma solidity 0.8.13;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./PiAdmin.sol";
import "../interfaces/IArchimedes.sol";
import "../interfaces/IStrategy.sol";

contract Controller is ERC20, PiAdmin, ReentrancyGuard {
    using SafeERC20 for IERC20Metadata;

    // Address of Archimedes
    address public immutable archimedes;
    IERC20Metadata public immutable want;

    // Archimedes controller index
    uint public pid = type(uint16).max; // 65535 means unassigned

    address public strategy;
    address public treasury;

    // Fees
    uint constant public RATIO_PRECISION = 10000;
    uint constant public MAX_WITHDRAW_FEE = 100; // 1%
    uint public withdrawFee = 10; // 0.1%

    // Deposit limit a contract can hold
    // This value should be in the same decimal representation as want
    // 0 value means unlimit
    uint public depositCap;

    event NewStrategy(address oldStrategy, address newStrategy);
    event NewTreasury(address oldTreasury, address newTreasury);
    event NewDepositCap(uint oldCap, uint newCap);

    constructor(
        IERC20Metadata _want,
        address _archimedes,
        address _treasury,
        string memory _shareSymbol
    ) ERC20(_shareSymbol, _shareSymbol) {
        _want.symbol(); // Check that want is at least an ERC20
        require(_want.balanceOf(address(this)) == 0, "Invalid ERC20"); // Check that want is at least an ERC20
        require(_want.allowance(msg.sender, address(this)) == 0, "Invalid ERC20"); // Check that want is at least an ERC20
        require(IArchimedes(_archimedes).piToken() != address(0), "Invalid PiToken on Archimedes");
        require(_treasury != address(0), "Treasury !ZeroAddress");

        want = _want;
        archimedes = _archimedes;
        treasury = _treasury;
    }

    function decimals() override public view returns (uint8) {
        return want.decimals();
    }

    // BeforeTransfer callback to harvest the archimedes rewards for both users
    function _beforeTokenTransfer(address from, address to, uint256 amount) internal virtual override {
        // ignore mint/burn
        if (from != address(0) && to != address(0) && amount > 0) {
            IArchimedes(archimedes).beforeSharesTransfer(uint(pid), from, to, amount);
        }
    }

    // AferTransfer callback to update the archimedes rewards for both users
    function _afterTokenTransfer(address from, address to, uint256 amount) internal virtual override {
        if (from != address(0) && to != address(0) && amount > 0) {
            IArchimedes(archimedes).afterSharesTransfer(uint(pid), from, to, amount);
        }
    }

    modifier onlyArchimedes() {
        require(msg.sender == archimedes, "Not from Archimedes");
        _;
    }

    function setPid(uint _pid) external onlyArchimedes returns (uint) {
        require(pid >= type(uint16).max, "pid already assigned");

        pid = _pid;

        return pid;
    }

    function setTreasury(address _treasury) external onlyAdmin nonReentrant {
        require(_treasury != treasury, "Same address");
        require(_treasury != address(0), "!ZeroAddress");
        emit NewTreasury(treasury, _treasury);

        treasury = _treasury;
    }

    function setStrategy(address newStrategy) external onlyAdmin nonReentrant {
        require(newStrategy != strategy, "Same strategy");
        require(newStrategy != address(0), "!ZeroAddress");
        require(IStrategy(newStrategy).want() == address(want), "Not same want");
        emit NewStrategy(strategy, newStrategy);

        if (strategy != address(0)) {
            IStrategy(strategy).retireStrat();
            require(
                IStrategy(strategy).balance() <= 0,
                "Strategy still has deposits"
            );
        }

        strategy = newStrategy;

        _strategyDeposit();
    }

    function setWithdrawFee(uint _fee) external onlyAdmin nonReentrant {
        require(_fee != withdrawFee, "Same fee");
        require(_fee <= MAX_WITHDRAW_FEE, "!cap");

        withdrawFee = _fee;
    }

    function setDepositCap(uint _amount) external onlyAdmin nonReentrant {
        require(_amount != depositCap, "Same cap");

        emit NewDepositCap(depositCap, _amount);

        depositCap = _amount;
    }

    function deposit(address _senderUser, uint _amount) external onlyArchimedes nonReentrant {
        require(!_strategyPaused(), "Strategy paused");
        require(_amount > 0, "Insufficient amount");
        _checkDepositCap(_amount);

        IStrategy(strategy).beforeMovement();

        uint _before = balance();

        want.safeTransferFrom(
            archimedes, // Archimedes
            address(this),
            _amount
        );

        uint _diff = balance() - _before;

        uint shares;
        if (totalSupply() <= 0) {
            shares = _diff;
        } else {
            shares = (_diff * totalSupply()) / _before;
        }

        _mint(_senderUser, shares);

        _strategyDeposit();
    }

    // Withdraw partial funds, normally used with a vault withdrawal
    function withdraw(address _senderUser, uint _shares) external onlyArchimedes nonReentrant returns (uint) {
        require(_shares > 0, "Insufficient shares");
        IStrategy(strategy).beforeMovement();

        // This line has to be calc before burn
        uint _withdraw = (balance() * _shares) / totalSupply();

        _burn(_senderUser, _shares);

        uint _balance = wantBalance();
        uint withdrawn;

        if (_balance < _withdraw) {
            uint _diff = _withdraw - _balance;

            // withdraw will revert if anyything weird happend with the
            // transfer back but just in case we ensure that the withdraw is
            // positive
            withdrawn = IStrategy(strategy).withdraw(_diff);
            require(withdrawn > 0, "Can't withdraw from strategy...");

            _balance = wantBalance();
            if (_balance < _withdraw) { _withdraw = _balance; }
        }

        uint withdrawalFee = _withdraw * withdrawFee / RATIO_PRECISION;
        withdrawn = _withdraw - withdrawalFee;

        want.safeTransfer(archimedes, withdrawn);
        want.safeTransfer(treasury, withdrawalFee);

        if (!_strategyPaused()) { _strategyDeposit(); }

        return withdrawn;
    }

    function _strategyPaused() internal view returns (bool){
        return IStrategy(strategy).paused();
    }

    function strategyBalance() public view returns (uint){
        return IStrategy(strategy).balance();
    }

    function wantBalance() public view returns (uint) {
        return want.balanceOf(address(this));
    }

    function balance() public view returns (uint) {
        return wantBalance() + strategyBalance();
    }

    // Check whats the max available amount to deposit
    function availableDeposit() external view returns (uint _available) {
        if (depositCap <= 0) { // without cap
            _available = type(uint).max;
        } else if (balance() < depositCap) {
            _available = depositCap - balance();
        }
    }

    function _strategyDeposit() internal {
        uint _amount = wantBalance();

        if (_amount > 0) {
            want.safeTransfer(strategy, _amount);

            IStrategy(strategy).deposit();
        }
    }

    function _checkDepositCap(uint _amount) internal view {
        // 0 depositCap means no-cap
        if (depositCap > 0) {
            require(balance() + _amount <= depositCap, "Max depositCap reached");
        }
    }
}
