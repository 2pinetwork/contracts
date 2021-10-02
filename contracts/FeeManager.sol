//SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
// import "hardhat/console.sol";
import "../interfaces/IUniswapRouter.sol";

interface IPiVault {
    function piToken() external view returns (address);
}

contract FeeManager is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant HARVEST_ROLE = keccak256("HARVEST_ROLE");

    // Tokens used
    address public constant wNative = address(0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f); // test
    address constant public piToken = address(0x5095d3313C76E8d29163e40a0223A5816a8037D8); // Test
    // address public constant wNative = address(0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889); // Mumbai
    // address constant public piToken = address(0x913C1E1a34B60a80F16c64c83E3D74695F492567); // Mumbai

    address public treasury;
    address public piVault;
    address public exchange;

    // Fee constants
    uint constant public TREASURY_PART = 150;
    uint constant public MAX = 1000;

    constructor(address _treasury, address _piVault, address _exchange) {
        require(IPiVault(_piVault).piToken() == piToken, "Not PiToken vault");
        treasury = _treasury;
        piVault = _piVault;
        exchange = _exchange;

        IERC20(wNative).safeApprove(exchange, type(uint).max);

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(HARVEST_ROLE, msg.sender);
    }

    event NewTreasury(address oldTreasury, address newTreasury);
    event NewExchange(address oldExchange, address newExchange);

    modifier onlyAdmin {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Only Admin");
        _;
    }

    function harvest(address _token, uint _ratio) external nonReentrant {
        require(hasRole(HARVEST_ROLE, msg.sender), "Only harvest role");
        uint _balance = IERC20(_token).balanceOf(address(this));

        if (_balance <= 0) { return; }

        // _ratio is a 9 decimals ratio number calculated by the
        // caller before call harvest to get the minimum amount of 2Pi-tokens.
        // So the _balance is multiplied by the ratio and then divided by 9 decimals
        // to get the same "precision". Then the result should be divided for the
        // decimal diff between tokens.
        // E.g _token is WMATIC with 18 decimals:
        // _ratio = 522_650_000 (0.52265 WMATIC/2Pi)
        // __balance = 1e18 (1.0 WMATIC)
        // tokenDiffPrecision = 1e9 ((1e18 MATIC decimals / 1e18 2Pi decimals) * 1e9 ratio precision)
        // expected = 522650000000000000 (1e18 * 522_650_000 / 1e9) [0.52 in 2Pi decimals]
        uint tokenDiffPrecision = ((10 ** IERC20Metadata(_token).decimals()) / 1e18) * 1e9;
        uint expected = _balance * _ratio / tokenDiffPrecision;

        bool native = _token == wNative;

        address[] memory route = new address[](native ? 2 : 3);
        route[0] = _token;

        if (native) {
            route[1] = piToken;
        } else {
            IERC20(_token).safeApprove(exchange, _balance);

            route[1] = wNative;
            route[2] = piToken;
        }

        IUniswapRouter(exchange).swapExactTokensForTokens(
            _balance, expected, route, address(this), block.timestamp + 60
        );

        uint piBalance = IERC20(piToken).balanceOf(address(this));
        uint treasuryPart = piBalance * TREASURY_PART / MAX;

        IERC20(piToken).safeTransfer(treasury, treasuryPart);
        IERC20(piToken).safeTransfer(piVault, piBalance - treasuryPart);
    }

    function setTreasury(address _treasury) external onlyAdmin nonReentrant {
        emit NewTreasury(treasury, _treasury);
        treasury = _treasury;
    }

    function setExchange(address _exchange) external onlyAdmin nonReentrant {
        emit NewExchange(exchange, _exchange);

        IERC20(wNative).safeApprove(exchange, 0);

        exchange = _exchange;
        IERC20(wNative).safeApprove(exchange, type(uint).max);
    }
}
