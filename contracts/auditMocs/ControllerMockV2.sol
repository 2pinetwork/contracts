pragma solidity  0.8.9;

import "../Controller.sol";

contract ControllerMockV2 is Controller {

    constructor(
        IERC20Metadata _want,
        address _archimedes,
        address _treasury,
        string memory _shareSymbol
    ) Controller(_want, _archimedes, _treasury, _shareSymbol) {}

    function mockStrategySet(address _str) external {
        strategy = _str;
    }

    function mockTotalSupply(address _a ,uint _t) external {
        _mint(_a, _t);
    }

    function mockCallCheckDepositCap(uint _a) external {
        _checkDepositCap(_a);
    }

    function mockCallStrategyDeposit() external {
        _strategyDeposit();
    }

    function mockCallBeforeTokenTransfer(address from, address to, uint256 amount) external {
        _beforeTokenTransfer(from, to, amount);
    }

    function mockCallAfterTokenTransfer(address from, address to, uint256 amount) external {
        _afterTokenTransfer(from, to, amount);(from, to, amount);
    }


}