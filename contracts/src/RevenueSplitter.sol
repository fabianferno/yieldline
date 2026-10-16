// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IRepaymentSink {
    function onRepayment(uint256 lienId, uint256 amount) external;
}

/// @title RevenueSplitter
/// @notice One per seller. The seller sets this contract as their x402 `payTo`. x402 settlement
///         (EIP-3009 transferWithAuthorization) credits USDC here with no callback, so `split()` is
///         permissionless: anyone (buyer, seller, keeper, our agent) can push the balance through.
///         While a lien is outstanding, `sweepBps` of each split goes to the pool; the rest goes to the seller.
contract RevenueSplitter {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    address public immutable pool;
    address public immutable seller;

    uint256 public lienId;
    uint256 public owed;
    uint16 public sweepBps;
    bool public accelerated; // frozen line: sweep 100% until repaid

    uint256 public totalReceived;
    uint256 public totalSwept;
    uint256 public totalForwarded;

    event Split(uint256 indexed lienId, uint256 received, uint256 toPool, uint256 toSeller, uint256 owedAfter);
    event TermsSet(uint256 indexed lienId, uint256 owed, uint16 sweepBps);
    event SweepChanged(uint16 sweepBps);
    event Accelerated(bool on);

    error OnlyPool();
    error StillOwing();

    constructor(IERC20 _usdc, address _pool, address _seller) {
        usdc = _usdc;
        pool = _pool;
        seller = _seller;
    }

    modifier onlyPool() {
        if (msg.sender != pool) revert OnlyPool();
        _;
    }

    function setTerms(uint256 _lienId, uint256 _owed, uint16 _sweepBps) external onlyPool {
        split(); // settle anything received under the previous terms first
        if (owed != 0) revert StillOwing();
        lienId = _lienId;
        owed = _owed;
        sweepBps = _sweepBps;
        accelerated = false;
        emit TermsSet(_lienId, _owed, _sweepBps);
    }

    function setSweepBps(uint16 _sweepBps) external onlyPool {
        split();
        sweepBps = _sweepBps;
        emit SweepChanged(_sweepBps);
    }

    function setAccelerated(bool on) external onlyPool {
        split();
        accelerated = on;
        emit Accelerated(on);
    }

    /// @notice Writes off the remaining obligation (default). Future revenue forwards to the seller.
    function clearOwed() external onlyPool {
        split();
        owed = 0;
        accelerated = false;
    }

    function pending() external view returns (uint256 toPool, uint256 toSeller) {
        return _quote(usdc.balanceOf(address(this)));
    }

    function split() public returns (uint256 toPool, uint256 toSeller) {
        uint256 bal = usdc.balanceOf(address(this));
        if (bal == 0) return (0, 0);
        (toPool, toSeller) = _quote(bal);

        totalReceived += bal;
        if (toPool != 0) {
            owed -= toPool;
            totalSwept += toPool;
            usdc.safeTransfer(pool, toPool);
            IRepaymentSink(pool).onRepayment(lienId, toPool);
        }
        if (toSeller != 0) {
            totalForwarded += toSeller;
            usdc.safeTransfer(seller, toSeller);
        }
        emit Split(lienId, bal, toPool, toSeller, owed);
    }

    function _quote(uint256 bal) internal view returns (uint256 toPool, uint256 toSeller) {
        if (owed != 0) {
            toPool = accelerated ? bal : (bal * sweepBps) / 10_000;
            if (toPool > owed) toPool = owed;
        }
        toSeller = bal - toPool;
    }
}
