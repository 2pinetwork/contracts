// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface Farm {
    function piToken() external view returns (address);
}

interface IStrategy {
    function balance() external view returns (uint);
    function deposit() external;
    function withdraw(uint _amount) external;
    function paused() external view returns (bool);
    function retireStrat() external;
}

contract Controller is ERC20, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Address of Archimedes
    address public immutable farm;
    address public immutable want;

    address public strategy;
    address public treasury;

    // Fees
    uint constant public FEE_MAX = 10000;
    uint constant public MAX_WITHDRAW_FEE = 100; // 1%
    uint public withdrawFee = 10; // 0.1%

    constructor(
        address _want,
        address _farm,
        address _treasury
    ) ERC20(
        string(abi.encodePacked("2pi-", ERC20(_want).name())),
        string(abi.encodePacked("2pi", ERC20(_want).symbol()))
    ) {
        require(Farm(_farm).piToken() != address(0), "Invalid PiToken on Farm");

        want = _want;
        farm = _farm;
        treasury = _treasury;
    }

    modifier onlyFarm() {
        require(msg.sender == farm, "Not from farm");
        _;
    }

    modifier whenNotPaused() {
        require(!_strategyPaused(), "Strategy paused");
        _;
    }

    event NewStrategy(address old_strategy, address new_strategy);
    event NewTreasury(address old_treasury, address new_treasury);

    function setTreasury(address _treasury) external onlyOwner nonReentrant {
        emit NewTreasury(treasury, _treasury);

        treasury = _treasury;
    }

    function setStrategy(address new_strategy) external onlyOwner nonReentrant {
        emit NewStrategy(strategy, new_strategy);

        if (strategy != address(0)) {
            IStrategy(strategy).retireStrat();

            IERC20(want).safeApprove(strategy, 0);
        }

        strategy = new_strategy;


        IERC20(want).safeApprove(strategy, type(uint).max);

        _strategyDeposit();
    }

    function setWithdrawFee(uint _fee) external onlyOwner nonReentrant {
        require(_fee <= MAX_WITHDRAW_FEE, "!cap");

        withdrawFee = _fee;
    }


    function deposit(address _senderUser, uint _amount) external whenNotPaused onlyFarm nonReentrant {
        uint _before = balance();

        IERC20(want).safeTransferFrom(
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
    function withdraw(address _senderUser, uint _shares) external onlyFarm nonReentrant {
        // This line has to be calc before burn
        uint _withdraw = (balance() * _shares) / totalSupply();

        _burn(_senderUser, _shares);

        uint _balance = wantBalance();

        if (_balance < _withdraw) {
            uint _diff = _withdraw - _balance;

            _strategyWithdraw(_diff);
        }

        uint withdrawalFee = _withdraw * withdrawFee / FEE_MAX;
        IERC20(want).safeTransfer(farm, _withdraw - withdrawalFee);
        IERC20(want).safeTransfer(treasury, withdrawalFee);

        if (!_strategyPaused()) {
            _strategyDeposit();
        }
    }

    function _strategyPaused() internal view returns (bool){
        return IStrategy(strategy).paused();
    }

    function strategyBalance() public view returns (uint){
        return IStrategy(strategy).balance();
    }

    function wantBalance() public view returns (uint) {
        return IERC20(want).balanceOf(address(this));
    }

    function balance() public view returns (uint) {
        return wantBalance() + strategyBalance();
    }

    function _strategyDeposit() internal {
        uint _amount = wantBalance();

        if (_amount > 0) {
            IERC20(want).safeTransfer(address(this), _amount);

            IStrategy(strategy).deposit();
        }
    }

    function _strategyWithdraw(uint _amount) internal {
        if (_amount > 0) {
            IStrategy(strategy).withdraw(_amount);
        }
    }
}
