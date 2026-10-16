// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {LienRegistry} from "../src/LienRegistry.sol";
import {LenderPool, IUSYCTeller} from "../src/LenderPool.sol";
import {MockUSYCTeller} from "../src/MockUSYCTeller.sol";

contract Deploy is Script {
    IERC20 constant USDC = IERC20(0x3600000000000000000000000000000000000000);

    function run() external {
        address admin = vm.envAddress("DEPLOYER_ADDRESS");
        address underwriter = vm.envAddress("UNDERWRITER_WALLET");
        address monitor = vm.envAddress("MONITOR_WALLET");

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        LienRegistry registry = new LienRegistry(admin);
        LenderPool pool = new LenderPool(USDC, registry, admin, underwriter);
        registry.grantRole(registry.LENDER_ROLE(), address(pool));
        pool.grantRole(pool.AGENT_ROLE(), monitor);
        pool.grantRole(pool.AGENT_ROLE(), admin); // operator scripts / keeper

        // Testnet-sized limits: max 10 USDC/advance, auto-approve <= 5, 40% per-seller exposure, 14d term cap
        pool.setLimits(10e6, 5e6, 4_000, 500, 5_000, 1_500, 14 days);

        MockUSYCTeller teller = new MockUSYCTeller(USDC, 450);
        pool.setTeller(IUSYCTeller(address(teller)), IERC20(address(teller)));

        // Pool is seeded with `cast send` afterwards: forge simulation cannot execute Arc's native-USDC precompile.
        vm.stopBroadcast();

        console.log("LienRegistry", address(registry));
        console.log("LenderPool", address(pool));
        console.log("MockUSYCTeller", address(teller));
    }
}
