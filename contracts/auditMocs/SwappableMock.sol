pragma solidity 0.8.9;

import "../Swappable.sol";

contract SwappableMock is Swappable{

    constructor(){}


    function callMockGetPriceFor(address _token) external view returns(uint){
        return _getPriceFor(_token);
    }

}