// SPDX-License-Identifier: MIT

pragma solidity 0.8.13;

import "./ControllerStratAbs.sol";
import "../interfaces/ICurve.sol";
import "../interfaces/IJarvisPool.sol";
import "../interfaces/IUniswapRouter.sol";
import "../interfaces/IDMMRouter.sol";

contract ControllerJarvisStrat is ControllerStratAbs {
    using SafeERC20 for IERC20;
    using SafeERC20 for IERC20Metadata;


    address constant public AG_DENARIUS = address(0xbAbC2dE9cE26a5674F8da84381e2f06e1Ee017A1);
    address constant public AGEURCRV = address(0x81212149b983602474fcD0943E202f38b38d7484); // same than CurvePool
    address constant public CURVE_POOL = address(0x81212149b983602474fcD0943E202f38b38d7484); // agEUR+4eur-f
    address constant public REWARDS_STORAGE = address(0x7c22801057be8392a25D5Ad9490959BCF51F18f2); // AerariumSanctius contract
    address constant public JARVIS_POOL = address(0x1Dc366c5aC2f3Ac16af20212B46cDC0c92235A20); // ElysianFields contract

    uint constant public JARVIS_POOL_ID = 0; // agDenarius agEUR+4eur-f pool

    constructor(address _controller, address _exchange, address _kyberExchange, address _treasury)
        ControllerStratAbs(
            IERC20Metadata(0xE0B52e49357Fd4DAf2c15e02058DCE6BC0057db4), // agEUR
            _controller,
            _exchange,
            _treasury
        ) {
            require(_kyberExchange != address(0), "Kyber exchange !ZeroAddress");

            kyberExchange = _kyberExchange;
        }

    function identifier() external pure returns (string memory) {
        return string("agEUR@Jarvis#1.0.0");
    }

    function _deposit() internal override {
        // if pool is ended we shouldn't deposit
        if (IJarvisPool(JARVIS_POOL).endBlock() <= block.number) { return; }

        uint wantBal = wantBalance();

        if (wantBal > 0) {
            uint[2] memory amounts = [wantBal, 0];
            uint agEurCrvAmount = _agEurToAgEurCrvDoubleCheck(wantBal, true);

            want.safeApprove(CURVE_POOL, wantBal);
            ICurvePool(CURVE_POOL).add_liquidity(amounts, agEurCrvAmount);
        }

        uint _agEurCRVBalance = agEurCRVBalance();

        if (_agEurCRVBalance > 0) {
            IERC20(AGEURCRV).safeApprove(JARVIS_POOL, _agEurCRVBalance);
            IJarvisPool(JARVIS_POOL).deposit(JARVIS_POOL_ID, _agEurCRVBalance);
        }
    }

    function _withdraw(uint _amount) internal override returns (uint) {
        uint _balance = wantBalance();

        if (_balance < _amount) {
            _withdrawFromPool(
                _agEurToAgEurCrvDoubleCheck(_amount - _balance, false)
            );
        }

        uint withdrawn = wantBalance() - _balance;

        return (withdrawn > _amount) ? _amount : withdrawn;
    }

    function _withdrawAll() internal override returns (uint) {
        uint _balance = wantBalance();

        _withdrawFromPool(balanceOfPool());

        return wantBalance() - _balance;
    }

    function _withdrawFromPool(uint agEurCrvAmount) internal {
        // Remove staked from pool
        IJarvisPool(JARVIS_POOL).withdraw(JARVIS_POOL_ID, agEurCrvAmount);

        // remove_liquidity
        uint _balance = agEurCRVBalance();
        uint expected = _agEurCrvToAgEurDoubleCheck(_balance);

        require(expected > 0, "remove_liquidity expected = 0");

        ICurvePool(CURVE_POOL).remove_liquidity_one_coin(_balance, 0,  expected);
    }

    function harvest() public nonReentrant override {
        uint _before = wantBalance();

        _claimRewards();
        _swapRewardsOnKyber(); // should be called before common swap
        _swapRewards();

        uint harvested = wantBalance() - _before;

        // Charge performance fee for earned want + rewards
        _beforeMovement();

        // re-deposit
        if (!paused() && wantBalance() > 0) { _deposit(); }

        // Update lastBalance for the next movement
        _afterMovement();

        emit Harvested(address(want), harvested);
    }

    function _claimRewards() internal {
        uint pending = IJarvisPool(JARVIS_POOL).pendingRwd(JARVIS_POOL_ID, address(this));

        if (pending > 0) {
            IJarvisPool(JARVIS_POOL).deposit(JARVIS_POOL_ID, 0);
        }

        // If the endBlock is reached we burn all the AG_DENARIUS tokens to get rewards
        if (IJarvisPool(JARVIS_POOL).endBlock() <= block.number) {
            uint bal = IERC20(AG_DENARIUS).balanceOf(address(this));

            if (bal > 0) {
                IERC20(AG_DENARIUS).safeApprove(REWARDS_STORAGE, bal);
                IJarvisRewards(REWARDS_STORAGE).claim(bal);
            }
        }
    }

    // Kyber doesn't solve all the tokens so we only use it when needed
    // like agDEN => USDC and then the USDC => want is swapped on
    // a regular exchange
    function _swapRewardsOnKyber() internal {
        for (uint i = 0; i < kyberRewards.length; i++) {
            address _rewardToken = kyberRewards[i];

            // just in case
            if (kyberRewardRoute[_rewardToken][0] != address(0) && kyberRewardPathRoute[_rewardToken][0] != address(0)) {
                uint _balance = IERC20(_rewardToken).balanceOf(address(this));

                if (_balance > 0) {
                    address _pseudoWant =                         kyberRewardRoute[_rewardToken][kyberRewardRoute[_rewardToken].length - 1];
                    uint expected = _expectedForSwap(
                        _balance, _rewardToken, _pseudoWant
                    );

                    if (expected > 1) {
                        IERC20(_rewardToken).safeApprove(kyberExchange, _balance);

                        IDMMRouter(kyberExchange).swapExactTokensForTokens(
                            _balance,
                            expected,
                            kyberRewardPathRoute[_rewardToken],
                            kyberRewardRoute[_rewardToken],
                            address(this),
                            block.timestamp + 60
                        );
                    }
                }
            }
        }
    }

    function _swapRewards() internal {
        for (uint i = 0; i < rewardTokens.length; i++) {
            address rewardToken = rewardTokens[i];
            uint _balance = IERC20(rewardToken).balanceOf(address(this));

            if (_balance > 0) {
                address _pseudoWant = rewardToWantRoute[rewardToken][rewardToWantRoute[rewardToken].length - 1];
                uint expected = _expectedForSwap(_balance, rewardToken, _pseudoWant);
                // Want price sometimes is too high so it requires a lot of rewards to swap
                if (expected > 1) {
                    address _rewardExchange = exchange;

                    if (rewardExchange[rewardToken] != address(0)) {
                        _rewardExchange = rewardExchange[rewardToken];
                    }

                    IERC20(rewardToken).safeApprove(_rewardExchange, _balance);
                    IUniswapRouter(_rewardExchange).swapExactTokensForTokens(
                        _balance, expected, rewardToWantRoute[rewardToken], address(this), block.timestamp + 60
                    );
                }
            }
        }
    }

    function _minAgEurToAgEurCrv(uint _amount) internal view returns (uint) {
        // Based on virtual_price (poolMinVirtualPrice) and poolSlippageRatio
        // the expected amount is represented with 18 decimals as crvAgEur token
        // so we have to add 10 decimals to the agEur balance.
        // E.g. 1e8 (1AGEUR) * 1e10 * 99.4 / 100.0 => 0.994e18 AGEURCRV tokens
        return _amount * WANT_MISSING_PRECISION * (RATIO_PRECISION - poolSlippageRatio - poolMinVirtualPrice) / RATIO_PRECISION;
    }

    function _agEurToAgEurCrvDoubleCheck(uint _amount, bool _isDeposit) internal view returns (uint agEurCrvAmount) {
        uint[2] memory amounts = [_amount, 0];
        // calc_token_amount doesn't consider fee
        agEurCrvAmount = ICurvePool(CURVE_POOL).calc_token_amount(amounts, _isDeposit);
        // Remove max fee
        agEurCrvAmount = agEurCrvAmount * (RATIO_PRECISION - poolSlippageRatio) / RATIO_PRECISION;

        // In case the pool is unbalanced (attack), make a double check for
        // the expected amount with minExpected set ratios.
        uint agEurToAgEurCrv = _minAgEurToAgEurCrv(_amount);

        if (agEurToAgEurCrv > agEurCrvAmount) { agEurCrvAmount = agEurToAgEurCrv; }
    }

    // Calculate at least xx% of the expected. The function doesn't
    // consider the fee.
    function _agEurCrvToAgEurDoubleCheck(uint _balance) internal view returns (uint expected) {
        expected = (
            _calc_withdraw_one_coin(_balance) * (RATIO_PRECISION - poolSlippageRatio)
        ) / RATIO_PRECISION;

        // Double check for expected value
        // In this case we sum the poolMinVirtualPrice and divide by 1e10 because we want to swap AGEURCRV => agEUR
        uint minExpected = _balance *
            (RATIO_PRECISION + poolMinVirtualPrice - poolSlippageRatio) /
            RATIO_PRECISION /
            WANT_MISSING_PRECISION;

        if (minExpected > expected) { expected = minExpected; }
    }

    function _calc_withdraw_one_coin(uint _amount) internal view returns (uint) {
        if (_amount > 0) {
            return ICurvePool(CURVE_POOL).calc_withdraw_one_coin(_amount, 0);
        } else {
            return 0;
        }
    }

    function agEurCRVBalance() public view returns (uint) {
        return IERC20(AGEURCRV).balanceOf(address(this));
    }

    function balanceOfPool() public view override returns (uint) {
        (uint256 _amount,) = IJarvisPool(JARVIS_POOL).userInfo(JARVIS_POOL_ID, address(this));

        return _amount;
    }

    function balanceOfPoolInWant() public view override returns (uint) {
        return _calc_withdraw_one_coin(balanceOfPool());
    }

    // Kyber to be extract
    mapping(address => address[]) public kyberRewardPathRoute;
    mapping(address => address[]) public kyberRewardRoute;
    address public kyberExchange;
    address[] public kyberRewards;

    mapping(address => address) public rewardExchange;


    // This one is a little "hack" to bypass the want validation
    // from `setRewardToWantRoute`
    function setRewardToTokenRoute(address _reward, address[] calldata _route) external onlyAdmin nonReentrant {
        require(_reward != address(0), "!ZeroAddress");
        require(_route[0] == _reward, "First route isn't reward");

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

    function setRewardExchange(address _reward, address _exchange) external onlyAdmin nonReentrant {
        require(_exchange != address(0), "!ZeroAddress");
        require(_reward != address(0), "!ZeroAddress");
        require(rewardExchange[_reward] != _exchange, "!ZeroAddress");

        rewardExchange[_reward] = _exchange;
    }

    function setKyberExchange(address _kyberExchange) external onlyAdmin nonReentrant {
        require(_kyberExchange != kyberExchange, "Same address");
        require(_kyberExchange != address(0), "!ZeroAddress");

        kyberExchange = _kyberExchange;
    }

    function setKyberRewardPathRoute(address _reward, address[] calldata _path) external onlyAdmin {
        require(_reward != address(0), "!ZeroAddress");
        require(_path[0] != address(0), "!ZeroAddress path");

        bool newReward = true;
        for (uint i = 0; i < kyberRewards.length; i++) {
            if (kyberRewards[i] == _reward) {
                newReward = false;
                break;
            }
        }

        if (newReward) { kyberRewards.push(_reward); }
        kyberRewardPathRoute[_reward] = _path;
    }

    function setKyberRewardRoute(address _reward, address[] calldata _route) external onlyAdmin {
        require(_reward != address(0), "!ZeroAddress");
        require(_route[0] == _reward, "First route isn't reward");
        require(_route.length > 1, "Can't have less than 2 tokens");

        bool newReward = true;
        for (uint i = 0; i < kyberRewards.length; i++) {
            if (kyberRewards[i] == _reward) {
                newReward = false;
                break;
            }
        }

        if (newReward) { kyberRewards.push(_reward); }
        kyberRewardRoute[_reward] = _route;
    }
}
