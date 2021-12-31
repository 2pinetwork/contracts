// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "hardhat/console.sol";

import "./Swappable.sol";
import "../interfaces/IBalancer.sol";

contract ControllerBalancerV2Strat is Swappable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public immutable want;
    bytes32 public immutable poolId;
    IBalancerV2Vault public immutable vault;

    // Pool settings
    uint public ratioForFullWithdraw = 9000; // 90% [Min % to full withdraw]
    uint public poolSlippageRatio = 20; // 0.2% [Slippage % to add/remove liquidity to/from the pool]
    // JoinKind { INIT = 0, EXACT_TOKENS_IN_FOR_BPT_OUT = 1, TOKEN_IN_FOR_EXACT_BPT_OUT = 2}
    uint public constant JOIN_KIND = 1;
    // ExitKind {EXACT_BPT_IN_FOR_ONE_TOKEN_OUT = 0, EXACT_BPT_IN_FOR_TOKENS_OUT = 1, BPT_IN_FOR_EXACT_TOKENS_OUT = 2}
    uint public constant EXACT_BPT_IN_FOR_ONE_TOKEN_OUT = 0;
    uint public constant BPT_IN_FOR_EXACT_TOKENS_OUT = 2;
    uint public immutable WANT_PRECISION;
    uint public constant SHARES_PRECISION = 1e18; // same as BPT token

    // Rewards
    address[] public rewardsTokens;

    // Routes for Swap
    mapping(address => address[]) tokenRoutes;

    // Fees
    uint constant public MAX_PERFORMANCE_FEE = 500; // 5% max
    uint public performanceFee = 350; // 3.5%
    uint internal lastBalance;

    address public treasury;
    address public exchange;
    address public immutable controller; // immutable to prevent anyone to change it and withdraw

    constructor(IBalancerV2Vault _vault, bytes32 _poolId, address _want, address _controller, address _exchange, address _treasury) {
        require(_poolId != "", "Empty poolId");
        require(_want != address(0), "Want !ZeroAddress");
        require(_controller != address(0), "Controller !ZeroAddress");
        require(_exchange != address(0), "Exchange !ZeroAddress");
        require(_treasury != address(0), "Treasury !ZeroAddress");

        vault = _vault;
        poolId = _poolId;
        want = _want;
        controller = _controller;
        exchange = _exchange;
        treasury = _treasury;

        // USDT / USDC has less decimal precision
        WANT_PRECISION = 1e18 / (10 ** IERC20Metadata(_want).decimals());

        require(_assets().length > 0, "Vault without tokens");
    }

    event NewTreasury(address oldTreasury, address newTreasury);
    event NewExchange(address oldExchange, address newExchange);
    event NewPerformanceFee(uint oldFee, uint newFee);
    event Harvested(address _want, uint _amount);
    event PerformanceFee(uint _amount);

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

    function setTokenRoute(address _token, address[] calldata _route) external onlyAdmin {
        require(_token != address(0), "!ZeroAddress");
        require(_route[0] == _token, "First route isn't token");
        require(_route[_route.length - 1] == want, "Last route isn't want token");
        tokenRoutes[_token] = _route;
    }

    function setPerformanceFee(uint _fee) external onlyAdmin nonReentrant {
        require(_fee != performanceFee, "Same fee");
        require(_fee <= MAX_PERFORMANCE_FEE, "Can't be greater than max");
        emit NewPerformanceFee(performanceFee, _fee);

        performanceFee = _fee;
    }

    function setPoolSlippageRatio(uint _ratio) external onlyAdmin {
        require(_ratio != poolSlippageRatio, "Same ratio");
        require(_ratio <= RATIO_PRECISION, "Can't be more than 100%");
        poolSlippageRatio = _ratio;
    }

    function setRatioForFullWithdraw(uint _ratio) external onlyAdmin {
        require(_ratio != ratioForFullWithdraw, "Same ratio");
        require(_ratio <= RATIO_PRECISION, "Can't be more than 100%");
        ratioForFullWithdraw = _ratio;
    }

    // Charge want auto-generation with performanceFee
    // Basically we assign `lastBalance` with current balance each time that
    // we charge or make a movement.
    function beforeMovement() external onlyController nonReentrant {
        _beforeMovement();
    }

    function _beforeMovement() internal {
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
                    IERC20(want).safeTransfer(treasury, perfFee);
                    emit PerformanceFee(perfFee);
                }
            }
        }
    }

    // Update new `lastBalance` for the next charge
    function _afterMovement() internal {
        lastBalance = balance();
    }

    function deposit() external whenNotPaused onlyController nonReentrant {
        _deposit();
        _afterMovement();
    }

    function _deposit() internal {
        IAsset[] memory tokens = _assets();
        uint[] memory amounts = new uint[](tokens.length);

        uint _balance = wantBalance();

        for (uint i = 0; i < tokens.length; i++) {
            // assign index of want
            if (address(tokens[i]) == want) {
                amounts[i] = _balance;
            } else {
                amounts[i] = 0;
            }
        }

        uint expected = _balance * WANT_PRECISION * SHARES_PRECISION / _pricePerShare();

        require(expected > 0, "Insufficient expected amount");

        bytes memory userData = abi.encode(JOIN_KIND, amounts, expected);

        IERC20(want).safeApprove(address(vault), _balance);

        vault.joinPool(
            poolId,
            address(this),
            address(this),
            IBalancerV2Vault.JoinPoolRequest({
                assets: tokens,
                maxAmountsIn: amounts,
                userData: userData,
                fromInternalBalance: false
            })
        );

        console.log("Balance despues de depositar:", balanceOfPoolInWant());
        console.log("Balance despues de depositar en BPT:", balanceOfPool());
    }

    function withdraw(uint _amount) external onlyController nonReentrant returns (uint) {
        uint _balance = wantBalance();

        console.log("Balance antes de sacar:", balanceOfPoolInWant());
        console.log("Balance antes de sacar en BPT:", balanceOfPool());
        if (_balance < _amount) {
            uint vaultBalance = balanceOfPoolInWant();

            // If the requested amount is greater than xx% of the founds just withdraw everything
            if (_amount > (vaultBalance * ratioForFullWithdraw / RATIO_PRECISION)) {
                _withdrawAll();
            } else {
                _withdraw(_amount);
            }

            _balance = wantBalance();

            if (_balance < _amount) { _amount = _balance; }
        }

        console.log("Balance antes de sacar:", balanceOfPoolInWant());
        console.log("Balance antes de sacar en BPT:", balanceOfPool());
        IERC20(want).safeTransfer(controller, _amount);

        // Redeposit
        if (!paused()) { _deposit(); }

        _afterMovement();

        return _amount;
    }

    function harvest() public nonReentrant {
        uint _before = wantBalance();

        _claimRewards();
        // _swapWMaticRewards();
        // _swapCrvRewards();

        uint harvested = wantBalance() - _before;

        // Charge performance fee for earned want + rewards
        _beforeMovement();

        // re-deposit
        if (!paused()) { _deposit(); }

        // Update lastBalance for the next movement
        _afterMovement();

        emit Harvested(want, harvested);
    }

    /**
     * @dev Curve gauge claim_rewards claim WMatic & CRV tokens
     */
    function _claimRewards() internal {
        // IRewardsGauge(REWARDS_GAUGE).claim_rewards(address(this));
    }


    /**
     * @dev Takes out performance fee.
     */
    function _chargeFees(uint _harvested) internal {
        uint fee = (_harvested * performanceFee) / RATIO_PRECISION;

        // Pay to treasury a percentage of the total reward claimed
        if (fee > 0) { IERC20(want).safeTransfer(treasury, fee); }
    }

    // amount is the want expected to be withdrawn
    function _withdraw(uint _amount) internal {
        IAsset[] memory tokens = _assets();
        uint[] memory amounts = new uint[](tokens.length);

        uint _balance = wantBalance();
        if (_balance < _amount) {
            uint diff = _amount - _balance;

            for (uint i = 0; i < tokens.length; i++) {
                // assign index of want
                if (address(tokens[i]) == want) { amounts[i] = diff; }
            }


            // We put a little more than the expected amount because of the fees & the pool swaps
            uint expected = (
                diff * WANT_PRECISION * SHARES_PRECISION *
                (RATIO_PRECISION + poolSlippageRatio) / RATIO_PRECISION /
                _pricePerShare()
            );

            require(expected > 0, "Insufficient expected amount");

            bytes memory userData = abi.encode(BPT_IN_FOR_EXACT_TOKENS_OUT, amounts, expected);

            vault.exitPool(
                poolId,
                address(this),
                payable(address(this)),
                IBalancerV2Vault.ExitPoolRequest({
                    assets: tokens,
                    minAmountsOut: amounts,
                    userData: userData,
                    toInternalBalance: false
                })
            );
        }
    }

    function _withdrawAll() internal {
        IAsset[] memory tokens = _assets();
        uint[] memory amounts = new uint[](tokens.length);

        uint bpt_balance = balanceOfPool();
        uint index = 0;

        uint expected = (
            bpt_balance * _pricePerShare() *
            (RATIO_PRECISION - poolSlippageRatio) / RATIO_PRECISION /
            WANT_PRECISION / SHARES_PRECISION
        );

        require(expected > 0, "Insufficient expected amount");

        for (uint i = 0; i < tokens.length; i++) {
            // assign index of want
            if (address(tokens[i]) == want) {
                index = i;
                amounts[i] = expected;
                break;
            }
        }

        // Withdraw all the BPT directly
        bytes memory userData = abi.encode(EXACT_BPT_IN_FOR_ONE_TOKEN_OUT, bpt_balance, index);

        vault.exitPool(
            poolId,
            address(this),
            payable(address(this)),
            IBalancerV2Vault.ExitPoolRequest({
                assets: tokens,
                minAmountsOut: amounts,
                userData: userData,
                toInternalBalance: false
            })
        );

        // Not sure if the minAmountsOut are respected in this case so re-check
        require(wantBalance() >= expected, "Less tokens than expected");
    }

    function wantBalance() public view returns (uint) {
        return IERC20(want).balanceOf(address(this));
    }
    function balance() public view returns (uint) {
        return wantBalance() + balanceOfPoolInWant();
    }
    function balanceOfPool() public view returns (uint) {
        (address pool,) = vault.getPool(poolId);
        return IERC20(pool).balanceOf(address(this));
    }
    function balanceOfPoolInWant() public view returns (uint) {
        return balanceOfPool() * _pricePerShare() / WANT_PRECISION / SHARES_PRECISION;
    }

    // called as part of strat migration. Sends all the available funds back to the vault.
    function retireStrat() external onlyController {
        if (!paused()) { _pause(); }

        // max withdraw can fail if not staked (in case of panic)
        if (balanceOfPool() > 0) { _withdrawAll(); }

        // Can be called without rewards
        harvest();

        require(balanceOfPool() <= 0, "Strategy still has deposits");
        IERC20(want).safeTransfer(controller, wantBalance());
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

    function _pricePerShare() internal view returns (uint) {
        (address pool,) = vault.getPool(poolId);

        uint rate = IBalancerPool(pool).getRate();

        require(rate > 1e18, "Under 1");

        return rate;
    }

    function _assets() internal view returns (IAsset[] memory assets) {
        (IERC20[] memory poolTokens,,) = vault.getPoolTokens(poolId);

        for (uint i = 0; i < poolTokens.length; i++) {
            assets[i] = IAsset(address(poolTokens[i]));
        }
    }
}
