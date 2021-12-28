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
    address public immutable poolId;
    IBalancerV2Vault public immutable pool;

    // Pool settings
    uint public ratioForFullWithdraw = 9000; // 90% [Min % to full withdraw
    // uint public poolSlippageRatio = 20; // 0.2% [Slippage % to add/remove liquidity to/from the pool]
    // Min % to add/remove to an amount to conver BTC<=>BTCCRV
    // The virtualPrice will ALWAYS be greater than 1.0 (in other case we're loosing BTC
    // so we only consider the decimal part
    uint public poolMinVirtualPrice = 100; // 1.0%

    // Routes for Swap
    mapping(address => address[]) tokenRoutes;
    // address[] public wNativeToBtcRoute = [WNATIVE, ETH, BTC];
    // address[] public crvToBtcRoute = [CRV, ETH, BTC];

    // Fees
    uint constant public MAX_PERFORMANCE_FEE = 500; // 5% max
    uint public performanceFee = 350; // 3.5%
    uint internal lastBalance;

    address public treasury;
    address public exchange;
    address public immutable controller; // immutable to prevent anyone to change it and withdraw

    constructor(IBalancerV2Vault _pool, bytes32 _poolId, address _want, address _controller, address _exchange, address _treasury) {
        require(_pool.getPoolTokens().length > 0, "Pool without tokens");
        require(_poolId != "", "Empty poolId");
        require(_want != address(0), "Want !ZeroAddress");
        require(_controller != address(0), "Controller !ZeroAddress");
        require(_exchange != address(0), "Exchange !ZeroAddress");
        require(_treasury != address(0), "Treasury !ZeroAddress");

        pool = _pool;
        poolId = _poolId;
        want = _want;
        controller = _controller;
        exchange = _exchange;
        treasury = _treasury;
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

    function setPoolMinVirtualPrice(uint _ratio) public onlyAdmin {
        require(_ratio != poolMinVirtualPrice, "Same ratio");
        require(_ratio <= RATIO_PRECISION, "Can't be more than 100%");
        poolMinVirtualPrice = _ratio;
    }

    function setRatioForFullWithdraw(uint _ratio) public onlyAdmin {
        require(_ratio != ratioForFullWithdraw, "Same ratio");
        require(_ratio <= RATIO_PRECISION, "Can't be more than 100%");
        ratioForFullWithdraw = _ratio;
    }

    // Charge BTC auto-generation with performanceFee
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
                uint _balance = btcBalance();

                if (_balance < perfFee) {
                    uint _diff = perfFee - _balance;

                    _withdrawBtc(_diff, false);
                }

                // Just in case
                _balance = btcBalance();
                if (_balance < perfFee) { perfFee = _balance; }

                if (perfFee > 0) {
                    IERC20(BTC).safeTransfer(treasury, perfFee);
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
        (IERC20[] memory poolTokens,,) = pool.getPoolTokens(poolId);
        IAsset[] memory tokens = new IAsset[](poolTokens.length);
        uint[] memory amounts = new uint[](poolTokens.length);

        uint bal = wantBalance();
        if (bal > 0) {
            for (uint i = 0; i < poolTokens.length; i++) {
                // assign index of want
                if (address(poolTokens[i]) == want) {
                    amounts[i] = bal;
                } else {
                    amounts[i] = 0;
                }

                tokens[i] = IAsset(address(poolTokens[i]));
            }

            // StablePoolJoinKind { INIT = 0, EXACT_TOKENS_IN_FOR_BPT_OUT = 1, TOKEN_IN_FOR_EXACT_BPT_OUT = 2}
            uint expected = bal * 9900 / 10000;
            bytes userData = abi.encode([1, amounts, expected]);


            pool.joinPool(
                poolId,
                address(this),
                address(this),
                JoinPoolRequest({
                    assets: poolTokens,
                    maxAmountsIn: amounts,
                    userData: userData,
                    fromInternalBalance: false
                })
            );
        }
    }

    function withdraw(uint _amount) external onlyController nonReentrant returns (uint) {
        uint _balance = btcBalance();

        if (_balance < _amount) {
            uint poolBalance = balanceOfPoolInBtc();

            // If the requested amount is greater than xx% of the founds just withdraw everything
            if (_amount > (poolBalance * ratioForFullWithdraw / RATIO_PRECISION)) {
                _withdrawBtc(0, true);
            } else {
                _withdrawBtc(_amount, false);
            }

            _balance = btcBalance();

            if (_balance < _amount) { _amount = _balance; }
        }


        IERC20(BTC).safeTransfer(controller, _amount);

        // Redeposit
        if (!paused()) { _deposit(); }

        _afterMovement();

        return _amount;
    }

    function harvest() public nonReentrant {
        uint _before = btcBalance();

        _claimRewards();
        _swapWMaticRewards();
        _swapCrvRewards();

        uint harvested = btcBalance() - _before;

        // Charge performance fee for earned want + rewards
        _beforeMovement();

        // re-deposit
        if (!paused()) { _deposit(); }

        // Update lastBalance for the next movement
        _afterMovement();

        emit Harvested(BTC, harvested);
    }

    /**
     * @dev Curve gauge claim_rewards claim WMatic & CRV tokens
     */
    function _claimRewards() internal {
        IRewardsGauge(REWARDS_GAUGE).claim_rewards(address(this));
    }

    function _swapWMaticRewards() internal {
        uint _balance = wNativeBalance();

        if (_balance > 0) {
            uint expected = _expectedForSwap(_balance, WNATIVE, BTC);

            // BTC price is too high so sometimes it requires a lot of rewards to swap
            if (expected > 1) {
                IERC20(WNATIVE).safeApprove(exchange, _balance);

                IUniswapRouter(exchange).swapExactTokensForTokens(
                    _balance, expected, wNativeToBtcRoute, address(this), block.timestamp + 60
                );
            }
        }
    }

    function _swapCrvRewards() internal {
        uint _balance = crvBalance();

        if (_balance > 0) {
            uint expected = _expectedForSwap(_balance, CRV, BTC);

            // BTC price is too high so sometimes it requires a lot of rewards to swap
            if (expected > 1) {

                IERC20(CRV).safeApprove(exchange, _balance);
                IUniswapRouter(exchange).swapExactTokensForTokens(
                    _balance, expected, crvToBtcRoute, address(this), block.timestamp + 60
                );
            }
        }
    }

    /**
     * @dev Takes out performance fee.
     */
    function _chargeFees(uint _harvested) internal {
        uint fee = (_harvested * performanceFee) / RATIO_PRECISION;

        // Pay to treasury a percentage of the total reward claimed
        if (fee > 0) { IERC20(BTC).safeTransfer(treasury, fee); }
    }

    // amount is the BTC expected to be withdrawn
    function _withdrawBtc(uint _amount, bool _maxWithdraw) internal {
        uint btcCrvAmount;

        if (_maxWithdraw) {
            btcCrvAmount = balanceOfPool();
        } else {
            // To know how much we have to un-stake we use the same method to
            // calculate the expected BTCCRV at deposit
            btcCrvAmount = _btcToBtcCrvDoubleCheck(_amount, false);
        }

        // Remove staked from gauge
        IRewardsGauge(REWARDS_GAUGE).withdraw(btcCrvAmount);

        // remove_liquidity
        uint _balance = btcCRVBalance();
        // Calculate at least xx% of the expected. The function doesn't
        // consider the fee.
        uint expected = (calc_withdraw_one_coin(_balance) * (RATIO_PRECISION - poolSlippageRatio)) / RATIO_PRECISION;

        // Double check for expected value
        // In this case we sum the poolMinVirtualPrice and divide by 1e10 because we want to swap BTCCRV => BTC
        uint minExpected = _balance * (RATIO_PRECISION + poolMinVirtualPrice - poolSlippageRatio) / (RATIO_PRECISION * 1e10);
        if (minExpected > expected) { expected = minExpected; }

        require(expected > 0, "remove_liquidity expected = 0");

        ICurvePool(CURVE_POOL).remove_liquidity_one_coin(_balance, 0,  expected, true);
    }

    function _minBtcToBtcCrv(uint _amount) internal view returns (uint) {
        // Based on virtual_price (poolMinVirtualPrice) and poolSlippageRatio
        // the expected amount is represented with 18 decimals as crvBtc token
        // so we have to add 10 decimals to the btc balance.
        // E.g. 1e8 (1BTC) * 1e10 * 99.4 / 100.0 => 0.994e18 BTCCRV tokens
        return _amount * 1e10 * (RATIO_PRECISION - poolSlippageRatio - poolMinVirtualPrice) / RATIO_PRECISION;
    }

    function _btcToBtcCrvDoubleCheck(uint _amount, bool _isDeposit) internal view returns (uint btcCrvAmount) {
        uint[2] memory amounts = [_amount, 0];
        // calc_token_amount doesn't consider fee
        btcCrvAmount = ICurvePool(CURVE_POOL).calc_token_amount(amounts, _isDeposit);
        // Remove max fee
        btcCrvAmount = btcCrvAmount * (RATIO_PRECISION - poolSlippageRatio) / RATIO_PRECISION;

        // In case the pool is unbalanced (attack), make a double check for
        // the expected amount with minExpected set ratios.
        uint btcToBtcCrv = _minBtcToBtcCrv(_amount);

        if (btcToBtcCrv > btcCrvAmount) { btcCrvAmount = btcToBtcCrv; }
    }

    function calc_withdraw_one_coin(uint _amount) public view returns (uint) {
        if (_amount > 0) {
            return ICurvePool(CURVE_POOL).calc_withdraw_one_coin(_amount, 0);
        } else {
            return 0;
        }
    }

    function btcBalance() public view returns (uint) {
        return IERC20(BTC).balanceOf(address(this));
    }
    function wNativeBalance() public view returns (uint) {
        return IERC20(WNATIVE).balanceOf(address(this));
    }
    function crvBalance() public view returns (uint) {
        return IERC20(CRV).balanceOf(address(this));
    }
    function btcCRVBalance() public view returns (uint) {
        return IERC20(BTCCRV).balanceOf(address(this));
    }
    function balance() public view returns (uint) {
        return btcBalance() + balanceOfPoolInBtc();
    }
    function balanceOfPool() public view returns (uint) {
        return IRewardsGauge(REWARDS_GAUGE).balanceOf(address(this));
    }
    function balanceOfPoolInBtc() public view returns (uint) {
        return calc_withdraw_one_coin(balanceOfPool());
    }

    // called as part of strat migration. Sends all the available funds back to the vault.
    function retireStrat() external onlyController {
        if (!paused()) { _pause(); }

        // max withdraw can fail if not staked (in case of panic)
        if (balanceOfPool() > 0) { _withdrawBtc(0, true); }

        // Can be called without rewards
        harvest();

        require(balanceOfPool() <= 0, "Strategy still has deposits");
        IERC20(BTC).safeTransfer(controller, btcBalance());
    }

    // pauses deposits and withdraws all funds from third party systems.
    function panic() external onlyAdmin nonReentrant {
        _withdrawBtc(0, true); // max withdraw
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
