//SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import { Archimedes, IController, IPiToken, IWNative } from "../Archimedes.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ArchimedesCallerMock {

    function mockCalladdNewPool(address payable archi, address want, address _ctroller, uint256 _weighing, bool _massUpdate) external {
        Archimedes arch = Archimedes(archi);
        IERC20 _want = IERC20(want);
        arch.addNewPool(_want, _ctroller, _weighing, _massUpdate);
    }

    function mockCallSetPidOnController(address _controller, uint pid) external  returns(uint){
        IController controller = IController(_controller);
        uint v = controller.setPid(pid);
        return v;
    }

    function mockCallDepositOnController(address _controller, address _senderUser, uint _amount) external {
        IController controller = IController(_controller);
        controller.deposit(_senderUser, _amount);
    }

     function mockCallWithdrawOnController(address _controller, address _depositor, uint _shares) external {
        IController controller = IController(_controller);
        controller.withdraw(_depositor, _shares);
    }

    function piToken() public view returns (address){
        return address(this);
    }
}
