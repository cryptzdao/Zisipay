// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract BatchTransfer is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;

    event BatchExecuted(address indexed payer, uint256 total, uint256 count);

    constructor(address _usdc) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
    }

    function batchTransfer(address[] calldata recipients, uint256[] calldata amounts) external {
        require(recipients.length == amounts.length && recipients.length > 0, "Invalid input");
        uint256 total;
        for (uint256 i = 0; i < amounts.length; i++) {
            require(recipients[i] != address(0) && amounts[i] > 0, "Bad recipient/amount");
            total += amounts[i];
        }
        usdc.safeTransferFrom(msg.sender, address(this), total);
        for (uint256 i = 0; i < recipients.length; i++) {
            usdc.safeTransfer(recipients[i], amounts[i]);
        }
        emit BatchExecuted(msg.sender, total, recipients.length);
    }
}
