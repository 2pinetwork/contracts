//SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
// import "hardhat/console.sol";

import "./Swappable.sol";

interface IPiVault {
    function piToken() external view returns (address);
}

// Swappable contract has the AccessControl module
contract FeeManager is ReentrancyGuard, Swappable {
    using SafeERC20 for IERC20;

    // Tokens used
    address public constant wNative = address(0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f); // test
    address public constant piToken = address(0x5095d3313C76E8d29163e40a0223A5816a8037D8); // Test
    // address public constant wNative = address(0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889); // Mumbai
    // address constant public piToken = address(0x913C1E1a34B60a80F16c64c83E3D74695F492567); // Mumbai

    address public treasury;
    address public piVault;
    address public exchange;

    // Fee constants
    uint public treasuryRatio = 150;

    mapping(address => address[]) public routes;

    constructor(address _treasury, address _piVault, address _exchange) {
        require(_treasury != address(0), "!ZeroAddress treasury");
        require(_exchange != address(0), "!ZeroAddress exchange");
        require(IPiVault(_piVault).piToken() == piToken, "Not PiToken vault");
        treasury = _treasury;
        piVault = _piVault;
        exchange = _exchange;
    }

    event NewTreasury(address oldTreasury, address newTreasury);
    event NewExchange(address oldExchange, address newExchange);
    event Harvest(address _token, uint _tokenAmount, uint piTokenAmount);

    function harvest(address _token) external nonReentrant {
        uint _balance = IERC20(_token).balanceOf(address(this));

        if (_balance <= 0) { return; }

        bool native = _token == wNative;
        address[] memory route;

        if (routes[_token].length > 0) {
            route = routes[_token];
        } else {
            route = new address[](native ? 2 : 3);
            route[0] = _token;

            if (native) {
                route[1] = piToken;
            } else {
                route[1] = wNative;
                route[2] = piToken;
            }
        }

        uint expected = _expectedForSwap(_balance, _token, piToken);
        IERC20(_token).safeApprove(exchange, _balance);
        IUniswapRouter(exchange).swapExactTokensForTokens(
            _balance, expected, route, address(this), block.timestamp + 60
        );

        uint piBalance = IERC20(piToken).balanceOf(address(this));
        uint treasuryPart = piBalance * treasuryRatio / RATIO_PRECISION;

        IERC20(piToken).safeTransfer(treasury, treasuryPart);
        IERC20(piToken).safeTransfer(piVault, piBalance - treasuryPart);

        emit Harvest(_token, _balance, piBalance);
    }

    function setTreasury(address _treasury) external onlyAdmin nonReentrant {
        require(_treasury != address(0), "!ZeroAddress");
        emit NewTreasury(treasury, _treasury);
        treasury = _treasury;
    }

    function setExchange(address _exchange) external onlyAdmin nonReentrant {
        require(_exchange != address(0), "!ZeroAddress");
        emit NewExchange(exchange, _exchange);

        exchange = _exchange;
    }

    function setRoute(address _token, address[] calldata _route) external onlyAdmin {
        require(_token != address(0), "!ZeroAddress");
        require(_route.length > 2, "Invalid route");

        for (uint i = 0; i < _route.length; i++) {
            require(_route[i] != address(0), "Route with ZeroAddress");
        }

        routes[_token] = _route;
    }
}
