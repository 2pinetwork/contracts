// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

interface ISolidlyPair {
    struct Observation {
        uint timestamp;
        uint reserve0Cumulative;
        uint reserve1Cumulative;
    }

    function token0() external view returns (address);
    function token1() external view returns (address);
    function prices(address tokenIn, uint amountIn, uint points) external view returns (uint[] memory);
    function lastObservation() external view returns (Observation memory);
}

contract PiOracleSolidly {
    ISolidlyPair immutable lp;

    address public immutable target;
    uint public immutable targetUnit;
    uint public immutable precision;
    uint public points;

    mapping(address => bool) public admins;

    constructor(ISolidlyPair _lp, address _target, uint _points) {
        require(_target != address(0), "Target zero!");
        require(_points > 1, "Too few points!");

        lp = _lp;
        target = _target;

        require(_lp.token0() == _target || _lp.token1() == _target, "No target on LP");

        address _other = _lp.token0() == _target ? _lp.token1() : _lp.token0();

        targetUnit = 10 ** IERC20Metadata(target).decimals();
        precision = 10 ** IERC20Metadata(_other).decimals();
        points = _points;

        admins[msg.sender] = true;
    }

    modifier onlyAdmins() {
        require(admins[msg.sender], "Not an admin");
        _;
    }

    function addAdmin(address _newAdmin) external onlyAdmins {
        admins[_newAdmin] = true;
    }

    function setPoints(uint _points) external onlyAdmins {
        require(_points != points, "Same points!");
        require(_points > 1, "Too few points!");

        points = _points;
    }

    // Chainlink like method
    function latestRoundData() external view returns (
        uint80 _roundId,
        int256 _answer,
        uint256 _startedAt,
        uint256 _updatedAt,
        uint80 _answeredInRound
    ) {
        uint _price;
        uint[] memory _prices = lp.prices(target, targetUnit, points);
        uint _blockTimestampLast = lp.lastObservation().timestamp;

        for (uint i = 0; i < _prices.length; i++) {
            _price += _prices[i];
        }

        _answer = int256(_price * 10 ** decimals() / _prices.length / precision);
        require(_answer >= 0, "Underflow price");

        _roundId = uint80(_blockTimestampLast);
        _startedAt = _blockTimestampLast;
        _updatedAt = _blockTimestampLast;
        _answeredInRound = uint80(_blockTimestampLast);
    }

    function decimals() public pure returns (uint8) {
        return 8;
    }
}
