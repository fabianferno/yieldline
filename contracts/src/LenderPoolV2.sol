// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {LienRegistry} from "./LienRegistry.sol";
import {RevenueSplitter} from "./RevenueSplitter.sol";
import {IUSYCTeller} from "./LenderPool.sol";
import {Limits, PoolSetup} from "./Limits.sol";

interface ICapsSource {
    function checkLimits(Limits memory l) external view;
}

/// @title LenderPoolV2
/// @notice An ERC-4626 lending pool anyone can deposit USDC into. Its curator (DEFAULT_ADMIN_ROLE) sets risk limits
///         within the factory's protocol caps, approves or rejects advances above the auto-approve limit, and alone can
///         mark a default. The Yieldline agents (AGENT_ROLE) advance, monitor and park idle cash. The curator cannot grant
///         AGENT_ROLE or choose where idle cash is parked: both belong to the protocol (PROTOCOL_ROLE). There is no admin
///         withdrawal: depositors' USDC leaves only through redemptions or advances. Deployed as clones by PoolFactory.
contract LenderPoolV2 is ERC4626, AccessControl, Initializable {
    using SafeERC20 for IERC20;

    bytes32 public constant AGENT_ROLE = keccak256("AGENT_ROLE");
    bytes32 public constant PROTOCOL_ROLE = keccak256("PROTOCOL_ROLE");

    IERC20 public immutable usdc;
    LienRegistry public immutable registry;

    address public factory;
    address public curator;
    string private _name;
    string private _symbol;
    Limits public limits;

    // ---- accounting (same meaning as v1)
    uint256 public outstandingPrincipal;
    uint256 public totalAdvanced;
    uint256 public totalRepaid;
    uint256 public totalFeesEarned;
    uint256 public totalWrittenOff;

    // ---- idle capital
    IUSYCTeller public teller;
    IERC20 public usyc;
    uint256 public idleDeployed;

    mapping(address seller => RevenueSplitter) public splitterOf;
    mapping(address splitter => address seller) public sellerOfSplitter;

    struct Proposal {
        address seller;
        uint128 amount;
        uint16 feeBps;
        uint16 sweepBps;
        uint64 term;
        uint8 riskScore;
        bytes32 decisionHash;
        bool executed;
    }

    Proposal[] public proposals;

    event SplitterCreated(address indexed seller, address splitter);
    event AdvanceProposed(uint256 indexed proposalId, address indexed seller, uint256 amount, bytes32 decisionHash);
    event AdvanceDisbursed(
        uint256 indexed lienId, address indexed seller, address splitter, uint256 amount, uint256 repayCap, bytes32 decisionHash
    );
    event Repayment(uint256 indexed lienId, uint256 amount);
    event LienClosed(uint256 indexed lienId, LienRegistry.Status status, uint256 writtenOff);
    event Decision(address indexed subject, string kind, bytes32 indexed decisionHash, string uri);
    event IdleDeployed(uint256 assets, uint256 shares);
    event IdleRecalled(uint256 shares, uint256 assets);
    event LimitsUpdated();
    event ProposalRejected(uint256 indexed proposalId, bytes32 reasonHash);
    event TellerSet(address teller);

    error LimitExceeded(string which);
    error InsufficientLiquidity();
    error UnknownSplitter();
    error AlreadyExecuted();
    error NotLiveLien();
    error IdleStillDeployed();

    constructor(IERC20 _usdc, LienRegistry _registry) ERC4626(_usdc) ERC20("", "") {
        usdc = _usdc;
        registry = _registry;
        _disableInitializers();
    }

    function initialize(PoolSetup calldata setup, address[] calldata agents, string calldata name_, string calldata symbol_, Limits calldata l)
        external
        initializer
    {
        factory = msg.sender;
        curator = setup.curator;
        _name = name_;
        _symbol = symbol_;
        limits = l;
        _grantRole(DEFAULT_ADMIN_ROLE, setup.curator);
        // Agents and the teller are protocol-controlled: the curator's admin role does not administer them.
        _setRoleAdmin(PROTOCOL_ROLE, PROTOCOL_ROLE);
        _setRoleAdmin(AGENT_ROLE, PROTOCOL_ROLE);
        _grantRole(PROTOCOL_ROLE, setup.protocolAdmin);
        for (uint256 i; i < agents.length; i++) {
            _grantRole(AGENT_ROLE, agents[i]);
        }
        if (setup.teller != address(0)) _setTeller(setup.teller);
    }

    // ================================================================ ERC-4626

    function name() public view override(ERC20, IERC20Metadata) returns (string memory) {
        return _name;
    }

    function symbol() public view override(ERC20, IERC20Metadata) returns (string memory) {
        return _symbol;
    }

    function _decimalsOffset() internal pure override returns (uint8) {
        return 6;
    }

    /// @notice Liquid USDC + USYC at cost + principal still owed by sellers.
    function totalAssets() public view override returns (uint256) {
        return usdc.balanceOf(address(this)) + idleDeployed + outstandingPrincipal;
    }

    /// @notice Lenders can take out only what is not lent out or parked.
    function maxWithdraw(address owner) public view override returns (uint256) {
        return Math.min(super.maxWithdraw(owner), usdc.balanceOf(address(this)));
    }

    function maxRedeem(address owner) public view override returns (uint256) {
        return Math.min(super.maxRedeem(owner), _convertToShares(usdc.balanceOf(address(this)), Math.Rounding.Floor));
    }

    function nav() external view returns (uint256) {
        return totalAssets();
    }

    function liquidity() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    // ================================================================ advances

    function advance(
        address seller,
        uint128 amount,
        uint16 feeBps,
        uint16 sweepBps,
        uint64 term,
        uint8 riskScore,
        bytes32 decisionHash
    ) external onlyRole(AGENT_ROLE) returns (uint256 lienId) {
        _checkLimits(seller, amount, feeBps, sweepBps, term, riskScore);
        if (amount > limits.autoApproveLimit) {
            proposals.push(Proposal(seller, amount, feeBps, sweepBps, term, riskScore, decisionHash, false));
            uint256 pid = proposals.length - 1;
            emit AdvanceProposed(pid, seller, amount, decisionHash);
            return 0;
        }
        return _disburse(seller, amount, feeBps, sweepBps, term, decisionHash);
    }

    function rejectProposal(uint256 pid, bytes32 reasonHash) external onlyRole(DEFAULT_ADMIN_ROLE) {
        Proposal storage p = proposals[pid];
        if (p.executed) revert AlreadyExecuted();
        p.executed = true;
        emit ProposalRejected(pid, reasonHash);
    }

    function approveProposal(uint256 pid) external onlyRole(DEFAULT_ADMIN_ROLE) returns (uint256 lienId) {
        Proposal storage p = proposals[pid];
        if (p.executed) revert AlreadyExecuted();
        p.executed = true;
        _checkLimits(p.seller, p.amount, p.feeBps, p.sweepBps, p.term, p.riskScore);
        return _disburse(p.seller, p.amount, p.feeBps, p.sweepBps, p.term, p.decisionHash);
    }

    function proposalCount() external view returns (uint256) {
        return proposals.length;
    }

    function ensureSplitter(address seller) external onlyRole(AGENT_ROLE) returns (RevenueSplitter) {
        return _ensureSplitter(seller);
    }

    function _disburse(address seller, uint128 amount, uint16 feeBps, uint16 sweepBps, uint64 term, bytes32 decisionHash)
        internal
        returns (uint256 lienId)
    {
        if (usdc.balanceOf(address(this)) < amount) revert InsufficientLiquidity();
        RevenueSplitter s = _ensureSplitter(seller);
        uint128 repayCap = amount + uint128((uint256(amount) * feeBps) / 10_000);

        lienId = registry.open(seller, address(s), amount, repayCap, sweepBps, uint64(block.timestamp) + term);
        s.setTerms(lienId, repayCap, sweepBps);

        outstandingPrincipal += amount;
        totalAdvanced += amount;
        usdc.safeTransfer(seller, amount);
        emit AdvanceDisbursed(lienId, seller, address(s), amount, repayCap, decisionHash);
    }

    function _ensureSplitter(address seller) internal returns (RevenueSplitter s) {
        s = splitterOf[seller];
        if (address(s) == address(0)) {
            s = new RevenueSplitter(usdc, address(this), seller);
            splitterOf[seller] = s;
            sellerOfSplitter[address(s)] = seller;
            emit SplitterCreated(seller, address(s));
        }
    }

    function _checkLimits(address seller, uint256 amount, uint16 feeBps, uint16 sweepBps, uint64 term, uint8 riskScore)
        internal
        view
    {
        Limits memory l = limits;
        if (amount == 0 || amount > l.maxAdvance) revert LimitExceeded("maxAdvance");
        if (feeBps > l.maxFeeBps) revert LimitExceeded("maxFee");
        if (sweepBps < l.minSweepBps || sweepBps > l.maxSweepBps) revert LimitExceeded("sweepBounds");
        if (term == 0 || term > l.maxTerm) revert LimitExceeded("maxTerm");
        if (riskScore > l.maxRiskScore) revert LimitExceeded("riskAppetite");
        if (amount * 10_000 > totalAssets() * l.maxExposureBps) revert LimitExceeded("exposure");
        (uint256 enc,) = registry.encumbrance(seller);
        if (enc != 0) revert LimitExceeded("encumbered");
    }

    // ================================================================ repayment (called by splitters)

    function onRepayment(uint256 lienId, uint256 amount) external {
        address seller = sellerOfSplitter[msg.sender];
        if (seller == address(0)) revert UnknownSplitter();
        LienRegistry.Lien memory l = registry.lien(lienId);
        if (l.payTo != msg.sender) revert UnknownSplitter();

        registry.recordRepayment(lienId, uint128(amount));
        totalRepaid += amount;

        // Repayments retire principal first, then fee.
        uint256 principalLeft = l.repaid >= l.principal ? 0 : l.principal - l.repaid;
        uint256 toPrincipal = amount > principalLeft ? principalLeft : amount;
        outstandingPrincipal -= toPrincipal;
        totalFeesEarned += amount - toPrincipal;
        emit Repayment(lienId, amount);

        if (l.repaid + amount >= l.repayCap) {
            registry.setStatus(lienId, LienRegistry.Status.Repaid, bytes32(0));
            emit LienClosed(lienId, LienRegistry.Status.Repaid, 0);
        }
    }

    // ================================================================ monitoring actions

    /// @dev A lien this pool can act on: opened by this pool, still live, and the one its splitter is currently serving
    ///      (a splitter is reused across a seller's successive liens in the same pool).
    function _liveLien(uint256 lienId) internal view returns (LienRegistry.Lien memory l) {
        l = registry.lien(lienId);
        bool live = l.status == LienRegistry.Status.Active || l.status == LienRegistry.Status.Frozen;
        if (l.lender != address(this) || !live || RevenueSplitter(l.payTo).lienId() != lienId) revert NotLiveLien();
    }

    function setSweep(uint256 lienId, uint16 sweepBps, bytes32 decisionHash) external onlyRole(AGENT_ROLE) {
        if (sweepBps < limits.minSweepBps || sweepBps > limits.maxSweepBps) revert LimitExceeded("sweepBounds");
        LienRegistry.Lien memory l = _liveLien(lienId);
        RevenueSplitter(l.payTo).setSweepBps(sweepBps);
        registry.setSweep(lienId, sweepBps);
        emit Decision(l.seller, "sweep", decisionHash, "");
    }

    function freeze(uint256 lienId, bytes32 reasonHash) external onlyRole(AGENT_ROLE) {
        LienRegistry.Lien memory l = _liveLien(lienId);
        RevenueSplitter(l.payTo).setAccelerated(true);
        registry.setStatus(lienId, LienRegistry.Status.Frozen, reasonHash);
    }

    function unfreeze(uint256 lienId, bytes32 reasonHash) external onlyRole(AGENT_ROLE) {
        LienRegistry.Lien memory l = _liveLien(lienId);
        RevenueSplitter(l.payTo).setAccelerated(false);
        registry.setStatus(lienId, LienRegistry.Status.Active, reasonHash);
    }

    /// @notice Default is always the curator's call. The written-off principal lowers the share price.
    function markDefault(uint256 lienId, bytes32 reasonHash) external onlyRole(DEFAULT_ADMIN_ROLE) {
        LienRegistry.Lien memory l = _liveLien(lienId);
        RevenueSplitter(l.payTo).clearOwed();
        l = registry.lien(lienId);
        uint256 principalLeft = l.repaid >= l.principal ? 0 : l.principal - l.repaid;
        outstandingPrincipal -= principalLeft;
        totalWrittenOff += principalLeft;
        if (l.status != LienRegistry.Status.Repaid) {
            registry.setStatus(lienId, LienRegistry.Status.Defaulted, reasonHash);
        }
        emit LienClosed(lienId, LienRegistry.Status.Defaulted, principalLeft);
    }

    /// @notice On-chain anchor for an off-chain decision record. Agents and the curator can both log.
    function logDecision(address subject, string calldata kind, bytes32 decisionHash, string calldata uri) external {
        if (!hasRole(AGENT_ROLE, msg.sender) && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            revert AccessControlUnauthorizedAccount(msg.sender, AGENT_ROLE);
        }
        emit Decision(subject, kind, decisionHash, uri);
    }

    // ================================================================ curator settings

    function setLimits(Limits calldata l) external onlyRole(DEFAULT_ADMIN_ROLE) {
        ICapsSource(factory).checkLimits(l);
        limits = l;
        emit LimitsUpdated();
    }

    /// @notice Where idle cash is parked (a USYC teller whose share token is itself). Protocol-only, and only while
    ///         nothing is parked, so cash cannot be stranded in or redirected to another contract.
    function setTeller(address teller_) external onlyRole(PROTOCOL_ROLE) {
        if (idleDeployed != 0) revert IdleStillDeployed();
        _setTeller(teller_);
    }

    function _setTeller(address teller_) internal {
        teller = IUSYCTeller(teller_);
        usyc = IERC20(teller_);
        emit TellerSet(teller_);
    }

    // ================================================================ idle capital (USYC)

    function deployIdle(uint256 assets, bytes32 decisionHash) external onlyRole(AGENT_ROLE) {
        usdc.forceApprove(address(teller), assets);
        uint256 shares = teller.deposit(assets, address(this));
        idleDeployed += assets;
        emit IdleDeployed(assets, shares);
        emit Decision(address(this), "treasury.deploy", decisionHash, "");
    }

    function recallIdle(uint256 shares, bytes32 decisionHash) external onlyRole(AGENT_ROLE) {
        uint256 bal = usyc.balanceOf(address(this));
        uint256 basis = bal == 0 ? 0 : (idleDeployed * shares) / bal;
        uint256 assets = teller.redeem(shares, address(this), address(this));
        idleDeployed -= basis;
        emit IdleRecalled(shares, assets);
        emit Decision(address(this), "treasury.recall", decisionHash, "");
    }
}
