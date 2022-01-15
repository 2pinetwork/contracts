// SPDX-License-Identifier: MIT

pragma solidity 0.8.11;

contract PriceFeedMock {
    int256 private price;

    constructor() {}

    function setPrice(int256 _price) public {
        price = _price;
    }

    function latestRoundData() public view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    ) {
        roundId = 1;
        answer = price;
        startedAt = block.timestamp;
        updatedAt = block.timestamp;
        answeredInRound = 1;
    }
}
