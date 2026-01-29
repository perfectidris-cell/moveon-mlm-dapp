// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Pyth Network interface
interface IPyth {
    struct Price {
        int64 price;
        uint64 conf;
        int32 expo;
        uint256 publishTime;
    }

    function getPriceUnsafe(bytes32 id) external view returns (Price memory price);
    function getPriceNoOlderThan(bytes32 id, uint256 age) external view returns (Price memory price);
}

/// @notice Band Protocol interface
interface IStdReference {
    struct ReferenceData {
        uint256 rate;
        uint256 lastUpdatedBase;
        uint256 lastUpdatedQuote;
    }

    function getReferenceData(string memory _base, string memory _quote)
        external
        view
        returns (ReferenceData memory);
}
