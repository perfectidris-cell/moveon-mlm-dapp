// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockSupraRouter {
    uint256 private _price;
    uint256 private _decimals;
    bool private _shouldFail;

    constructor(uint256 price, uint256 decimals_) {
        _price = price;
        _decimals = decimals_;
    }

    function checkPrice(string memory /* marketPair */) external view returns (uint256 price, uint256 decimals) {
        require(!_shouldFail, "Supra feed failed");
        return (_price, _decimals);
    }

    function setPrice(uint256 price) external {
        _price = price;
    }

    function setDecimals(uint256 decimals_) external {
        _decimals = decimals_;
    }

    function setShouldFail(bool shouldFail) external {
        _shouldFail = shouldFail;
    }
}
