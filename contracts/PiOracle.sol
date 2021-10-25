// SPDX-License-Identifier: MIT
pragma solidity =0.6.6;

import '@uniswap/lib/contracts/libraries/FixedPoint.sol';
import 'hardhat/console.sol';

interface IERC20Metadata {
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
    function currentBlockTimestamp() internal view returns (uint32) {
        return uint32(block.timestamp % 2 ** 32);
    }

    // produces the cumulative price using counterfactuals to save gas and avoid a call to sync.
    function currentCumulativePrices(
        address pair
    ) internal view returns (uint price0Cumulative, uint price1Cumulative, uint32 blockTimestamp) {
        blockTimestamp = currentBlockTimestamp();
        price0Cumulative = IUniswapV2Pair(pair).price0CumulativeLast();
        price1Cumulative = IUniswapV2Pair(pair).price1CumulativeLast();

        // if time has elapsed since the last update on the pair, mock the accumulated price values
        (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast) = IUniswapV2Pair(pair).getReserves();
        if (blockTimestampLast != blockTimestamp) {
            // subtraction overflow is desired
            uint32 timeElapsed = blockTimestamp - blockTimestampLast;
            // addition overflow is desired
            // counterfactual
            price0Cumulative += uint(FixedPoint.fraction(reserve1, reserve0)._x) * timeElapsed;
            // counterfactual
            price1Cumulative += uint(FixedPoint.fraction(reserve0, reserve1)._x) * timeElapsed;
        }
    }
}

contract PiOracle {
    using FixedPoint for *;

    uint public constant PERIOD = 1 minutes;

    IUniswapV2Pair immutable lp;

    address public immutable PiToken;
    bool    public immutable firstToken;
    uint    public priceCumulativeLast;
    uint32  public blockTimestampLast;
    FixedPoint.uq112x112 public priceAverage;

    mapping(address => bool) public admins;

    constructor(IUniswapV2Pair _lp, address _pi) public {
        PiToken = _pi;
        lp = _lp;

        bool _firstToken = _lp.token0() == _pi;
        firstToken = _firstToken;

        require(_firstToken || _lp.token1() == _pi, "No Pi-LP");

        uint112 reserve0;
        uint112 reserve1;
        (reserve0, reserve1, blockTimestampLast) = _lp.getReserves();

        require(reserve0 > 0 && reserve1 > 0, 'NO_RESERVES'); // ensure that there's liquidity in the pair

        if (_firstToken) {
            priceCumulativeLast = _lp.price0CumulativeLast(); // fetch the current accumulated price value (1 / 0)
        } else {
            priceCumulativeLast = _lp.price1CumulativeLast(); // fetch the current accumulated price value (0 / 1)
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
        (uint price0Cumulative, uint price1Cumulative, uint32 blockTimestamp) =
            UniswapV2OracleLibrary.currentCumulativePrices(address(lp));
        uint32 timeElapsed = blockTimestamp - blockTimestampLast; // overflow is desired

        // ensure that at least one full period has passed since the last update
        require(timeElapsed >= PERIOD, 'PERIOD_NOT_ELAPSED');

        // overflow is desired, casting never truncates
        // cumulative price is in (uq112x112 price * seconds) units so we simply wrap it after division by time elapsed
        if (firstToken) {
            priceAverage = FixedPoint.uq112x112(uint224((price0Cumulative - priceCumulativeLast) / timeElapsed));
            priceCumulativeLast = price0Cumulative;
        } else {
            priceAverage = FixedPoint.uq112x112(uint224((price1Cumulative - priceCumulativeLast) / timeElapsed));
            priceCumulativeLast = price1Cumulative;
        }

        blockTimestampLast = blockTimestamp;
    }

    // Chainlink like method
    function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound) {
        uint secondTokenPrecision = 10 ** uint(IERC20Metadata(firstToken ? lp.token1() : lp.token0()).decimals());

        require(secondTokenPrecision > 0 && secondTokenPrecision <= 1e18, "weird secondary token decimals");

        // price decimals
        uint pricePrecision = 10 ** uint(decimals());

        // ChainLink representation (8)
        uint price = uint(priceAverage.mul(pricePrecision).decode144());

        price *= (10 ** 18); // PiToken decimals

        // in case the price is too low
        if (price >= secondTokenPrecision) {
            price /= secondTokenPrecision;
        } else {
            price = 0;
        }

        answer = int256(price);
        require(answer >= 0, "Underflow price");

        roundId = blockTimestampLast;
        startedAt = blockTimestampLast;
        updatedAt = blockTimestampLast;
        answeredInRound = blockTimestampLast;
    }

    function decimals() public pure returns (uint8) {
        return 8;
    }
}
