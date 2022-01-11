// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "hardhat/console.sol";

import "./ControllerStratAbs.sol";
import "../interfaces/IBalancer.sol";

contract ControllerBalancerV2Strat is ControllerStratAbs {
    using SafeERC20 for IERC20;
    using SafeERC20 for IERC20Metadata;

    bytes32 public constant HARVESTER_ROLE = keccak256("HARVESTER_ROLE");

    bytes32 public immutable poolId;
    IBalancerV2Vault public immutable vault;

    // Pool settings
    // JoinKind { INIT = 0, EXACT_TOKENS_IN_FOR_BPT_OUT = 1, TOKEN_IN_FOR_EXACT_BPT_OUT = 2}
    uint public constant JOIN_KIND = 1;
    // ExitKind {EXACT_BPT_IN_FOR_ONE_TOKEN_OUT = 0, EXACT_BPT_IN_FOR_TOKENS_OUT = 1, BPT_IN_FOR_EXACT_TOKENS_OUT = 2}
    uint public constant EXACT_BPT_IN_FOR_ONE_TOKEN_OUT = 0;
    uint public constant BPT_IN_FOR_EXACT_TOKENS_OUT = 2;
    uint public constant SHARES_PRECISION = 1e18; // same as BPT token
    IBalancerDistributor public immutable distributor = IBalancerDistributor(0x0F3e0c4218b7b0108a3643cFe9D3ec0d4F57c54e);

    constructor(
        IBalancerV2Vault _vault,
        bytes32 _poolId,
        IERC20Metadata _want,
        address _controller,
        address _exchange,
        address _treasury
    ) ControllerStratAbs(_want, _controller, _exchange, _treasury){
        require(_poolId != "", "Empty poolId");

        vault = _vault;
        poolId = _poolId;

        require(_assets().length > 0, "Vault without tokens");
        _setupRole(HARVESTER_ROLE, msg.sender);
    }

    function claimRewards(BalancerV2Claim[] memory _claims, IERC20[] memory _claimTokens) public nonReentrant {
        require(hasRole(HARVESTER_ROLE, msg.sender), "Not a harvester");

        distributor.claimDistributions(
            address(this),
            _claims,
            _claimTokens
        );
    }

    function harvest() public nonReentrant override {
        require(hasRole(HARVESTER_ROLE, msg.sender), "Not a harvester");
        uint _before = wantBalance();

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

    function _deposit() internal override {
        IAsset[] memory tokens = _assets();
        uint[] memory amounts = new uint[](tokens.length);

        uint _balance = wantBalance();

        amounts[_tokenIndex(tokens)] = _balance;

        uint expected = _balance * WANT_MISSING_PRECISION * SHARES_PRECISION / _pricePerShare();

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

    // amount is the want expected to be withdrawn
    function _withdraw(uint _amount) internal override returns (uint) {
        IAsset[] memory tokens = _assets();
        uint[] memory amounts = new uint[](tokens.length);

        uint _balance = wantBalance();
        if (_balance < _amount) {
            uint diff = _amount - _balance;
            amounts[_tokenIndex(tokens)] = diff;

            // We put a little more than the expected amount because of the fees & the pool swaps
            uint expected = (
                diff * WANT_MISSING_PRECISION * SHARES_PRECISION *
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

        return wantBalance() - _balance;
    }

    function _withdrawAll() internal override returns (uint) {
        IAsset[] memory tokens = _assets();
        uint[] memory amounts = new uint[](tokens.length);

        uint _balance = wantBalance();
        uint bpt_balance = balanceOfPool();
        uint index = 0;

        uint expected = (
            bpt_balance * _pricePerShare() *
            (RATIO_PRECISION - poolSlippageRatio) / RATIO_PRECISION /
            WANT_MISSING_PRECISION / SHARES_PRECISION
        );

        require(expected > 0, "Insufficient expected amount");

        index = _tokenIndex(tokens);
        amounts[index] = expected;

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
        return wantBalance() - _balance;
    }

    function balanceOfPool() public view override returns (uint) {
        (address pool,) = vault.getPool(poolId);
        return IERC20(pool).balanceOf(address(this));
    }
    function balanceOfPoolInWant() public view override returns (uint) {
        return balanceOfPool() * _pricePerShare() / WANT_MISSING_PRECISION / SHARES_PRECISION;
    }

    function _pricePerShare() internal view returns (uint) {
        (address pool,) = vault.getPool(poolId);

        uint rate = IBalancerPool(pool).getRate();

        require(rate > 1e18, "Under 1");

        return rate;
    }

    function _assets() internal view returns (IAsset[] memory assets) {
        (IERC20[] memory poolTokens,,) = vault.getPoolTokens(poolId);
        assets = new IAsset[](poolTokens.length);
        console.log("Tu vieja: ", poolTokens.length);
        console.log("Tu vieja: ", address(poolTokens[0]));
        console.log("Tu vieja: ", address(poolTokens[1]));
        console.log("Tu vieja: ", address(poolTokens[2]));


        for (uint i = 0; i < poolTokens.length; i++) {
            assets[i] = IAsset(address(poolTokens[i]));
        }
    }

    function _tokenIndex(IAsset[] memory tokens) internal view returns (uint i) {
        for (i; i < tokens.length; i++) {
            // assign index of want
            if (address(tokens[i]) == address(want)) { break; }
        }
    }
}
