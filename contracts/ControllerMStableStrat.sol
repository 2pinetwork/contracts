// SPDX-License-Identifier: MIT

pragma solidity 0.8.13;

import "./ControllerStratAbs.sol";
import "../interfaces/IMStable.sol";

contract ControllerMStableStrat is ControllerStratAbs {
    using SafeERC20 for IERC20;
    using SafeERC20 for IERC20Metadata;

    bytes32 public constant CLAIMER_ROLE = keccak256("CLAIMER_ROLE");

    address constant public MTOKEN = address(0xE840B73E5287865EEc17d250bFb1536704B43B21); // mUSD
    address constant public IMTOKEN = address(0x5290Ad3d83476CA6A2b178Cd9727eE1EF72432af); // imUSD
    address constant public VAULT = address(0x32aBa856Dc5fFd5A56Bcd182b13380e5C855aa29); // imUSD Vault

    // Deposit compensation
    address public compensator;
    uint public compensateRatio = 1; // 0.01%

    // manual boosts
    uint public lastManualBoost;

    constructor(
        IERC20Metadata _want,
        address _controller,
        address _exchange,
        address _treasury
    ) ControllerStratAbs(_want, _controller, _exchange, _treasury) {
        compensator = msg.sender;
    }

    function identifier() external view returns (string memory) {
        return string(abi.encodePacked(want.symbol(), "@mStable#1.0.0"));
    }

    // This function is called to "boost" the strategy.
    function claimManualRewards(uint _amount) external {
        require(hasRole(CLAIMER_ROLE, msg.sender), "Not a claimer");

        // Charge performance fee for earned want
        _beforeMovement();

        // transfer reward from caller
        if (_amount > 0) { want.safeTransferFrom(msg.sender, address(this), _amount); }

        // Keep track of how much is added to calc boost APY
        lastManualBoost = _amount;

        // Deposit transfered amount
        _deposit();

        // update last_balance to exclude the manual reward from perfFee
        _afterMovement();
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

    // Compensation
    function setCompensateRatio(uint newRatio) external onlyAdmin {
        require(newRatio != compensateRatio, "same ratio");
        require(newRatio <= RATIO_PRECISION, "greater than 100%");
        require(newRatio >= 0, "less than 0%?");

        compensateRatio = newRatio;
    }

    function setCompensator(address _compensator) external onlyAdmin {
        require(_compensator != address(0), "!ZeroAddress");
        require(_compensator != compensator, "same address");

        compensator = _compensator;
    }

    function _compensateDeposit(uint _amount) internal returns (uint) {
        uint _comp = _amount * compensateRatio / RATIO_PRECISION;

        // Compensate only if we can...
        if (
            want.allowance(compensator, address(this)) >= _comp &&
            want.balanceOf(compensator) >= _comp
        ) {
            want.safeTransferFrom(compensator, address(this), _comp);
            _amount += _comp;
        }

        return _amount;
    }
}
