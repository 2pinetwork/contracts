// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

interface IReferral {
    function recordReferral(address, address referrer) external;
    function referralPaid(address user, uint amount) external;
    function getReferrer(address user) external view returns (address);
}
