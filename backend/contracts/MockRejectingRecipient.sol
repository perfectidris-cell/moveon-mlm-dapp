// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Test helper that can reject incoming CRO transfers. Used to verify
///         ParadiseUpgradeable's safe-push fallback: when a recipient's
///         wallet cannot receive CRO, the failed push is routed to
///         emergencyBalances and stays pullable via claimMissedEarnings().
contract MockRejectingRecipient {
    bool public rejecting = true;

    constructor() payable {}

    function setRejecting(bool v) external {
        rejecting = v;
    }

    receive() external payable {
        if (rejecting) revert("reject");
    }

    fallback() external payable {
        if (rejecting) revert("reject");
    }

    function register(
        address paradise,
        address referrer,
        address placementParent,
        address[] calldata pathProof
    ) external payable {
        (bool ok, ) = paradise.call{value: msg.value}(
            abi.encodeWithSignature("register(address,address,address[])", referrer, placementParent, pathProof)
        );
        require(ok, "register failed");
    }

    function registerAuto(address paradise, address referrer) external payable {
        (bool ok, ) = paradise.call{value: msg.value}(
            abi.encodeWithSignature("registerAuto(address)", referrer)
        );
        require(ok, "registerAuto failed");
    }

    function claim(address paradise) external {
        (bool ok, ) = paradise.call(
            abi.encodeWithSignature("claimMissedEarnings()")
        );
        require(ok, "claim failed");
    }
}