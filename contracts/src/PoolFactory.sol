// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {LienRegistry} from "./LienRegistry.sol";
import {LenderPoolV2} from "./LenderPoolV2.sol";
import {Limits, PoolSetup} from "./Limits.sol";

/// @title PoolFactory
/// @notice Anyone can open a lending pool as its curator. Pools are EIP-1167 clones of one LenderPoolV2
///         implementation, bounded by protocol caps, underwritten by the Yieldline agents, and registered as
///         lenders in the shared LienRegistry, so a seller with a live lien in any pool cannot borrow from another.
contract PoolFactory is AccessControl {
    LienRegistry public immutable registry;
    address public immutable implementation;

    Limits public caps;
    /// @notice USYC teller every new pool parks idle cash with (zero = none).
    address public teller;
    address public immutable protocolAdmin;
    address[] private _agents;
    address[] private _pools;
    mapping(address => bool) public isPool;

    event PoolCreated(address indexed pool, address indexed curator, string name, string symbol);
    event CapsUpdated();
    event AgentsUpdated();

    error CapExceeded(string which);

    constructor(
        LienRegistry _registry,
        address _implementation,
        address admin,
        address[] memory agents_,
        Limits memory caps_,
        address teller_
    ) {
        registry = _registry;
        protocolAdmin = admin;
        teller = teller_;
        implementation = _implementation;
        _agents = agents_;
        caps = caps_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function createPool(string calldata name, string calldata symbol, Limits calldata l) external returns (address pool) {
        checkLimits(l);
        pool = Clones.clone(implementation);
        LenderPoolV2(pool).initialize(PoolSetup(msg.sender, protocolAdmin, teller), _agents, name, symbol, l);
        registry.grantRole(registry.LENDER_ROLE(), pool);
        _pools.push(pool);
        isPool[pool] = true;
        emit PoolCreated(pool, msg.sender, name, symbol);
    }

    /// @notice Reverts if any limit is outside the protocol caps or internally inconsistent.
    function checkLimits(Limits memory l) public view {
        Limits memory c = caps;
        if (l.maxAdvance == 0 || l.maxAdvance > c.maxAdvance) revert CapExceeded("maxAdvance");
        if (l.autoApproveLimit > c.autoApproveLimit || l.autoApproveLimit > l.maxAdvance) revert CapExceeded("autoApprove");
        if (l.maxExposureBps == 0 || l.maxExposureBps > c.maxExposureBps) revert CapExceeded("exposure");
        if (l.minSweepBps < c.minSweepBps || l.maxSweepBps > c.maxSweepBps || l.minSweepBps > l.maxSweepBps) {
            revert CapExceeded("sweepBounds");
        }
        if (l.maxFeeBps > c.maxFeeBps) revert CapExceeded("maxFee");
        if (l.maxTerm == 0 || l.maxTerm > c.maxTerm) revert CapExceeded("maxTerm");
        if (l.maxRiskScore > c.maxRiskScore) revert CapExceeded("riskScore");
    }

    function allPools() external view returns (address[] memory) {
        return _pools;
    }

    function agents() external view returns (address[] memory) {
        return _agents;
    }

    function setCaps(Limits calldata c) external onlyRole(DEFAULT_ADMIN_ROLE) {
        caps = c;
        emit CapsUpdated();
    }

    /// @notice Teller for pools created from now on.
    function setTeller(address teller_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        teller = teller_;
    }

    /// @notice Agents granted on pools created from now on.
    function setAgents(address[] calldata agents_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _agents = agents_;
        emit AgentsUpdated();
    }
}
