// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract ZisipayVault is ERC4626, Ownable, Pausable, ReentrancyGuard {
    uint256 public apyBps;

    event VaultDeposit(address indexed user, uint256 assets, uint256 shares);
    event VaultWithdraw(address indexed user, uint256 assets, uint256 shares);
    event ApyUpdated(uint256 previousApyBps, uint256 newApyBps);

    constructor(address _usdc, string memory name_, string memory symbol_)
        ERC20(name_, symbol_)
        ERC4626(IERC20(_usdc))
        Ownable(msg.sender)
    {}

    function setApyBps(uint256 newApyBps) external onlyOwner {
        uint256 previous = apyBps;
        apyBps = newApyBps;
        emit ApyUpdated(previous, newApyBps);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function totalAssets() public view override returns (uint256) {
        return IERC20(asset()).balanceOf(address(this));
    }

    function deposit(uint256 assets, address receiver)
        public
        override
        nonReentrant
        whenNotPaused
        returns (uint256 shares)
    {
        shares = super.deposit(assets, receiver);
        emit VaultDeposit(receiver, assets, shares);
    }

    function withdraw(uint256 assets, address receiver, address owner)
        public
        override
        nonReentrant
        whenNotPaused
        returns (uint256 shares)
    {
        shares = super.withdraw(assets, receiver, owner);
        emit VaultWithdraw(receiver, assets, shares);
    }
}
