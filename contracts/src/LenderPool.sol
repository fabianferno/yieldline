// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {LienRegistry} from "./LienRegistry.sol";
import {RevenueSplitter} from "./RevenueSplitter.sol";

/// @notice Shape of Circle's USYC Teller (deposit/redeem). Real Teller on Arc testnet requires allowlisting.
interface IUSYCTeller {
    function deposit(uint256 assets, address receiver) external returns (uint256 shares);
    function redeem(uint256 shares, address receiver, address account) external returns (uint256 assets);
}

/// @title LenderPool
/// @notice Holds USDC, advances it to x402 sellers against their revenue, and receives sweeps.
///         The underwriting/monitoring agent holds AGENT_ROLE; the human operator holds DEFAULT_ADMIN_ROLE.
///         Hard risk limits live here, not in prompts: the agent cannot exceed them, and anything above
///         `autoApproveLimit` or any default call must be approved by the human.
contract LenderPool is AccessControl {
    using SafeERC20 for IERC20;

    bytes32 public constant AGENT_ROLE = keccak256("AGENT_ROLE");

    IERC20 public immutable usdc;
    LienRegistry public immutable registry;

    // ---- hard limits (6-decimal USDC amounts, bps)
    uint256 public maxAdvance;
    uint256 public autoApproveLimit;
    uint16 public maxExposureBps; // per-seller exposure as share of pool NAV
    uint16 public minSweepBps;
    uint16 public maxSweepBps;
    uint16 public maxFeeBps;
    uint64 public maxTerm;

    // ---- accounting
    uint256 public outstandingPrincipal;
    uint256 public totalAdvanced;
    uint256 public totalRepaid;
    uint256 public totalFeesEarned;
    uint256 public totalWrittenOff;

    // ---- idle capital
    IUSYCTeller public teller;
    IERC20 public usyc;
    uint256 public idleDeployed; // USDC cost basis parked in USYC

    mapping(address seller => RevenueSplitter) public splitterOf;
    mapping(address splitter => address seller) public sellerOfSplitter;

    struct Proposal {
        address seller;
        uint128 amount;
        uint16 feeBps;
        uint16 sweepBps;
        uint64 term;
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

    error LimitExceeded(string which);
    error NeedsHumanApproval(uint256 proposalId);
    error InsufficientLiquidity();
    error UnknownSplitter();
    error AlreadyExecuted();

    constructor(IERC20 _usdc, LienRegistry _registry, address admin, address agent) {
        usdc = _usdc;
        registry = _registry;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(AGENT_ROLE, agent);
        maxAdvance = 500e6;
        autoApproveLimit = 100e6;
        maxExposureBps = 2_500;
        minSweepBps = 500;
        maxSweepBps = 5_000;
        maxFeeBps = 1_500;
        maxTerm = 90 days;
    }

    // ================================================================ advances

    /// @notice Agent-initiated advance. Within autoApproveLimit it disburses immediately; above it,
    ///         it is queued as a proposal that only the human admin can execute.
    function advance(address seller, uint128 amount, uint16 feeBps, uint16 sweepBps, uint64 term, bytes32 decisionHash)
        external
        onlyRole(AGENT_ROLE)
        returns (uint256 lienId)
    {
        _checkLimits(seller, amount, feeBps, sweepBps, term);
        if (amount > autoApproveLimit) {
            proposals.push(Proposal(seller, amount, feeBps, sweepBps, term, decisionHash, false));
            uint256 pid = proposals.length - 1;
            emit AdvanceProposed(pid, seller, amount, decisionHash);
            return 0;
        }
        return _disburse(seller, amount, feeBps, sweepBps, term, decisionHash);
    }

    function approveProposal(uint256 pid) external onlyRole(DEFAULT_ADMIN_ROLE) returns (uint256 lienId) {
        Proposal storage p = proposals[pid];
        if (p.executed) revert AlreadyExecuted();
        p.executed = true;
        _checkLimits(p.seller, p.amount, p.feeBps, p.sweepBps, p.term);
        return _disburse(p.seller, p.amount, p.feeBps, p.sweepBps, p.term, p.decisionHash);
    }

    function proposalCount() external view returns (uint256) {
        return proposals.length;
    }

    /// @notice Deploys (or returns) the seller's splitter so they can point x402 payTo at it before funding.
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

    function _checkLimits(address seller, uint256 amount, uint16 feeBps, uint16 sweepBps, uint64 term) internal view {
        if (amount == 0 || amount > maxAdvance) revert LimitExceeded("maxAdvance");
        if (feeBps > maxFeeBps) revert LimitExceeded("maxFee");
        if (sweepBps < minSweepBps || sweepBps > maxSweepBps) revert LimitExceeded("sweepBounds");
        if (term == 0 || term > maxTerm) revert LimitExceeded("maxTerm");
        if (amount * 10_000 > nav() * maxExposureBps) revert LimitExceeded("exposure");
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

    function setSweep(uint256 lienId, uint16 sweepBps, bytes32 decisionHash) external onlyRole(AGENT_ROLE) {
        if (sweepBps < minSweepBps || sweepBps > maxSweepBps) revert LimitExceeded("sweepBounds");
        LienRegistry.Lien memory l = registry.lien(lienId);
        RevenueSplitter(l.payTo).setSweepBps(sweepBps);
        registry.setSweep(lienId, sweepBps);
        emit Decision(l.seller, "sweep", decisionHash, "");
    }

    /// @notice Freeze: line is flagged publicly and the splitter sweeps 100% of whatever still arrives.
    function freeze(uint256 lienId, bytes32 reasonHash) external onlyRole(AGENT_ROLE) {
        LienRegistry.Lien memory l = registry.lien(lienId);
        RevenueSplitter(l.payTo).setAccelerated(true);
        registry.setStatus(lienId, LienRegistry.Status.Frozen, reasonHash);
    }

    function unfreeze(uint256 lienId, bytes32 reasonHash) external onlyRole(AGENT_ROLE) {
        LienRegistry.Lien memory l = registry.lien(lienId);
        RevenueSplitter(l.payTo).setAccelerated(false);
        registry.setStatus(lienId, LienRegistry.Status.Active, reasonHash);
    }

    /// @notice Default is always a human call.
    function markDefault(uint256 lienId, bytes32 reasonHash) external onlyRole(DEFAULT_ADMIN_ROLE) {
        LienRegistry.Lien memory l = registry.lien(lienId);
        RevenueSplitter(l.payTo).clearOwed(); // settles any pending revenue first
        l = registry.lien(lienId);
        uint256 principalLeft = l.repaid >= l.principal ? 0 : l.principal - l.repaid;
        outstandingPrincipal -= principalLeft;
        totalWrittenOff += principalLeft;
        if (l.status != LienRegistry.Status.Repaid) {
            registry.setStatus(lienId, LienRegistry.Status.Defaulted, reasonHash);
        }
        emit LienClosed(lienId, LienRegistry.Status.Defaulted, principalLeft);
    }

    /// @notice On-chain anchor for the agent's off-chain decision log (hash of the full JSON record).
    function logDecision(address subject, string calldata kind, bytes32 decisionHash, string calldata uri)
        external
        onlyRole(AGENT_ROLE)
    {
        emit Decision(subject, kind, decisionHash, uri);
    }

    // ================================================================ idle capital (USYC)

    function setTeller(IUSYCTeller _teller, IERC20 _usyc) external onlyRole(DEFAULT_ADMIN_ROLE) {
        teller = _teller;
        usyc = _usyc;
    }

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

    // ================================================================ views & admin

    /// @notice Net asset value: liquid USDC + USYC at cost + outstanding principal.
    function nav() public view returns (uint256) {
        return usdc.balanceOf(address(this)) + idleDeployed + outstandingPrincipal;
    }

    function liquidity() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    function setLimits(
        uint256 _maxAdvance,
        uint256 _autoApproveLimit,
        uint16 _maxExposureBps,
        uint16 _minSweepBps,
        uint16 _maxSweepBps,
        uint16 _maxFeeBps,
        uint64 _maxTerm
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        maxAdvance = _maxAdvance;
        autoApproveLimit = _autoApproveLimit;
        maxExposureBps = _maxExposureBps;
        minSweepBps = _minSweepBps;
        maxSweepBps = _maxSweepBps;
        maxFeeBps = _maxFeeBps;
        maxTerm = _maxTerm;
        emit LimitsUpdated();
    }

    function withdraw(address to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        usdc.safeTransfer(to, amount);
    }
}
