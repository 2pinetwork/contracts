pragma solidity 0.8.9;


import "../../interfaces/IController.sol";
import "../ControllerAaveStrat.sol";

contract ControllerCallAaveStrat is IController{


    constructor() {}


    function mockCallBeforeMovementOnAaveStrat(address _c) external {
        ControllerAaveStrat aave = ControllerAaveStrat(_c);
        aave.beforeMovement();
    }

    function strategy() external view returns (address) {

    }
    function totalSupply() external view returns (uint) {

    }
    function balance() external view returns (uint) {

    }
    function balanceOf(address _user) external view returns (uint) {

    }
    function decimals() external view returns (uint) {

    }
    function archimedes() external view returns (address) {

    }
    function deposit(address _depositor, uint _amount) external {

    }    
    
    function withdraw(address _depositor, uint _shares) external returns (uint) {

    }
    function setPid(uint pid) external returns (uint) { 

    }

}