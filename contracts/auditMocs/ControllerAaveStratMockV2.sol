pragma solidity 0.8.9;

import "../ControllerAaveStrat.sol";

contract ControllerAaveStratV2 is ControllerAaveStrat {


    constructor(
        address _want,
        uint _borrowRate,
        uint _borrowRateMax,
        uint _borrowDepth,
        uint _minLeverage,
        address _controller,
        address _exchange,
        address _treasury
    ) ControllerAaveStrat ( _want, _borrowRate, _borrowRateMax, _borrowDepth, _minLeverage, _controller, _exchange, _treasury) {}


    function mockCallSwapRewards() external {
        _swapRewards();
    }

    function mockCallChargeFees(uint _h) external {
        _chargeFees(_h);
    }

}