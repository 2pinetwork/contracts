// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./PiAdmin.sol";
import "../interfaces/IUniswapPair.sol";
import "hardhat/console.sol";

interface IFarm {
    function piToken() external view returns (address);
    function beforeSharesTransfer(uint _pid, address _from, address _to, uint _amount) external;
    function afterSharesTransfer(uint _pid, address _from, address _to, uint _amount) external;
}

interface IStrategy {
    function balance() external view returns (uint);
    function deposit() external;
    function withdraw(uint _amount) external returns (uint);
    function paused() external view returns (bool);
    function retireStrat() external;
}



contract Controller is ERC20, PiAdmin, ReentrancyGuard {
    using SafeERC20 for IERC20Metadata;

    // Address of Archimedes
    address public immutable farm;
    IERC20Metadata public immutable want;

    // Farm controller index
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

    function _tokenSymbol(IERC20Metadata _want) internal returns (string memory sym) {
        (bool isLP,) = address(_want).call(abi.encodeWithSignature("token1()"));

        if (isLP) {
            IUniswapPair possiblePair = IUniswapPair(address(_want));

            sym = string(abi.encodePacked(
                "2piLP-",
                IERC20Metadata(possiblePair.token0()).symbol(),
                "-",
                IERC20Metadata(possiblePair.token1()).symbol()
            ));
        } else {
            sym = string(abi.encodePacked("2pi-", _want.symbol()));
        }
    }

    constructor(
        IERC20Metadata _want,
        address _farm,
        address _treasury
    ) ERC20(_tokenSymbol(_want), _tokenSymbol(_want)) {
        require(IFarm(_farm).piToken() != address(0), "Invalid PiToken on Farm");
        require(_treasury != address(0), "Treasury !ZeroAddress");

        want = _want;
        farm = _farm;
        treasury = _treasury;
    }

    function decimals() override public view returns (uint8) {
        return want.decimals();
    }

    // BeforeTransfer callback to harvest the farm rewards for both users
    function _beforeTokenTransfer(address from, address to, uint256 amount) internal virtual override {
        // ignore mint/burn
        if (from != address(0) && to != address(0) && amount > 0) {
            IFarm(farm).beforeSharesTransfer(uint(pid), from, to, amount);
        }
    }

    // AferTransfer callback to update the farm rewards for both users
    function _afterTokenTransfer(address from, address to, uint256 amount) internal virtual override {
        if (from != address(0) && to != address(0) && amount > 0) {
            IFarm(farm).afterSharesTransfer(uint(pid), from, to, amount);
        }
    }

    modifier onlyFarm() {
        require(msg.sender == farm, "Not from farm");
        _;
    }

    function setFarmPid(uint _pid) external onlyFarm returns (uint) {
        require(pid >= type(uint16).max, "pid already assigned");

        pid = _pid;

        return pid;
    }

    function setTreasury(address _treasury) external onlyAdmin nonReentrant {
        emit NewTreasury(treasury, _treasury);

        treasury = _treasury;
    }

    function setStrategy(address newStrategy) external onlyAdmin nonReentrant {
        require(newStrategy != address(0), "!ZeroAddress");
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
        require(_fee <= MAX_WITHDRAW_FEE, "!cap");

        withdrawFee = _fee;
    }

    function setDepositCap(uint _amount) external onlyAdmin nonReentrant {
        emit NewDepositCap(depositCap, _amount);

        depositCap = _amount;
    }

    function deposit(address _senderUser, uint _amount) external onlyFarm nonReentrant {
        require(!_strategyPaused(), "Strategy paused");
        _checkDepositCap(_amount);

        uint _before = balance();

        want.safeTransferFrom(
            farm, // Archimedes
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
    function withdraw(address _senderUser, uint _shares) external onlyFarm nonReentrant returns (uint) {
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
        }

        uint withdrawalFee = _withdraw * withdrawFee / RATIO_PRECISION;
        withdrawn = _withdraw - withdrawalFee;

        want.safeTransfer(farm, withdrawn);
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
