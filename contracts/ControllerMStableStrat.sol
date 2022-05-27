// SPDX-License-Identifier: MIT

pragma solidity 0.8.13;

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
    ) ControllerStratAbs(_want, _controller, _exchange, _treasury) {}

    function identifier() external view returns (string memory) {
        return string(abi.encodePacked(want.symbol(), "@mStable#1.0.0"));
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
        uint wantBal = _compensateDeposit(wantBalance());

        if (wantBal > 0) {
            uint expected = _wantToMusdDoubleCheck(wantBal);

            want.safeApprove(MTOKEN, wantBal);
            IMToken(MTOKEN).mint(address(want), wantBal, expected, address(this));
        }

        uint mBalance = IERC20(MTOKEN).balanceOf(address(this));

        if (mBalance > 0) {
            uint expected = _musdAmountToImusd(mBalance) * (RATIO_PRECISION - poolSlippageRatio) / RATIO_PRECISION;
            IERC20(MTOKEN).safeApprove(IMTOKEN, mBalance);
            uint credits = IIMToken(IMTOKEN).depositSavings(mBalance);

            require(credits >= expected, "less credits than expected");

            IERC20(IMTOKEN).safeApprove(VAULT, credits);
            IMVault(VAULT).stake(credits);
        }
    }

    function _claimRewards() internal override {
        IMVault(VAULT).claimReward();
    }

    // amount is the `want` expected to be withdrawn
    function _withdraw(uint _amount) internal override returns (uint) {
        uint wantBal = wantBalance();

        _withdrawFromPool(
            _wantToPoolToken(_amount)
        );

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

        uint _amount = _imusdAmountToMusd(_balance);
        uint expected = _amount / WANT_MISSING_PRECISION * (RATIO_PRECISION - poolSlippageRatio) / RATIO_PRECISION;

        IIMToken(IMTOKEN).redeemUnderlying(_amount);
        IMToken(MTOKEN).redeem(address(want), _amount, expected, address(this));
    }

    function _wantToMusdDoubleCheck(uint _amount) internal view returns (uint minOut) {
        if (_amount <= 0) { return 0; }

        minOut = IMToken(MTOKEN).getMintOutput(address(want), _amount);

        // want <=> mUSD is almost 1:1
        uint expected = _amount * WANT_MISSING_PRECISION * (RATIO_PRECISION - poolSlippageRatio) / RATIO_PRECISION;

        if (expected > minOut) { minOut = expected; }
    }

    function balanceOfPool() public view override returns (uint) {
        return IMVault(VAULT).balanceOf(address(this));
    }

    function balanceOfPoolInWant() public view override returns (uint) {
        return _musdAmountToWant(
            _imusdAmountToMusd(
                balanceOfPool()
            )
        );
    }

    function _musdAmountToWant(uint _amount) internal view returns (uint) {
        if (_amount <= 0) { return 0; }

        return IMToken(MTOKEN).getRedeemOutput(address(want), _amount);
    }

    function _musdAmountToImusd(uint _amount) internal view returns (uint) {
        return _amount * (10 ** IIMToken(IMTOKEN).decimals()) / IIMToken(IMTOKEN).exchangeRate();
    }

    function _imusdAmountToMusd(uint _amount) internal view returns (uint) {
        return _amount * IIMToken(IMTOKEN).exchangeRate() / (10 ** IIMToken(IMTOKEN).decimals());
    }

    function _wantToPoolToken(uint _amount) internal view returns (uint) {
        return _musdAmountToImusd(
            _wantToMusdDoubleCheck(_amount)
        );
    }
}
