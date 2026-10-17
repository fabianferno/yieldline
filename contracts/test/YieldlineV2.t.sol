// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {LienRegistry} from "../src/LienRegistry.sol";
import {RevenueSplitter} from "../src/RevenueSplitter.sol";
import {LenderPoolV2} from "../src/LenderPoolV2.sol";
import {PoolFactory} from "../src/PoolFactory.sol";
import {Limits, PoolSetup} from "../src/Limits.sol";
import {USDC} from "./Yieldline.t.sol";

contract YieldlineV2Test is Test {
    USDC usdc;
    LienRegistry registry;
    PoolFactory factory;
    LenderPoolV2 pool;
    address admin = makeAddr("admin");
    address agent = makeAddr("agent");
    address curator = makeAddr("curator");
    address lp = makeAddr("lp");
    address seller = makeAddr("seller");
    address buyer = makeAddr("buyer");

    function _caps() internal pure returns (Limits memory) {
        return Limits(10e6, 5e6, 4_000, 500, 5_000, 1_500, 14 days, 100);
    }

    function _limits(uint8 risk) internal pure returns (Limits memory) {
        return Limits(10e6, 5e6, 4_000, 500, 5_000, 1_500, 14 days, risk);
    }

    function setUp() public {
        usdc = new USDC();
        registry = new LienRegistry(admin);
        LenderPoolV2 impl = new LenderPoolV2(IERC20(address(usdc)), registry);
        address[] memory agents = new address[](1);
        agents[0] = agent;
        factory = new PoolFactory(registry, address(impl), admin, agents, _caps(), address(0));
        bytes32 adminRole = registry.DEFAULT_ADMIN_ROLE();
        vm.prank(admin);
        registry.grantRole(adminRole, address(factory));

        vm.prank(curator);
        pool = LenderPoolV2(factory.createPool("Core", "yCORE", _limits(60)));
        _deposit(lp, 50e6);
    }

    function _deposit(address who, uint256 amt) internal returns (uint256 shares) {
        usdc.mint(who, amt);
        vm.startPrank(who);
        usdc.approve(address(pool), amt);
        shares = pool.deposit(amt, who);
        vm.stopPrank();
    }

    function _pay(address to, uint256 amt) internal {
        usdc.mint(buyer, amt);
        vm.prank(buyer);
        usdc.transfer(to, amt);
    }

    function _advance(LenderPoolV2 p, uint128 amt, uint8 risk) internal returns (uint256 lienId) {
        vm.prank(agent);
        lienId = p.advance(seller, amt, 1_000, 2_000, 7 days, risk, keccak256("d"));
    }

    function test_depositRedeemRoundTrip() public {
        assertEq(pool.totalAssets(), 50e6);
        assertEq(pool.curator(), curator);
        assertEq(pool.name(), "Core");
        uint256 shares = pool.balanceOf(lp);
        vm.prank(lp);
        uint256 out = pool.redeem(shares, lp, lp);
        assertEq(out, 50e6);
        assertEq(usdc.balanceOf(lp), 50e6);
        assertEq(pool.totalAssets(), 0);
    }

    function test_sharePriceRisesAfterFeeSweep() public {
        uint256 before = pool.convertToAssets(pool.balanceOf(lp));
        uint256 id = _advance(pool, 5e6, 30); // cap 5.5
        assertEq(pool.totalAssets(), 50e6, "advance moves cash to principal, NAV flat");
        RevenueSplitter s = pool.splitterOf(seller);
        _pay(address(s), 100e6); // 20% = 20 > owed 5.5
        s.split();
        assertEq(uint8(registry.lien(id).status), uint8(LienRegistry.Status.Repaid));
        assertEq(pool.totalAssets(), 50.5e6);
        assertGt(pool.convertToAssets(pool.balanceOf(lp)), before);
    }

    function test_defaultWritesSharePriceDown() public {
        uint256 id = _advance(pool, 5e6, 30);
        vm.prank(curator);
        pool.markDefault(id, keccak256("gone"));
        assertEq(pool.totalAssets(), 45e6);
        assertApproxEqAbs(pool.convertToAssets(pool.balanceOf(lp)), 45e6, 1);
        assertEq(pool.totalWrittenOff(), 5e6);
    }

    function test_redeemCappedAtFreeCash() public {
        _advance(pool, 5e6, 30);
        assertEq(pool.maxWithdraw(lp), 45e6);
        uint256 maxShares = pool.maxRedeem(lp);
        assertLe(pool.convertToAssets(maxShares), 45e6);
        vm.prank(lp);
        vm.expectRevert();
        pool.withdraw(46e6, lp, lp);
        vm.prank(lp);
        pool.withdraw(45e6, lp, lp);
        assertEq(usdc.balanceOf(lp), 45e6);
    }

    function test_riskGate() public {
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(LenderPoolV2.LimitExceeded.selector, "riskAppetite"));
        pool.advance(seller, 5e6, 1_000, 2_000, 7 days, 61, keccak256("d"));
        assertEq(_advance(pool, 5e6, 60), 1);
    }

    function test_factoryRejectsLimitsAboveCaps() public {
        Limits memory l = _limits(60);
        l.maxAdvance = 11e6;
        vm.prank(curator);
        vm.expectRevert(abi.encodeWithSelector(PoolFactory.CapExceeded.selector, "maxAdvance"));
        factory.createPool("Big", "hBIG", l);

        l = _limits(60);
        l.minSweepBps = 100;
        vm.prank(curator);
        vm.expectRevert(abi.encodeWithSelector(PoolFactory.CapExceeded.selector, "sweepBounds"));
        pool.setLimits(l);

        l = _limits(60);
        l.maxTerm = 30 days;
        vm.prank(curator);
        vm.expectRevert(abi.encodeWithSelector(PoolFactory.CapExceeded.selector, "maxTerm"));
        pool.setLimits(l);

        l = _limits(40);
        vm.prank(curator);
        pool.setLimits(l);
        (,,,,,,, uint8 risk) = pool.limits();
        assertEq(risk, 40);
    }

    function test_factoryGrantsLenderRoleOnly() public {
        assertTrue(registry.hasRole(registry.LENDER_ROLE(), address(pool)));
        assertTrue(factory.isPool(address(pool)));
        assertEq(factory.allPools().length, 1);

        // A pool deployed outside the factory cannot open liens.
        LenderPoolV2 rogue = LenderPoolV2(_clone(address(factory.implementation())));
        address[] memory agents = new address[](1);
        agents[0] = agent;
        rogue.initialize(PoolSetup(curator, admin, address(0)), agents, "Rogue", "R", _limits(60));
        usdc.mint(address(rogue), 50e6);
        vm.prank(agent);
        vm.expectRevert();
        rogue.advance(seller, 5e6, 1_000, 2_000, 7 days, 30, keccak256("d"));
    }

    function test_crossPoolSecondLienReverts() public {
        vm.prank(curator);
        LenderPoolV2 other = LenderPoolV2(factory.createPool("Steady", "ySTDY", _limits(40)));
        usdc.mint(address(this), 50e6);
        usdc.approve(address(other), 50e6);
        other.deposit(50e6, address(this));

        _advance(pool, 5e6, 30);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(LenderPoolV2.LimitExceeded.selector, "encumbered"));
        other.advance(seller, 5e6, 1_000, 2_000, 7 days, 30, keccak256("d"));
    }

    function test_onlyCuratorApprovesProposals() public {
        vm.prank(agent);
        uint256 id = pool.advance(seller, 8e6, 1_000, 2_000, 7 days, 30, keccak256("d")); // > auto-approve 5
        assertEq(id, 0);
        assertEq(pool.proposalCount(), 1);

        vm.prank(agent);
        vm.expectRevert();
        pool.approveProposal(0);

        vm.prank(curator);
        uint256 lienId = pool.approveProposal(0);
        assertEq(registry.liveLienOfSeller(seller), lienId);
        assertEq(usdc.balanceOf(seller), 8e6);
    }

    function test_onlyCuratorMarksDefault() public {
        uint256 id = _advance(pool, 5e6, 30);
        vm.prank(agent);
        vm.expectRevert();
        pool.markDefault(id, keccak256("x"));
        vm.prank(lp);
        vm.expectRevert();
        pool.markDefault(id, keccak256("x"));
    }

    function test_initializeOnlyOnce() public {
        address[] memory agents = new address[](0);
        vm.expectRevert();
        pool.initialize(PoolSetup(lp, lp, address(0)), agents, "X", "X", _limits(60));
    }

    // ---- review fixes

    function test_curatorCannotGrantAgentRole() public {
        bytes32 role = pool.AGENT_ROLE();
        vm.prank(curator);
        vm.expectRevert();
        pool.grantRole(role, curator);
    }

    function test_curatorCannotSetTeller() public {
        vm.prank(curator);
        vm.expectRevert();
        pool.setTeller(makeAddr("evil"));
    }

    function test_protocolSetsTellerOnlyWhenNothingParked() public {
        address t = makeAddr("teller");
        vm.prank(admin);
        pool.setTeller(t);
        assertEq(address(pool.teller()), t);
    }

    function test_actionsOnClosedLienRevert() public {
        uint256 id1 = _advance(pool, 2e6, 30); // cap 2.2
        RevenueSplitter s = pool.splitterOf(seller);
        _pay(address(s), 100e6);
        s.split();
        assertEq(uint8(registry.lien(id1).status), uint8(LienRegistry.Status.Repaid));
        uint256 id2 = _advance(pool, 2e6, 30); // same splitter, new lien

        vm.prank(curator);
        vm.expectRevert(LenderPoolV2.NotLiveLien.selector);
        pool.markDefault(id1, keccak256("x"));
        vm.prank(agent);
        vm.expectRevert(LenderPoolV2.NotLiveLien.selector);
        pool.setSweep(id1, 1_000, keccak256("x"));
        vm.prank(agent);
        vm.expectRevert(LenderPoolV2.NotLiveLien.selector);
        pool.freeze(id1, keccak256("x"));
        assertEq(s.owed(), 2.2e6, "live lien untouched");
        assertEq(s.lienId(), id2);
    }

    function test_actionsOnOtherPoolsLienRevert() public {
        vm.prank(curator);
        LenderPoolV2 other = LenderPoolV2(factory.createPool("Steady", "ySTDY", _limits(40)));
        uint256 id = _advance(pool, 2e6, 30);
        vm.prank(curator);
        vm.expectRevert(LenderPoolV2.NotLiveLien.selector);
        other.markDefault(id, keccak256("x"));
    }

    function test_curatorRejectsProposal() public {
        vm.prank(agent);
        pool.advance(seller, 8e6, 1_000, 2_000, 7 days, 30, keccak256("d"));
        vm.prank(agent);
        vm.expectRevert();
        pool.rejectProposal(0, keccak256("no"));
        vm.prank(curator);
        pool.rejectProposal(0, keccak256("no"));
        vm.prank(curator);
        vm.expectRevert(LenderPoolV2.AlreadyExecuted.selector);
        pool.approveProposal(0);
    }

    function _clone(address impl) internal returns (address instance) {
        bytes memory code = abi.encodePacked(
            hex"3d602d80600a3d3981f3363d3d373d3d3d363d73", impl, hex"5af43d82803e903d91602b57fd5bf3"
        );
        assembly {
            instance := create(0, add(code, 0x20), mload(code))
        }
    }
}
