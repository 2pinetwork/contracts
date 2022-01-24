pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../interfaces/IPiToken.sol";
interface IMockPiToken  is IPiToken {
    function totalSupply() external view returns (uint256);
}