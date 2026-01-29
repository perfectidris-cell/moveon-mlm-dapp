// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IPriceFeeds.sol";

contract MockBand is IStdReference {
    uint256 private _rate;
    uint256 private _lastUpdated;

    constructor(uint256 rate) {
        _rate = rate;
        _lastUpdated = block.timestamp;
    }

    function getReferenceData(string memory _base, string memory _quote)
        external
        view
        override
        returns (ReferenceData memory)
    {
        return ReferenceData(_rate, _lastUpdated, _lastUpdated);
    }

    function setRate(uint256 rate) external {
        _rate = rate;
        _lastUpdated = block.timestamp;
    }

    function setLastUpdated(uint256 lastUpdated) external {
        _lastUpdated = lastUpdated;
    }
}
