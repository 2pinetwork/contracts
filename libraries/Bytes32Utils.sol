// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

library Bytes32Utils {
    function toString(bytes32 _bytes32) internal pure returns (string memory) {
        bytes memory bytesArray = new bytes(64);

        for (uint8 i = 0; i < bytesArray.length; i++) {
            uint8 _f = uint8(_bytes32[i/2] >> 4);
            uint8 _l = uint8(_bytes32[i/2] & 0x0f);

            bytesArray[i] = toByte(_f);
            bytesArray[++i] = toByte(_l);
        }

        return string(bytesArray);
    }

    function toByte(uint8 _uint8) internal pure returns (bytes1) {
        if(_uint8 < 10) {
            return bytes1(_uint8 + 48);
        } else {
            return bytes1(_uint8 + 87);
        }
    }
}
