// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "./Swappable.sol";

abstract contract ControllerStratAbs is Swappable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20Metadata;

    bytes32 public constant BOOSTER_ROLE = keccak256("BOOSTER_ROLE");

    // Want
    IERC20Metadata immutable public want;
    // want "missing" decimals precision
    uint internal immutable WANT_MISSING_PRECISION;

    // Pool settings
    uint public ratioForFullWithdraw = 9000; // 90% [Min % to full withdraw
    uint public poolSlippageRatio = 20; // 0.2% [Slippage % to add/remove liquidity to/from the pool]
    // Min % to add/remove to an amount to conver BTC<=>BTCCRV
    // The virtualPrice will ALWAYS be greater than 1.0 (otherwise we're loosing BTC
    // so we only consider the decimal part)
    uint public poolMinVirtualPrice = 30; // 0.3%
    // Pool reward[s] route for Swap
    mapping(address => address[]) public rewardToWantRoute;
    // PoolRewards
    address[] public rewardTokens;

    // Fees
    uint constant public MAX_PERFORMANCE_FEE = 5000; // 50% max
    uint public performanceFee = 500; // 5.0%
    uint internal lastBalance;

    address public treasury;
    address public exchange;
    address public immutable controller; // immutable to prevent anyone to change it and withdraw

    // Deposit compensation
    address public equalizer;
    uint public offsetRatio = 0; // 0.00%

    // manual boosts
    uint public lastExternalBoost;

    // Migrate to a library or something
    function _checkIERC20(IERC20Metadata token, string memory errorMsg) internal view {
        require(address(token) != address(0), errorMsg);
        token.symbol(); // Check that want is at least an ERC20
        require(token.balanceOf(address(this)) == 0, "Invalid ERC20"); // Check that want is at least an ERC20
        require(token.allowance(msg.sender, address(this)) == 0, "Invalid ERC20"); // Check that want is at least an ERC20
    }

    constructor(IERC20Metadata _want, address _controller, address _exchange, address _treasury) {
        _checkIERC20(_want, "Want !ZeroAddress");
        require(_controller != address(0), "Controller !ZeroAddress");
        require(_exchange != address(0), "Exchange !ZeroAddress");
        require(_treasury != address(0), "Treasury !ZeroAddress");

        want = _want;
        controller = _controller;
        exchange = _exchange;
        treasury = _treasury;

        WANT_MISSING_PRECISION = (10 ** (18 - _want.decimals()));

        equalizer = msg.sender;
    }

    event NewTreasury(address oldTreasury, address newTreasury);
    event NewExchange(address oldExchange, address newExchange);
    event NewPerformanceFee(uint oldFee, uint newFee);
    event Harvested(address _want, uint _amount);
    event PerformanceFee(uint _amount);
    event Boosted(address indexed booster, uint amount);

    modifier onlyController() {
        require(msg.sender == controller, "Not from controller");
        _;
    }

    function setTreasury(address _treasury) external onlyAdmin nonReentrant {
        require(_treasury != treasury, "Same address");
        require(_treasury != address(0), "!ZeroAddress");
        emit NewTreasury(treasury, _treasury);

        treasury = _treasury;
    }

    function setExchange(address _exchange) external onlyAdmin nonReentrant {
        require(_exchange != exchange, "Same address");
        require(_exchange != address(0), "!ZeroAddress");
        emit NewExchange(exchange, _exchange);

        exchange = _exchange;
    }

    function setPerformanceFee(uint _fee) external onlyAdmin nonReentrant {
        require(_fee != performanceFee, "Same fee");
        require(_fee <= MAX_PERFORMANCE_FEE, "Can't be greater than max");
        emit NewPerformanceFee(performanceFee, _fee);

        performanceFee = _fee;
    }

    function setPoolMinVirtualPrice(uint _ratio) public onlyAdmin {
        require(_ratio != poolMinVirtualPrice, "Same ratio");
        require(_ratio <= RATIO_PRECISION, "Can't be more than 100%");

        poolMinVirtualPrice = _ratio;
    }

    function setPoolSlippageRatio(uint _ratio) public onlyAdmin {
        require(_ratio != poolSlippageRatio, "Same ratio");
        require(_ratio <= RATIO_PRECISION, "Can't be more than 100%");

        poolSlippageRatio = _ratio;
    }
    function setRatioForFullWithdraw(uint _ratio) public onlyAdmin {
        require(_ratio != ratioForFullWithdraw, "Same ratio");
        require(_ratio <= RATIO_PRECISION, "Can't be more than 100%");

        ratioForFullWithdraw = _ratio;
    }

    function setRewardToWantRoute(address _reward, address[] calldata _route) external onlyAdmin {
        require(_reward != address(0), "!ZeroAddress");
        require(_route[0] == _reward, "First route isn't reward");
        require(_route[_route.length - 1] == address(want), "Last route isn't want token");

        bool newReward = true;
        for (uint i = 0; i < rewardTokens.length; i++) {
            if (rewardTokens[i] == _reward) {
                newReward = false;
                break;
            }
        }

        if (newReward) { rewardTokens.push(_reward); }
        rewardToWantRoute[_reward] = _route;
    }

    // Compensation
    function setOffsetRatio(uint newRatio) external onlyAdmin {
        require(newRatio != offsetRatio, "same ratio");
        require(newRatio <= RATIO_PRECISION, "greater than 100%");
        require(newRatio >= 0, "less than 0%?");

        offsetRatio = newRatio;
    }

    function setEqualizer(address _equalizer) external onlyAdmin {
        require(_equalizer != address(0), "!ZeroAddress");
        require(_equalizer != equalizer, "same address");

        equalizer = _equalizer;
    }

    function beforeMovement() external onlyController nonReentrant {
        _beforeMovement();
    }

    // Update new `lastBalance` for the next charge
    function _afterMovement() internal virtual {
        lastBalance = balance();
    }

    function deposit() external whenNotPaused onlyController nonReentrant {
        _deposit();
        _afterMovement();
    }

    function withdraw(uint _amount) external onlyController nonReentrant returns (uint) {
        uint _balance = wantBalance();

        if (_balance < _amount) {
            uint poolBalance = balanceOfPoolInWant();

            // If the requested amount is greater than xx% of the founds just withdraw everything
            if (_amount > (poolBalance * ratioForFullWithdraw / RATIO_PRECISION)) {
                _withdrawAll();
            } else {
                _withdraw(_amount);
            }

            _balance = wantBalance();

            if (_balance < _amount) { _amount = _balance; } // solhint-disable-unreachable-code
        }

        want.safeTransfer(controller, _amount);

        // Redeposit
        if (!paused()) { _deposit(); }

        _afterMovement();

        return _amount;
    }

    function harvest() public nonReentrant virtual {
        uint _before = wantBalance();

        _claimRewards();
        _swapRewards();

        uint harvested = wantBalance() - _before;

        // Charge performance fee for earned want + rewards
        _beforeMovement();

        // re-deposit
        if (!paused()) { _deposit(); }

        // Update lastBalance for the next movement
        _afterMovement();

        emit Harvested(address(want), harvested);
    }

    // This function is called to "boost" the strategy.
    function boost(uint _amount) external {
        require(hasRole(BOOSTER_ROLE, msg.sender), "Not a booster");

        // Charge performance fee for earned want
        _beforeMovement();

        // transfer reward from caller
        if (_amount > 0) { want.safeTransferFrom(msg.sender, address(this), _amount); }

        // Keep track of how much is added to calc boost APY
        lastExternalBoost = _amount;

        // Deposit transfered amount
        _deposit();

        // update last_balance to exclude the manual reward from perfFee
        _afterMovement();

        emit Boosted(msg.sender, _amount);
    }

    function _beforeMovement() internal virtual{
        uint currentBalance = balance();

        if (currentBalance > lastBalance) {
            uint perfFee = ((currentBalance - lastBalance) * performanceFee) / RATIO_PRECISION;

            if (perfFee > 0) {
                uint _balance = wantBalance();

                if (_balance < perfFee) {
                    uint _diff = perfFee - _balance;

                    _withdraw(_diff);
                }

                // Just in case
                _balance = wantBalance();
                if (_balance < perfFee) { perfFee = _balance; }

                if (perfFee > 0) {
                    want.safeTransfer(treasury, perfFee);
                    emit PerformanceFee(perfFee);
                }
            }
        }
    }

    function _deposit() internal virtual {
        // should be implemented
    }

    function _withdraw(uint) internal virtual returns (uint) {
        // should be implemented
    }

    function _withdrawAll() internal virtual returns (uint) {
        // should be implemented
    }

    function _claimRewards() internal virtual {
        // should be implemented
    }

    function _swapRewards() internal virtual {
        // should be implemented
        for (uint i = 0; i < rewardTokens.length; i++) {
            address rewardToken = rewardTokens[i];
            uint _balance = IERC20Metadata(rewardToken).balanceOf(address(this));

            if (_balance > 0) {
                uint expected = _expectedForSwap(_balance, rewardToken, address(want));
                // Want price sometimes is too high so it requires a lot of rewards to swap
                if (expected > 1) {
                    IERC20Metadata(rewardToken).safeApprove(exchange, _balance);

                    IUniswapRouter(exchange).swapExactTokensForTokens(
                        _balance, expected, rewardToWantRoute[rewardToken], address(this), block.timestamp + 60
                    );
                }
            }
        }
    }

    /**
     * @dev Takes out performance fee.
     */
    function _chargeFees(uint _harvested) internal {
        uint fee = (_harvested * performanceFee) / RATIO_PRECISION;

        // Pay to treasury a percentage of the total reward claimed
        if (fee > 0) { want.safeTransfer(treasury, fee); }
    }

    function _compensateDeposit(uint _amount) internal returns (uint) {
        if (offsetRatio <= 0) { return _amount; }

        uint _comp = _amount * offsetRatio / RATIO_PRECISION;

        // Compensate only if we can...
        if (
            want.allowance(equalizer, address(this)) >= _comp &&
            want.balanceOf(equalizer) >= _comp
        ) {
            want.safeTransferFrom(equalizer, address(this), _comp);
            _amount += _comp;
        }

        return _amount;
    }

    function wantBalance() public view returns (uint) {
        return want.balanceOf(address(this));
    }

    function balance() public view returns (uint) {
        return wantBalance() + balanceOfPoolInWant();
    }

    function balanceOfPool() public view virtual returns (uint) {
        // should be implemented
    }

    function balanceOfPoolInWant() public view virtual returns (uint) {
        // should be implemented
    }

    // called as part of strat migration. Sends all the available funds back to the vault.
    function retireStrat() external onlyController {
        if (!paused()) { _pause(); }

        // max withdraw can fail if not staked (in case of panic)
        if (balanceOfPool() > 0) { _withdrawAll(); }

        // Can be called without rewards
        harvest();

        require(balanceOfPool() <= 0, "Strategy still has deposits");
        want.safeTransfer(controller, wantBalance());
    }

    // pauses deposits and withdraws all funds from third party systems.
    function panic() external onlyAdmin nonReentrant {
        _withdrawAll(); // max withdraw
        pause();
    }

    function pause() public onlyAdmin {
        _pause();
    }

    function unpause() external onlyAdmin nonReentrant {
        _unpause();

        _deposit();
    }
}
