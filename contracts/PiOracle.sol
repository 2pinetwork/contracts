// SPDX-License-Identifier: MIT
pragma solidity =0.6.6;

import "@uniswap/lib/contracts/libraries/FixedPoint.sol";
import "hardhat/console.sol";

// Manual interface declaration because of the @openzeppelin lib is for solidity 0.8
interface IERC20MetadataAlt {
    function decimals() external view returns (uint8);
}

interface IUniswapV2Pair {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
    function price0CumulativeLast() external view returns (uint);
    function price1CumulativeLast() external view returns (uint);
}

// library with helper methods for oracles that are concerned with computing average prices
library UniswapV2OracleLibrary {
    using FixedPoint for *;

    // helper function that returns the current block timestamp within the range of uint32, i.e. [0, 2**32 - 1]
    function _currentBlockTimestamp() internal view returns (uint32) {
        return uint32(block.timestamp % 2 ** 32);
    }

    // produces the cumulative price using counterfactuals to save gas and avoid a call to sync.
    function currentCumulativePrices(
        address _pair
    ) internal view returns (uint _price0Cumulative, uint _price1Cumulative, uint32 _blockTimestamp) {
        _blockTimestamp = _currentBlockTimestamp();
        _price0Cumulative = IUniswapV2Pair(_pair).price0CumulativeLast();
        _price1Cumulative = IUniswapV2Pair(_pair).price1CumulativeLast();

        // if time has elapsed since the last update on the pair, mock the accumulated price values
        (uint112 _reserve0, uint112 _reserve1, uint32 _blockTimestampLast) = IUniswapV2Pair(_pair).getReserves();

        if (_blockTimestampLast != _blockTimestamp) {
            // subtraction overflow is desired
            uint32 _timeElapsed = _blockTimestamp - _blockTimestampLast;
            // addition overflow is desired
            // counterfactual
            _price0Cumulative += uint(FixedPoint.fraction(_reserve1, _reserve0)._x) * _timeElapsed;
            // counterfactual
            _price1Cumulative += uint(FixedPoint.fraction(_reserve0, _reserve1)._x) * _timeElapsed;
        }
    }
}

contract PiOracle {
    using FixedPoint for *;

    uint public constant PERIOD = 1 minutes;

    struct path {
        IUniswapV2Pair lp;
        uint priceCumulativeLast;
        uint32 blockTimestampLast;
        FixedPoint.uq112x112 priceAverage;
        address next;
    }

    path[] paths;

    address public immutable target;

    mapping(address => bool) public admins;

    constructor(IUniswapV2Pair[] memory _lps, address _target, address _priceSource) public {
        require(_lps.length > 0, "No LPs!");
        require(_target != address(0), "Target zero!");
        require(_priceSource != address(0), "Source zero!");
        require(_lps[0].token0() == _target || _lps[0].token1() == _target, "No target");
        require(_lps[_lps.length - 1].token0() == _priceSource || _lps[_lps.length - 1].token1() == _priceSource, "No source");

        target = _target;

        address _next = _lps[0].token0() == _target ? _lps[0].token1() : _lps[0].token0();

        for (uint i = 0; i < _lps.length; i++) {
            path memory _path;
            IUniswapV2Pair _lp = _lps[i];

            _path.lp = _lp;
            _path.next = _next;

            (uint112 _reserve0, uint112 _reserve1, uint32 _blockTimestampLast) = _lp.getReserves();

            _path.blockTimestampLast = _blockTimestampLast;

            require(_reserve0 > 0 && _reserve1 > 0, "NO_RESERVES");

            console.log("pre _next", _next);

            if (_lp.token1() == _next) {
                // fetch the current accumulated price value (1 / 0)
                _path.priceCumulativeLast = _lp.price0CumulativeLast();
                _next = _lp.token1();
            } else {
                // fetch the current accumulated price value (0 / 1)
                _path.priceCumulativeLast = _lp.price1CumulativeLast();
                _next = _lp.token0();
            }

            console.log("_path1", _path.next, _path.lp.token0(), _path.lp.token1());
            console.log("_path2", _path.priceCumulativeLast);
            console.log("_next", _next);

            paths.push(_path);
        }

        admins[msg.sender] = true;
    }

    modifier onlyAdmins() {
        require(admins[msg.sender], "Not an admin");
        _;
    }

    function addAdmin(address _newAdmin) external onlyAdmins {
        admins[_newAdmin] = true;
    }

    function update() external {
        console.log("Update");

        for (uint i = 0; i < paths.length; i++) {
            path memory _path = paths[i];

            (uint _price0Cumulative, uint _price1Cumulative, uint32 _blockTimestamp) =
                UniswapV2OracleLibrary.currentCumulativePrices(address(_path.lp));
            uint32 _timeElapsed = _blockTimestamp - _path.blockTimestampLast; // overflow is desired

            // ensure that at least one full period has passed since the last update
            console.log("PERIOD DATA", _timeElapsed, _blockTimestamp, _path.blockTimestampLast);
            require(_timeElapsed >= PERIOD, "PERIOD_NOT_ELAPSED");

            // overflow is desired, casting never truncates
            // cumulative price is in (uq112x112 price * seconds) units so we simply wrap it after division by time elapsed
            if (_path.next == _path.lp.token1()) {
                _path.priceAverage = FixedPoint.uq112x112(uint224((_price0Cumulative - _path.priceCumulativeLast) / _timeElapsed));
                _path.priceCumulativeLast = _price0Cumulative;
            } else {
                _path.priceAverage = FixedPoint.uq112x112(uint224((_price1Cumulative - _path.priceCumulativeLast) / _timeElapsed));
                _path.priceCumulativeLast = _price1Cumulative;
            }

            _path.blockTimestampLast = _blockTimestamp;

            paths[i] = _path;
        }
    }

    // Chainlink like method
    function latestRoundData() external view returns (
        uint80 _roundId,
        int256 _answer,
        uint256 _startedAt,
        uint256 _updatedAt,
        uint80 _answeredInRound
    ) {
        uint[] memory _answers = new uint[](paths.length);
        path memory _lastPath = paths[paths.length - 1];

        for (uint i = 0; i < paths.length; i++) {
            path memory _path = paths[i];
            IUniswapV2Pair _lp = _path.lp;
            bool _firstToken = _lp.token1() == _path.next;
            uint _firstTokenPrecision = 10 ** uint(IERC20MetadataAlt(_firstToken ? _lp.token0() : _lp.token1()).decimals());
            uint _secondTokenPrecision = 10 ** uint(IERC20MetadataAlt(_firstToken ? _lp.token1() : _lp.token0()).decimals());

            // price decimals
            // uint pricePrecision = 10 ** uint(decimals());
            // we concat first token precision with the chainlink price precision
            uint _pricePrecision = _firstTokenPrecision * (10 ** uint(decimals()));

            uint _price = uint(_path.priceAverage.mul(_pricePrecision).decode144());

            // in case the price is too low
            if (_price >= _secondTokenPrecision) {
                _price /= _secondTokenPrecision;
            } else {
                _price = 0;
            }

            console.log("Price", i, _price);
            _answers[i] = _price;
        }

        console.log("Answers", _answers[0], _answers[1]);
        _answer = int256(_answers[1]);
        require(_answer >= 0, "Underflow price");

        _roundId = _lastPath.blockTimestampLast;
        _startedAt = _lastPath.blockTimestampLast;
        _updatedAt = _lastPath.blockTimestampLast;
        _answeredInRound = _lastPath.blockTimestampLast;
    }

    function decimals() public pure returns (uint8) {
        return 8;
    }
}
