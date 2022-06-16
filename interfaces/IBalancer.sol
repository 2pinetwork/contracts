// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity 0.8.15;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @dev This is an empty interface used to represent either ERC20-conforming token contracts or ETH (using the zero
 * address sentinel value). We're just relying on the fact that `interface` can be used to declare new address-like
 * types.
 *
 * This concept is unrelated to a Pool's Asset Managers.
 */
interface IAsset {
    // solhint-disable-previous-line no-empty-blocks
}

interface IBalancerV2Vault {
    function joinPool(
        bytes32 poolId,
        address sender,
        address recipient,
        JoinPoolRequest memory request
    ) external payable;

    struct JoinPoolRequest {
        IAsset[] assets;
        uint256[] maxAmountsIn;
        bytes userData;
        bool fromInternalBalance;
    }

    function exitPool(
        bytes32 poolId,
        address sender,
        address payable recipient,
        ExitPoolRequest memory request
    ) external;

    struct ExitPoolRequest {
        IAsset[] assets;
        uint256[] minAmountsOut;
        bytes userData;
        bool toInternalBalance;
    }

    function getPoolTokens(bytes32 poolId)
    external
    view
    returns (
        IERC20[] memory tokens,
        uint256[] memory balances,
        uint256 lastChangeBlock
    );

    function getPool(bytes32 poolId) external view returns (address, uint8);
}

interface IBalancerPool {
    function getRate() external view returns (uint);
}

struct BalancerV2Claim {
    uint distributionId;
    uint balance;
    address distributor;
    uint tokenIndex;
    bytes32[] merkleProof;
}

interface IBalancerDistributor {
    function claimDistributions(address claimer, BalancerV2Claim[] memory claims, IERC20[] memory tokens) external;
}

interface IBalancerGauge {
    function deposit(uint amount) external;
    function withdraw(uint amount) external;
    function claim_rewards() external;
    function claimable_reward(address, address) view external returns (uint);
}
