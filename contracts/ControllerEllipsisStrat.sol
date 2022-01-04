// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "hardhat/console.sol";

import "./ControllerStratAbs.sol";
import "../interfaces/IEps.sol";

contract ControllerEllipsisStrat is ControllerStratAbs {
    using SafeERC20 for IERC20;
    using SafeERC20 for IERC20Metadata;

    address constant public REWARD_TOKEN = address(0xA7f552078dcC247C2684336020c03648500C6d9F);
    IEpsPool constant public POOL = IEpsPool(0x160CAed03795365F3A589f10C379FfA7d75d4E76);
    IERC20 constant public POOL_TOKEN = IERC20(0xaF4dE8E872131AE328Ce21D909C74705d3Aaf452);
    IEpsStaker constant public STAKE = IEpsStaker(0xcce949De564fE60e7f96C85e55177F8B9E4CF61b);
    IEpsMultiFeeDistribution constant public FEE_DISTRIBUTION = IEpsMultiFeeDistribution(0x4076CC26EFeE47825917D0feC3A79d0bB9a6bB5c);

    address[] rewardToWantRoute;

    int128 private immutable TOKEN_INDEX; // want token index in the pool
    uint private constant TOKENS_COUNT = 3; // 3Eps pool
    uint private constant STAKE_POOL_ID = 1; // 3Eps pool

    constructor(
        IERC20Metadata _want,
        address _controller,
        address _exchange,
        address _treasury
    ) ControllerStratAbs(_want, _controller, _exchange, _treasury) {
        rewardToWantRoute = [REWARD_TOKEN, address(want)];
        uint i = 0;

        for (i; i < TOKENS_COUNT; i++) {
            if (address(want) == POOL.coins(i)) { break; }
        }

        TOKEN_INDEX = int128(uint128(i));
    }

    function setRewardToWantRoute(address[] calldata _route) external onlyAdmin {
        require(_route[0] == REWARD_TOKEN, "First route isn't REWARD");
        require(_route[_route.length - 1] == address(want), "Last route isn't want");
        rewardToWantRoute = _route;
    }

    function harvest() public nonReentrant override {
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

    function _deposit() internal override {
        uint wantBal = wantBalance();

        if (wantBal > 0) {
            uint[TOKENS_COUNT] memory amounts = _amountToAmountsList(wantBal);

            uint expected = _wantToPoolTokenDoubleCheck(wantBal, true);

            want.safeApprove(address(POOL), wantBal);
            POOL.add_liquidity(amounts, expected);
        }

        uint poolTokenBal = POOL_TOKEN.balanceOf(address(this));

        if (poolTokenBal > 0) {
            POOL_TOKEN.safeApprove(address(STAKE), poolTokenBal);
            STAKE.deposit(STAKE_POOL_ID, poolTokenBal);
        }
    }
    /**
     * @dev Curve gauge claim_rewards claim WMatic & CRV tokens
     */
    function _claimRewards() internal {
        uint[] memory pids = new uint[](1);
        pids[0] = STAKE_POOL_ID;

        STAKE.claim(pids);
        FEE_DISTRIBUTION.exit();
    }

    function _swapRewards() internal {
        uint _balance = IERC20(REWARD_TOKEN).balanceOf(address(this));

        if (_balance > 0) {
            uint expected = _expectedForSwap(_balance, REWARD_TOKEN, address(want));

            // Want price sometimes is too high so it requires a lot of rewards to swap
            if (expected > 1) {
                IERC20(REWARD_TOKEN).safeApprove(exchange, _balance);

                IUniswapRouter(exchange).swapExactTokensForTokens(
                    _balance, 1, rewardToWantRoute, address(this), block.timestamp + 60
                );
            }
        }
    }

    // amount is the BTC expected to be withdrawn
    function _withdraw(uint _amount) internal override returns (uint) {
        // To know how much we have to un-stake we use the same method to
        // calculate the expected poolToken at deposit
        uint poolTokenAmount = _wantToPoolTokenDoubleCheck(_amount, false);

        // Remove staked from gauge
        STAKE.withdraw(STAKE_POOL_ID, poolTokenAmount);

        // remove_liquidity
        uint _balance = POOL_TOKEN.balanceOf(address(this));
        uint expected = _poolTokenToWantDoubleCheck(_balance);

        require(expected > 0, "remove_liquidity expected = 0");

        uint wantBal = wantBalance();
        POOL.remove_liquidity_one_coin(_balance, TOKEN_INDEX,  expected);

        return wantBalance() - wantBal;
    }

    function _withdrawAll() internal override returns (uint) {
        // Remove everything from stake
        uint poolTokenAmount = balanceOfPool();
        STAKE.withdraw(STAKE_POOL_ID, poolTokenAmount);

        // remove_liquidity
        uint _balance = POOL_TOKEN.balanceOf(address(this));
        uint expected = _poolTokenToWantDoubleCheck(_balance);

        require(expected > 0, "remove_liquidity expected = 0");

        uint wantBal = wantBalance();
        POOL.remove_liquidity_one_coin(_balance, TOKEN_INDEX,  expected);

        return wantBalance() - wantBal;
    }


    function _minWantToPoolToken(uint _amount) internal view returns (uint) {
        // Based on virtual_price (poolMinVirtualPrice) and poolSlippageRatio
        // the expected amount is represented with 18 decimals as POOL_TOKEN
        // so we have to add X decimals to the want balance.
        // E.g. 1e8 (1BTC) * 1e10 * 99.4 / 100.0 => 0.994e18 poolToken tokens
        return _amount * WANT_MISSING_PRECISION * (RATIO_PRECISION - poolSlippageRatio - poolMinVirtualPrice) / RATIO_PRECISION;
    }
    function _minPoolTokenToWant(uint _amount) internal view returns (uint) {
        // Double check for expected value
        // In this case we sum the poolMinVirtualPrice and divide by 1e10 because we want to swap poolToken => BTC
        return _amount * (RATIO_PRECISION + poolMinVirtualPrice - poolSlippageRatio) / (RATIO_PRECISION * WANT_MISSING_PRECISION);

    }

    function _poolTokenToWantDoubleCheck(uint _amount) internal view returns (uint wantAmount) {
        // Calculate at least xx% of the expected. The function doesn't
        // consider the fee.
        wantAmount = (calcWithdrawOneCoin(_amount) * (RATIO_PRECISION - poolSlippageRatio)) / RATIO_PRECISION;

        uint minWant = _minPoolTokenToWant(_amount);

        if (minWant > wantAmount) { wantAmount = minWant; }
    }

    function _wantToPoolTokenDoubleCheck(uint _amount, bool _isDeposit) internal view returns (uint poolTokenAmount) {
        uint[TOKENS_COUNT] memory amounts = _amountToAmountsList(_amount);
        // calc_token_amount doesn't consider fee
        poolTokenAmount = POOL.calc_token_amount(amounts, _isDeposit);
        // Remove max fee
        poolTokenAmount = poolTokenAmount * (RATIO_PRECISION - poolSlippageRatio) / RATIO_PRECISION;

        // In case the pool is unbalanced (attack), make a double check for
        // the expected amount with minExpected set ratios.
        uint wantToPoolToken = _minWantToPoolToken(_amount);

        if (wantToPoolToken > poolTokenAmount) { poolTokenAmount = wantToPoolToken; }
    }

    function calcWithdrawOneCoin(uint _amount) public view returns (uint) {
        if (_amount > 0) {
            return POOL.calc_withdraw_one_coin(_amount, TOKEN_INDEX);
        } else {
            return 0;
        }
    }

    function balanceOfPool() public view override returns (uint) {
        (uint _amount, ) = STAKE.userInfo(STAKE_POOL_ID, address(this));
        return _amount;
    }

    function balanceOfPoolInWant() public view override returns (uint) {
        return calcWithdrawOneCoin(balanceOfPool());
    }

    function _amountToAmountsList(uint _amount) internal view returns (uint[TOKENS_COUNT] memory) {
        uint[TOKENS_COUNT]  memory amounts; // #  = new uint[](TOKENS_COUNT);
        amounts[uint(uint128(TOKEN_INDEX))] = _amount;

        return amounts;
    }
}
