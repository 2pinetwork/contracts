// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

import "hardhat/console.sol";

import "./ControllerStratAbs.sol";
import "../interfaces/IBalancer.sol";
import "../libraries/Bytes32Utils.sol";

contract ControllerBalancerV2Strat is ControllerStratAbs {
    using SafeERC20 for IERC20;
    using SafeERC20 for IERC20Metadata;
    using Bytes32Utils for bytes32;

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

    address public constant GAUGE = address(0x72843281394E68dE5d55BCF7072BB9B2eBc24150);

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


    function identifier() external view returns (string memory) {
        return string(abi.encodePacked(
            want.symbol(),
            "-0x",
            poolId.toString(),
            "@BalancerV2#1.0.0"
        ));
    }

    function _claimRewards() internal override {
        bool _claim = false;

        for (uint i = 0; i < rewardTokens.length; i++) {
            address reward = rewardTokens[i];

            if (IBalancerGauge(GAUGE).claimable_reward(address(this), reward) > 0) {
                _claim = true;
                break;
            }
        }

        if (_claim) { IBalancerGauge(GAUGE).claim_rewards(); }
    }

    function _deposit() internal override {
        uint _balance = wantBalance();

        if (_balance > 0) {
            IAsset[] memory tokens = _assets();
            uint[] memory amounts = new uint[](tokens.length);


            amounts[_tokenIndex(tokens)] = _balance;

            uint expected = (
                _balance * WANT_MISSING_PRECISION * SHARES_PRECISION *
                (RATIO_PRECISION - poolSlippageRatio) / RATIO_PRECISION /
                _pricePerShare()
            );

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
        }

        // Stake
        uint _amount =  balanceOfVaultPool();
        if (_amount > 0) {
            IERC20(pool()).safeApprove(GAUGE, _amount);
            IBalancerGauge(GAUGE).deposit(_amount);
        }
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

            // In case that the calc gives a little more than the balance
            uint _balanceOfPool = balanceOfPool();
            if (expected > _balanceOfPool) { expected = _balanceOfPool; }

            //Unstake
            IBalancerGauge(GAUGE).withdraw(expected);
            require(balanceOfVaultPool() >= expected, "Gauge gave less than expected");

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

        uint withdrawn = wantBalance() - _balance;

        return (withdrawn > _amount) ? _amount : withdrawn;
    }

    function _withdrawAll() internal override returns (uint) {
        IAsset[] memory tokens = _assets();
        uint[] memory amounts = new uint[](tokens.length);

        uint _balance = wantBalance();

        //Unstake
        uint stakedBalance = balanceOfPool();
        IBalancerGauge(GAUGE).withdraw(stakedBalance);
        require(balanceOfVaultPool() >= stakedBalance, "Gauge gave less than expected");

        uint index = 0;
        uint bptBalance = balanceOfVaultPool();

        uint expected = (
            bptBalance * _pricePerShare() *
            (RATIO_PRECISION - poolSlippageRatio) / RATIO_PRECISION /
            WANT_MISSING_PRECISION / SHARES_PRECISION
        );

        require(expected > 0, "Insufficient expected amount");

        index = _tokenIndex(tokens);
        amounts[index] = expected;

        // Withdraw all the BPT directly
        bytes memory userData = abi.encode(EXACT_BPT_IN_FOR_ONE_TOKEN_OUT, bptBalance, index);

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
        uint withdrawn = wantBalance() - _balance;

        require(withdrawn >= expected, "Less tokens than expected");

        return withdrawn;
    }

    function pool() public view returns (address _pool) {
        (_pool,) = vault.getPool(poolId);
    }

    function balanceOfVaultPool() public view returns (uint) {
        return IERC20(pool()).balanceOf(address(this));
    }

    function balanceOfPool() public view override returns (uint) {
        return IERC20(GAUGE).balanceOf(address(this));
    }

    function balanceOfPoolInWant() public view override returns (uint) {
        return balanceOfPool() * _pricePerShare() / WANT_MISSING_PRECISION / SHARES_PRECISION;
    }

    function _pricePerShare() internal view returns (uint) {
        uint rate = IBalancerPool(pool()).getRate();

        require(rate > 1e18, "Under 1");

        return rate;
    }

    function _assets() internal view returns (IAsset[] memory assets) {
        (IERC20[] memory poolTokens,,) = vault.getPoolTokens(poolId);
        assets = new IAsset[](poolTokens.length);

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
