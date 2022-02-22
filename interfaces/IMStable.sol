// SPDX-License-Identifier: MIT

pragma solidity 0.8.11;

interface IMToken {
    function totalSupply() external returns (uint256);
    function balanceOf(address) external returns (uint256);
    function transfer() external returns (bool);
    function allowance() external returns (uint256);
    function approve() external returns (bool);
    function transferFrom() external returns (bool);
    function increaseAllowance() external returns (bool);
    function decreaseAllowance() external returns (bool);
    function mint(address _input, uint256 _inputQuantity, uint256 _minOutputQuantity, address _recipient) external returns (uint256 mintOutput);
    function mintMulti(address[] memory _inputs, uint256[] memory _inputQuantities, uint256 _minOutputQuantity, address _recipient) external returns (uint256 mintOutput);
    function getMintOutput(address _input, uint256 _inputQuantity) external returns (uint256 mintOutput);
    function getMintMultiOutput(address[] memory _inputs, uint256[] memory _inputQuantities) external returns (uint256 mintOutput);
    function swap(address _input, address _output, uint256 _inputQuantity, uint256 _minOutputQuantity, address _recipient) external returns (uint256 swapOutput);
    function getSwapOutput(address _input, address _output, uint256 _inputQuantity) external returns (uint256 swapOutput);
    function redeem(address _output, uint256 _mAssetQuantity, uint256 _minOutputQuantity, address _recipient) external returns (uint256 outputQuantity);
    function redeemMasset(uint256 _mAssetQuantity, uint256[] memory _minOutputQuantities, address _recipient) external returns (uint256[] memory outputQuantities);
    function redeemExactBassets(address[] memory _outputs, uint256[] memory _outputQuantities, uint256 _maxMassetQuantity, address _recipient) external returns (uint256 mAssetQuantity);
    function getRedeemOutput(address _output, uint256 _mAssetQuantity) external returns (uint256 bAssetOutput);
    function getRedeemExactBassetsOutput(address[] memory _outputs, uint256[] memory _outputQuantities) external returns (uint256 mAssetQuantity);
    function getBasket() external returns (bool, bool);
    function getPrice() external returns (uint256 price, uint256 k);
}

interface IIMToken {
    function totalSupply() external returns (uint256);
    function balanceOf(address) external returns (uint256);
    function decimals() external view returns (uint8);
    function exchangeRate() external view returns (uint256);
    function transfer() external returns (bool);
    function allowance() external returns (uint256);
    function approve() external returns (bool);
    function transferFrom() external returns (bool);
    function increaseAllowance() external returns (bool);
    function decreaseAllowance() external returns (bool);
    function balanceOfUnderlying(address _user) external returns (uint256 balance);
    function underlyingToCredits(uint256 _underlying) external returns (uint256 credits);
    function creditsToUnderlying(uint256 _credits) external returns (uint256 amount);
    function creditBalances(address _user) external returns (uint256);
    function preDeposit(uint256 _underlying, address _beneficiary) external returns (uint256 creditsIssued);
    function depositSavings(uint256 _underlying) external returns (uint256 creditsIssued);
    function depositSavings(uint256 _underlying, address _beneficiary) external returns (uint256 creditsIssued);
    function redeem() external returns (uint256 massetReturned);
    function redeemCredits(uint256 _credits) external returns (uint256 massetReturned);
    function redeemUnderlying(uint256 _underlying) external returns (uint256 creditsBurned);
    function poke() external;
}

interface IMVault {
    function balanceOf(address) external view returns (uint256);
    function balanceOfUnderlying(address) external view returns (uint256);
    function stake(uint256 _amount) external;
    function stake(address _beneficiary, uint256 _amount) external;
    function exit() external;
    function exit(uint256 _first, uint256 _last) external;
    function withdraw(uint256 _amount) external;
    function claimReward() external;
    function claimRewards() external;
    function claimRewards(uint256 _first, uint256 _last) external;
    function pokeBoost(address _account) external;
    function lastTimeRewardApplicable() external view returns (uint256);
    function rewardPerToken() external view returns (uint256);
    function earned(address _account) external view returns (uint256);
    function unclaimedRewards(address _account) external view returns (uint256 amount, uint256 first, uint256 last);
}

interface IMSaveWrapper {
    function saveAndStake(address _mAsset, address _save, address _vault, uint256 _amount) external;
    function saveViaMint(address _mAsset, address _bAsset, address _save, address _vault, uint256 _amount, uint256 _minOut, bool _stake) external;
    function saveViaSwap(address _mAsset, address _save, address _vault, address _feeder, address _fAsset, uint256 _fAssetQuantity, uint256 _minOutputQuantity, bool _stake) external;
    function saveViaUniswapETH(address _mAsset, address _save, address _vault, address _uniswap, uint256 _amountOutMin, address[] memory _path, uint256 _minOutMStable, bool _stake) external;
    function estimate_saveViaUniswapETH(address _mAsset, address _uniswap, uint256 _ethAmount, address[] memory _path) external returns (uint256 out);
}
