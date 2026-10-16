// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title LienRegistry
/// @notice Public registry of revenue liens ("horoi"). Any lender can read a seller's encumbrances
///         before advancing; registered lenders can only open a lien on a seller/payTo with no live lien,
///         which prevents double financing across lenders.
contract LienRegistry is AccessControl {
    bytes32 public constant LENDER_ROLE = keccak256("LENDER_ROLE");

    enum Status {
        None,
        Active,
        Frozen,
        Repaid,
        Defaulted
    }

    struct Lien {
        address seller;
        address payTo;
        address lender;
        uint128 principal;
        uint128 repayCap;
        uint128 repaid;
        uint16 sweepBps;
        Status status;
        uint64 createdAt;
        uint64 termEnd;
    }

    struct Record {
        uint32 opened;
        uint32 repaid;
        uint32 defaulted;
        uint32 frozenEvents;
    }

    Lien[] private _liens; // lienId = index + 1
    mapping(address seller => uint256[]) private _liensOf;
    mapping(address seller => uint256) public liveLienOfSeller;
    mapping(address payTo => uint256) public liveLienOfPayTo;
    mapping(address seller => Record) public recordOf;

    event LienOpened(
        uint256 indexed lienId,
        address indexed seller,
        address indexed payTo,
        address lender,
        uint256 principal,
        uint256 repayCap,
        uint16 sweepBps,
        uint64 termEnd
    );
    event LienRepayment(uint256 indexed lienId, uint256 amount, uint256 repaid, uint256 repayCap);
    event LienStatusChanged(uint256 indexed lienId, Status from, Status to, bytes32 reasonHash);
    event LienSweepChanged(uint256 indexed lienId, uint16 sweepBps);

    error SellerEncumbered(uint256 lienId);
    error PayToEncumbered(uint256 lienId);
    error NotLienLender();
    error BadLien();
    error BadTransition();

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    modifier onlyLender(uint256 lienId) {
        if (lienId == 0 || lienId > _liens.length) revert BadLien();
        if (_liens[lienId - 1].lender != msg.sender) revert NotLienLender();
        _;
    }

    // ---------------------------------------------------------------- writes (lenders)

    function open(
        address seller,
        address payTo,
        uint128 principal,
        uint128 repayCap,
        uint16 sweepBps,
        uint64 termEnd
    ) external onlyRole(LENDER_ROLE) returns (uint256 lienId) {
        if (liveLienOfSeller[seller] != 0) revert SellerEncumbered(liveLienOfSeller[seller]);
        if (liveLienOfPayTo[payTo] != 0) revert PayToEncumbered(liveLienOfPayTo[payTo]);

        _liens.push(
            Lien({
                seller: seller,
                payTo: payTo,
                lender: msg.sender,
                principal: principal,
                repayCap: repayCap,
                repaid: 0,
                sweepBps: sweepBps,
                status: Status.Active,
                createdAt: uint64(block.timestamp),
                termEnd: termEnd
            })
        );
        lienId = _liens.length;
        _liensOf[seller].push(lienId);
        liveLienOfSeller[seller] = lienId;
        liveLienOfPayTo[payTo] = lienId;
        recordOf[seller].opened++;

        emit LienOpened(lienId, seller, payTo, msg.sender, principal, repayCap, sweepBps, termEnd);
    }

    function recordRepayment(uint256 lienId, uint128 amount) external onlyLender(lienId) {
        Lien storage l = _liens[lienId - 1];
        l.repaid += amount;
        emit LienRepayment(lienId, amount, l.repaid, l.repayCap);
    }

    function setSweep(uint256 lienId, uint16 sweepBps) external onlyLender(lienId) {
        _liens[lienId - 1].sweepBps = sweepBps;
        emit LienSweepChanged(lienId, sweepBps);
    }

    function setStatus(uint256 lienId, Status to, bytes32 reasonHash) external onlyLender(lienId) {
        Lien storage l = _liens[lienId - 1];
        Status from = l.status;
        bool live = from == Status.Active || from == Status.Frozen;
        if (!live || to == Status.None || to == from) revert BadTransition();

        l.status = to;
        Record storage r = recordOf[l.seller];
        if (to == Status.Frozen) r.frozenEvents++;
        if (to == Status.Repaid || to == Status.Defaulted) {
            if (to == Status.Repaid) r.repaid++;
            else r.defaulted++;
            delete liveLienOfSeller[l.seller];
            delete liveLienOfPayTo[l.payTo];
        }
        emit LienStatusChanged(lienId, from, to, reasonHash);
    }

    // ---------------------------------------------------------------- reads (anyone)

    function lien(uint256 lienId) external view returns (Lien memory) {
        if (lienId == 0 || lienId > _liens.length) revert BadLien();
        return _liens[lienId - 1];
    }

    function liensOf(address seller) external view returns (uint256[] memory) {
        return _liensOf[seller];
    }

    function lienCount() external view returns (uint256) {
        return _liens.length;
    }

    function outstanding(uint256 lienId) public view returns (uint256) {
        Lien storage l = _liens[lienId - 1];
        return l.repaid >= l.repayCap ? 0 : l.repayCap - l.repaid;
    }

    /// @notice Total outstanding across all live liens for a seller (what any new lender must price against).
    function encumbrance(address seller) external view returns (uint256 total, uint256 liveLienId) {
        liveLienId = liveLienOfSeller[seller];
        if (liveLienId != 0) total = outstanding(liveLienId);
    }
}
