// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";

contract Referral is Ownable {
    // Archimedes
    address public immutable operator;

    mapping(address => address) public referrers; // user address => referrer address
    mapping(address => uint) public referralsCount; // referrer address => referrals count
    // Total paid to referrals in PiToken
    uint public totalPaid;
    mapping(address => uint) public referralsPaid; // referrer address => paid

    event ReferralRecorded(address indexed user, address indexed referrer);
    event ReferralPaid(address indexed user, uint amount);

    constructor(address _operator) {
        require(_operator != address(0), "Zero address for operator");
        operator = _operator;
    }

    modifier onlyOperator {
        require(operator == msg.sender, "Operator: caller is not the operator");
        _;
    }

    function recordReferral(address _user, address _referrer) external onlyOperator {
        if (_user != address(0)
            && _referrer != address(0)
            && _user != _referrer
            && referrers[_user] == address(0)
        ) {
            referrers[_user] = _referrer;
            referralsCount[_referrer] += 1;
            emit ReferralRecorded(_user, _referrer);
        }
    }

    function referralPaid(address _referrer, uint _amount) external onlyOperator {
        totalPaid += _amount;
        referralsPaid[_referrer] += _amount;

        emit ReferralPaid(_referrer, _amount);
    }

    // Get the referrer address that referred the user
    function getReferrer(address _user) public view returns (address) {
        return referrers[_user];
    }
}
