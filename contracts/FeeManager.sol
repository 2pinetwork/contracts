//SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "../interfaces/IUniswapRouter.sol";

interface IPiVault {
    function piToken() external view returns (address);
}

contract FeeManager is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant HARVEST_ROLE = keccak256("HARVEST_ROLE");

    // Tokens used
    address public constant wNative = address(0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f); // test
    address constant public piToken = address(0xCfaa0489f27b8A6980DeA5134f32516c755B7e63); // Test
    // address constant public piToken = address(0xCa3F508B8e4Dd382eE878A314789373D80A5190A);

    address public treasury;
    address public piVault;
    address public exchange;

    // Fee constants
    uint constant public TREASURY_PART = 150;
    uint constant public VAULT_PART = 850;
    uint constant public MAX = 1000;

    address[] public wNativeToPiRoute = [wNative, piToken];

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

    function harvest(uint _nativeTo2Pi) external nonReentrant {
        require(hasRole(HARVEST_ROLE, msg.sender), "Only harvest role");
        uint balance = IERC20(wNative).balanceOf(address(this));

        // _nativeTo2Pi is a 9 decimals ratio number calculated by the
        // caller before call harvest to get the minimum amount of 2Pi-tokens.
        // So the balance is multiplied by the ratio and then divided by 9 decimals
        // to get the same "precision". Then the result should be divided for the
        // decimal diff between tokens.
        // E.g wNative is WMATIC with 18 decimals:
        // _nativeTo2Pi = 522_650_000 (0.52265 WMATIC/2Pi)
        // _balance = 1e18 (1.0 WMATIC)
        // tokenDiffPrecision = 1e9 (Default 1e9 ratio precision) wNative & 2Pi both have 18 decimals
        // expected = 522650000000000000 (1e18 * 522_650_000 / 1e9) [0.52 in 2Pi decimals]
        uint tokenDiffPrecision = 1e9;
        uint expected = balance * _nativeTo2Pi / tokenDiffPrecision;

        IUniswapRouter(exchange).swapExactTokensForTokens(
            balance, expected, wNativeToPiRoute, address(this), block.timestamp + 60
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

    // Rescue locked funds sent by mistake that
    function inCaseTokensGetStuck(address _token) external onlyAdmin nonReentrant {
        require(_token != wNative, "!safe");
        require(_token != piToken, "!safe");

        uint amount = IERC20(_token).balanceOf(address(this));
        IERC20(_token).safeTransfer(msg.sender, amount);
    }
}
