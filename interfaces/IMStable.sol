// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

interface IMToken is IERC20Metadata {
    function mint(address _input, uint256 _inputQuantity, uint256 _minOutputQuantity, address _recipient) external returns (uint256 mintOutput);
    function getMintOutput(address _input, uint256 _inputQuantity) external view  returns (uint256 mintOutput);
    function redeem(address _output, uint256 _mAssetQuantity, uint256 _minOutputQuantity, address _recipient) external returns (uint256 outputQuantity);
    function getRedeemOutput(address _output, uint256 _mAssetQuantity) external view returns (uint256 bAssetOutput);
}

interface IIMToken is IERC20Metadata {
    function exchangeRate() external view returns (uint256);
    function depositSavings(uint256 _underlying) external returns (uint256 creditsIssued);
    function redeemUnderlying(uint256 _underlying) external returns (uint256 creditsBurned);
}

interface IMVault {
    function balanceOf(address) external view returns (uint256);
    function stake(uint256 _amount) external;
    function withdraw(uint256 _amount) external;
    function claimReward() external;
}
