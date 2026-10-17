// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {LienRegistry} from "../src/LienRegistry.sol";
import {LenderPool, IUSYCTeller} from "../src/LenderPool.sol";
import {RevenueSplitter} from "../src/RevenueSplitter.sol";
import {MockUSYCTeller} from "../src/MockUSYCTeller.sol";

contract USDC is ERC20 {
    constructor() ERC20("USDC", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 a) external {
        _mint(to, a);
    }
}

contract YieldlineTest is Test {
    USDC usdc;
    LienRegistry registry;
    LenderPool pool;
    address admin = makeAddr("admin");
    address agent = makeAddr("agent");
    address seller = makeAddr("seller");
    address buyer = makeAddr("buyer");

    function setUp() public {
        usdc = new USDC();
        registry = new LienRegistry(admin);
        pool = new LenderPool(IERC20(address(usdc)), registry, admin, agent);
        bytes32 role = registry.LENDER_ROLE();
        vm.prank(admin);
        registry.grantRole(role, address(pool));
        usdc.mint(address(pool), 1_000e6);
    }

    function _pay(address to, uint256 amt) internal {
        usdc.mint(buyer, amt);
        vm.prank(buyer);
        usdc.transfer(to, amt);
    }

    function _advance(uint128 amt) internal returns (uint256 lienId, RevenueSplitter s) {
        vm.prank(agent);
        lienId = pool.advance(seller, amt, 1_000, 2_000, 30 days, keccak256("decision"));
        s = pool.splitterOf(seller);
    }

    function test_fullLoop_advanceSweepRepay() public {
        (uint256 id, RevenueSplitter s) = _advance(100e6); // cap = 110
        assertEq(usdc.balanceOf(seller), 100e6);
        assertEq(registry.liveLienOfSeller(seller), id);

        _pay(address(s), 50e6);
        s.split(); // anyone can call
        assertEq(usdc.balanceOf(address(pool)), 900e6 + 10e6);
        assertEq(usdc.balanceOf(seller), 100e6 + 40e6);
        assertEq(registry.outstanding(id), 100e6);

        _pay(address(s), 1_000e6); // 20% = 200 > owed 100 -> capped
        s.split();
        assertEq(registry.outstanding(id), 0);
        assertEq(uint8(registry.lien(id).status), uint8(LienRegistry.Status.Repaid));
        assertEq(registry.liveLienOfSeller(seller), 0);
        assertEq(pool.outstandingPrincipal(), 0);
        assertEq(pool.totalFeesEarned(), 10e6);
        (, uint32 repaid,,) = registry.recordOf(seller);
        assertEq(repaid, 1);

        // after repayment everything forwards to seller
        uint256 before = usdc.balanceOf(seller);
        _pay(address(s), 10e6);
        s.split();
        assertEq(usdc.balanceOf(seller), before + 10e6);
    }

    function test_doubleFinancingBlocked() public {
        _advance(100e6);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(LenderPool.LimitExceeded.selector, "encumbered"));
        pool.advance(seller, 50e6, 1_000, 2_000, 30 days, bytes32(0));

        // a second, independent lender that reads the same registry is also blocked
        LenderPool other = new LenderPool(IERC20(address(usdc)), registry, admin, agent);
        bytes32 role = registry.LENDER_ROLE();
        vm.prank(admin);
        registry.grantRole(role, address(other));
        usdc.mint(address(other), 1_000e6);
        vm.prank(agent);
        vm.expectRevert();
        other.advance(seller, 50e6, 1_000, 2_000, 30 days, bytes32(0));
    }

    function test_freezeAcceleratesSweep() public {
        (uint256 id, RevenueSplitter s) = _advance(100e6);
        vm.prank(agent);
        pool.freeze(id, keccak256("payTo changed"));
        assertEq(uint8(registry.lien(id).status), uint8(LienRegistry.Status.Frozen));
        _pay(address(s), 30e6);
        s.split();
        assertEq(registry.outstanding(id), 80e6); // 100% swept
    }

    function test_aboveAutoLimitEscalatesToHuman() public {
        vm.prank(agent);
        uint256 id = pool.advance(seller, 200e6, 1_000, 2_000, 30 days, keccak256("big"));
        assertEq(id, 0);
        assertEq(usdc.balanceOf(seller), 0);
        vm.prank(agent);
        vm.expectRevert();
        pool.approveProposal(0);
        vm.prank(admin);
        id = pool.approveProposal(0);
        assertEq(usdc.balanceOf(seller), 200e6);
        assertGt(id, 0);
    }

    function test_hardLimits() public {
        vm.startPrank(agent);
        vm.expectRevert(abi.encodeWithSelector(LenderPool.LimitExceeded.selector, "maxAdvance"));
        pool.advance(seller, 600e6, 1_000, 2_000, 30 days, bytes32(0));
        vm.expectRevert(abi.encodeWithSelector(LenderPool.LimitExceeded.selector, "sweepBounds"));
        pool.advance(seller, 50e6, 1_000, 9_000, 30 days, bytes32(0));
        vm.expectRevert(abi.encodeWithSelector(LenderPool.LimitExceeded.selector, "exposure"));
        pool.advance(seller, 300e6, 1_000, 2_000, 30 days, bytes32(0)); // >25% of 1000 NAV
        vm.stopPrank();
    }

    function test_defaultIsHumanOnly() public {
        (uint256 id, RevenueSplitter s) = _advance(100e6);
        _pay(address(s), 50e6);
        vm.prank(agent);
        vm.expectRevert();
        pool.markDefault(id, bytes32(0));
        vm.prank(admin);
        pool.markDefault(id, keccak256("diverted"));
        assertEq(uint8(registry.lien(id).status), uint8(LienRegistry.Status.Defaulted));
        assertEq(pool.totalWrittenOff(), 90e6);
        assertEq(pool.outstandingPrincipal(), 0);
        (,, uint32 defaulted,) = registry.recordOf(seller);
        assertEq(defaulted, 1);
    }

    function test_idleToMockUSYC() public {
        MockUSYCTeller t = new MockUSYCTeller(IERC20(address(usdc)), 450);
        usdc.mint(address(t), 100e6); // yield reserve
        vm.prank(admin);
        pool.setTeller(IUSYCTeller(address(t)), IERC20(address(t)));
        vm.prank(agent);
        pool.deployIdle(500e6, bytes32(0));
        assertEq(pool.nav(), 1_000e6);
        vm.warp(block.timestamp + 365 days);
        uint256 shares = t.balanceOf(address(pool));
        vm.prank(agent);
        pool.recallIdle(shares, bytes32(0));
        assertApproxEqAbs(usdc.balanceOf(address(pool)), 1_022_500_000, 1e3);
    }
}
