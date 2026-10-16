// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {LienRegistry} from "../src/LienRegistry.sol";
import {LenderPoolV2} from "../src/LenderPoolV2.sol";
import {PoolFactory} from "../src/PoolFactory.sol";
import {Limits} from "../src/Limits.sol";

/// Deploys the pool marketplace against the existing LienRegistry: LenderPoolV2 implementation, PoolFactory
/// (protocol caps), and the first curated pool, "Horos Core". Seed deposits are made with `cast send` afterwards
/// because forge simulation cannot execute Arc's native-USDC precompile.
contract DeployV2 is Script {
    IERC20 constant USDC = IERC20(0x3600000000000000000000000000000000000000);
    LienRegistry constant REGISTRY = LienRegistry(0xD140eED8f20B2157366B36FcC08226d64c16906F);
    address constant TELLER = 0x6be95DA212b7F77C1947b436Be9C5EC35727A4D5; // MockUSYCTeller

    function run() external {
        address admin = vm.envAddress("DEPLOYER_ADDRESS");
        address[] memory agents = new address[](3);
        agents[0] = vm.envAddress("UNDERWRITER_WALLET");
        agents[1] = vm.envAddress("MONITOR_WALLET");
        agents[2] = admin; // keeper / operator scripts

        // Testnet protocol caps: max 10 USDC/advance, auto-approve <= 5, 40% per-seller exposure, sweep 5-50%,
        // fee <= 15%, term <= 14 days, any risk score.
        Limits memory caps = Limits(10e6, 5e6, 4_000, 500, 5_000, 1_500, 14 days, 100);

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        LenderPoolV2 impl = new LenderPoolV2(USDC, REGISTRY);
        PoolFactory factory = new PoolFactory(REGISTRY, address(impl), admin, agents, caps, TELLER);
        REGISTRY.grantRole(REGISTRY.DEFAULT_ADMIN_ROLE(), address(factory));

        address core = factory.createPool("Horos Core", "hCORE", Limits(10e6, 5e6, 4_000, 500, 5_000, 1_500, 14 days, 60));
        vm.stopBroadcast();

        console.log("LenderPoolV2 impl", address(impl));
        console.log("PoolFactory", address(factory));
        console.log("Horos Core", core);
    }
}
