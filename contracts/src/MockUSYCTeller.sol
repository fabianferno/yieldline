// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Stand-in for Circle's USYC Teller while our pool wallet awaits testnet allowlisting.
///         Same deposit/redeem signatures as the real Teller; share price accrues linearly at `aprBps`
///         and yield is paid from USDC pre-funded into this contract. Clearly a mock — swap via LenderPool.setTeller.
contract MockUSYCTeller is ERC20 {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    uint256 public immutable start;
    uint256 public immutable aprBps;

    constructor(IERC20 _usdc, uint256 _aprBps) ERC20("Mock USYC", "mUSYC") {
        usdc = _usdc;
        aprBps = _aprBps;
        start = block.timestamp;
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice USDC per 1e6 shares.
    function price() public view returns (uint256) {
        return 1e6 + (1e6 * aprBps * (block.timestamp - start)) / (10_000 * 365 days);
    }

    function deposit(uint256 assets, address receiver) external returns (uint256 shares) {
        shares = (assets * 1e6) / price();
        usdc.safeTransferFrom(msg.sender, address(this), assets);
        _mint(receiver, shares);
    }

    function redeem(uint256 shares, address receiver, address account) external returns (uint256 assets) {
        require(account == msg.sender, "account");
        assets = (shares * price()) / 1e6;
        _burn(account, shares);
        usdc.safeTransfer(receiver, assets);
    }
}
