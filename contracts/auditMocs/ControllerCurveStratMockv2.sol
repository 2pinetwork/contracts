pragma solidity 0.8.9;

import "../ControllerCurveStrat.sol";

contract ControllerCurveStratMockV2  is ControllerCurveStrat{

    constructor(address _controller, address _exchange, address _treasury) 
    ControllerCurveStrat(_controller, _exchange, _treasury){}


    function mockCallChargeFees(uint _h) external {
        _chargeFees(_h);
    }
     

}