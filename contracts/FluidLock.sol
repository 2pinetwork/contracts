// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "@superfluid-finance/ethereum-contracts/contracts/apps/SuperAppBase.sol";

import {
    ISuperfluid,
    ISuperToken,
    ISuperApp,
    ISuperAgreement,
    SuperAppDefinitions
} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";

import {
    IConstantFlowAgreementV1
} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/IConstantFlowAgreementV1.sol";

contract FluidLock is SuperAppBase, Ownable, ReentrancyGuard {
    // ISuperfluid private _host = address(0x3E14dC1b13c488a8d5D310918780c983bD5982E7); // Matic
    ISuperfluid private _host = ISuperfluid(address(0xEB796bdb90fFA0f28255275e16936D25d3418603)); // Mumbai
    // IConstantFlowAgreementV1 private _cfa = address(0x6EeE6060f715257b970700bc2656De21dEdF074C); // Matic
    IConstantFlowAgreementV1 private _cfa = IConstantFlowAgreementV1(address(0x49e565Ed1bdc17F3d220f72DF0857C26FA83F873)); // Mumbai
    ISuperToken private _acceptedToken; // accepted token

    mapping(uint => address) public founders;
    mapping(uint => address) public investors;

    uint foundersCount = 3;
    uint investorsCount;

    // uint foundersMax = 1500000e18; // 1.5M x 3 founders 500k each
    // uint investorsMax;
    uint foundersAmount = 500000e18;

    mapping(address => uint) public investorsAmount;

    constructor() {
        uint256 configWord =
            SuperAppDefinitions.APP_LEVEL_FINAL | // app that not interact with any other
            SuperAppDefinitions.BEFORE_AGREEMENT_CREATED_NOOP | // Ignore callback
            SuperAppDefinitions.BEFORE_AGREEMENT_UPDATED_NOOP | // Ignore callback
            SuperAppDefinitions.BEFORE_AGREEMENT_TERMINATED_NOOP; // Ignore callback

        _host.registerApp(configWord);

        // Init founders map
        founders[0] = address(0x0);
        founders[1] = address(0x0);
        founders[2] = address(0x0);
    }

    function addInvestor(address _wallet, uint _amount) external onlyOwner{
        require(investorsAmount[_wallet] <= 0, "Already added");
        investors[investorsCount] = _wallet;
        investorsCount += 1;
        investorsAmount[_wallet] = _amount;
    }

    function afterAgreementCreated(
        ISuperToken superToken,
        address agreementClass,
        bytes32 agreementId,
        bytes calldata agreementData,
        bytes calldata /*cbdata*/,
        bytes calldata ctx
    )
    external override
    onlyHost
    returns(bytes memory newCtx)
    {
        require(agreementClass == address(_cfa));
        require(msg.sender == owner(), "!owner");
    }

    function afterAgreementUpdated(
        ISuperToken /*superToken*/,
        address /*agreementClass*/,
        bytes32 /*agreementId*/,
        bytes calldata /*agreementData*/,
        bytes calldata /*cbdata*/,
        bytes calldata /*ctx*/
    ) external override returns (bytes memory /*newCtx*/) {
        // if () {

        // }
    }

    function afterAgreementTerminated(
        ISuperToken /*superToken*/,
        address /*agreementClass*/,
        bytes32 /*agreementId*/,
        bytes calldata /*agreementData*/,
        bytes calldata /*cbdata*/,
        bytes calldata /*ctx*/
    ) external override returns (bytes memory /*newCtx*/) {

    }

    function _isSameToken(ISuperToken superToken) private view returns (bool) {
        return address(superToken) == address(_acceptedToken);
    }

    function _isCFAv1(address agreementClass) private view returns (bool) {
        return ISuperAgreement(agreementClass).agreementType()
        == keccak256("org.superfluid-finance.agreements.ConstantFlowAgreement.v1");
    }

    modifier onlyHost() {
        require(msg.sender == address(_host), "RedirectAll: support only one host");
        _;
    }

    modifier onlyExpected(ISuperToken superToken, address agreementClass) {
        require(_isSameToken(superToken), "RedirectAll: not accepted token");
        require(_isCFAv1(agreementClass), "RedirectAll: only CFAv1 supported");
        _;
    }

}
