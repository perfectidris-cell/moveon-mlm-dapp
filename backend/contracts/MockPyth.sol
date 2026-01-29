// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IPriceFeeds.sol";

contract MockPyth is IPyth {
    int64 private _price;
    int32 private _expo;
    uint256 private _publishTime;

    constructor(int64 price, int32 expo) {
        _price = price;
        _expo = expo;
        _publishTime = block.timestamp;
    }

    function getPriceUnsafe(bytes32 /* id */) external view override returns (Price memory) {
        return Price(_price, 0, _expo, _publishTime);
    }

    function getPriceNoOlderThan(bytes32 /* id */, uint256 /* age */) external view override returns (Price memory) {
        return Price(_price, 0, _expo, _publishTime);
    }

    function setPrice(int64 price, int32 expo) external {
        _price = price;
        _expo = expo;
        _publishTime = block.timestamp;
    }

    function setPublishTime(uint256 publishTime) external {
        _publishTime = publishTime;
    }
}
