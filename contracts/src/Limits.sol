// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Risk limits a curator sets for a pool (6-decimal USDC amounts, bps, seconds, 0-100 risk score).
///         The factory's protocol caps bound every field.
struct Limits {
    uint128 maxAdvance;
    uint128 autoApproveLimit;
    uint16 maxExposureBps; // per-seller exposure as share of pool assets
    uint16 minSweepBps;
    uint16 maxSweepBps;
    uint16 maxFeeBps;
    uint64 maxTerm;
    uint8 maxRiskScore; // highest underwriting risk score this pool accepts
}
