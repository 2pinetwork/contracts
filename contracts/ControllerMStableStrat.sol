// SPDX-License-Identifier: MIT

pragma solidity 0.8.11;

import "./ControllerStratAbs.sol";
import "../interfaces/IMStable.sol";

contract ControllerMStableStrat is ControllerStratAbs {
    using SafeERC20 for IERC20;
    using SafeERC20 for IERC20Metadata;

    address constant public MTOKEN = address(0xE840B73E5287865EEc17d250bFb1536704B43B21); // mUSD
    address constant public IMTOKEN = address(0x5290Ad3d83476CA6A2b178Cd9727eE1EF72432af); // imUSD
    address constant public VAULT = address(0x32aBa856Dc5fFd5A56Bcd182b13380e5C855aa29); // imUSD Vault

    constructor(
        IERC20Metadata _want,
        address _controller,
        address _exchange,
        address _treasury
    ) ControllerStratAbs(_want, _controller, _exchange, _treasury) {
    }

    function identifier() external pure returns (string memory) {
        return string("mUSD@mStable#1.0.0");
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
            uint minOut = IMToken(MTOKEN).getMintOutput(address(want), wantBal);
            uint expected = minOut * (RATIO_PRECISION - poolSlippageRatio - poolMinVirtualPrice) / RATIO_PRECISION;

            want.safeIncreaseAllowance(MTOKEN, wantBal);

            uint massetsMinted = IMToken(MTOKEN).mint(address(want), wantBal, expected, address(this));

            IERC20(MTOKEN).safeIncreaseAllowance(IMTOKEN, massetsMinted);

            uint credits = IIMToken(IMTOKEN).depositSavings(massetsMinted);

            IERC20(IMTOKEN).safeIncreaseAllowance(VAULT, credits);
            IMVault(VAULT).stake(credits);
        }
    }

    function _claimRewards() internal {
        IMVault(VAULT).claimReward();
    }

    function _swapRewards() internal {
        for (uint i = 0; i < rewardTokens.length; i++) {
            address rewardToken = rewardTokens[i];
            uint _balance = IERC20(rewardToken).balanceOf(address(this));

            if (_balance > 0) {
                uint expected = _expectedForSwap(_balance, rewardToken, address(want));

                // Want price sometimes is too high so it requires a lot of rewards to swap
                if (expected > 1) {
                    IERC20(rewardToken).safeApprove(exchange, _balance);

                    IUniswapRouter(exchange).swapExactTokensForTokens(
                        _balance, expected, rewardToWantRoute[rewardToken], address(this), block.timestamp + 60
                    );
                }
            }
        }
    }

    // amount is the `want` expected to be withdrawn
    function _withdraw(uint _amount) internal override returns (uint) {
        uint wantBal = wantBalance();

        _withdrawFromPool(_amount);

        return wantBalance() - wantBal;
    }

    function _withdrawAll() internal override returns (uint) {
        uint wantBal = wantBalance();

        _withdrawFromPool(balanceOfPool());

        return wantBalance() - wantBal;
    }

    function _withdrawFromPool(uint poolTokenAmount) internal {
        // Remove staked from vault
        IMVault(VAULT).withdraw(poolTokenAmount);

        uint _balance = IIMToken(IMTOKEN).balanceOf(address(this));

        require(_balance > 0, "redeem balance = 0");

        uint amount = _balance * IIMToken(IMTOKEN).exchangeRate() / 10 ** IIMToken(IMTOKEN).decimals();
        uint bAmount = amount / WANT_MISSING_PRECISION;
        uint expected = bAmount * (RATIO_PRECISION - poolSlippageRatio - poolMinVirtualPrice) / RATIO_PRECISION;

        IIMToken(IMTOKEN).redeemUnderlying(amount);
        IMToken(MTOKEN).redeem(address(want), amount, expected, address(this));
    }

    function _minWantToPoolToken(uint _amount) internal view returns (uint) {
        // Based on virtual_price (poolMinVirtualPrice) and poolSlippageRatio
        // the expected amount is represented with 18 decimals as POOL_TOKEN
        // so we have to add X decimals to the want balance.
        // E.g. 1e8 (1BTC) * 1e10 * 99.4 / 100.0 => 0.994e18 poolToken tokens
        return _amount * WANT_MISSING_PRECISION * (RATIO_PRECISION - poolSlippageRatio - poolMinVirtualPrice) / RATIO_PRECISION;
    }

    function balanceOfPool() public view override returns (uint) {
        return IMVault(VAULT).balanceOf(address(this));
    }

    function balanceOfPoolInWant() public view override returns (uint) {
        uint vaultBalance = IMVault(VAULT).balanceOf(address(this));
        uint rate = IIMToken(IMTOKEN).exchangeRate();
        uint decimals = IIMToken(IMTOKEN).decimals();

        // Since mUSD is 1:1 with the bAsset
        return vaultBalance * rate / 10 ** decimals / WANT_MISSING_PRECISION;
    }
}
