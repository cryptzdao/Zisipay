// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract PayrollEngine is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct ScheduledBatch {
        address payer;
        address[] recipients;
        uint256[] amounts;
        uint256 totalAmount;
        uint256 executeAt;
        bool executed;
        bool cancelled;
    }

    IERC20 public usdc;

    mapping(address => bool) public registeredPayers;
    mapping(bytes32 => ScheduledBatch) public batches;

    event PayerRegistered(address indexed payer);
    event BatchPayrollExecuted(
        address indexed payer,
        uint256 totalAmount,
        uint256 recipientCount,
        uint256 timestamp
    );
    event ScheduledPayrollCreated(
        bytes32 indexed batchId,
        address indexed payer,
        uint256 totalAmount,
        uint256 executeAt,
        uint256 recipientCount
    );
    event ScheduledPayrollExecuted(
        bytes32 indexed batchId,
        address indexed payer,
        uint256 totalAmount,
        uint256 timestamp
    );
    event ScheduledPayrollCancelled(bytes32 indexed batchId, address indexed payer, uint256 timestamp);

    error UnauthorizedPayer();
    error ZeroAddress();
    error EmptyBatch();
    error LengthMismatch();
    error InvalidRecipient();
    error AmountMustBeGreaterThanZero();
    error BatchAlreadyExists();
    error BatchNotFound();
    error BatchAlreadyExecuted();
    error BatchAlreadyCancelled();
    error ExecuteTimeNotReached();
    error InvalidExecuteAt();

    modifier onlyAuthorizedPayer() {
        if (msg.sender != owner() && !registeredPayers[msg.sender]) {
            revert UnauthorizedPayer();
        }
        _;
    }

    constructor(address _usdc) Ownable(msg.sender) {
        if (_usdc == address(0)) {
            revert ZeroAddress();
        }
        usdc = IERC20(_usdc);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function registerPayer(address payer) external onlyOwner {
        if (payer == address(0)) {
            revert ZeroAddress();
        }

        registeredPayers[payer] = true;
        emit PayerRegistered(payer);
    }

    function batchPay(address[] calldata recipients, uint256[] calldata amounts)
        external
        onlyAuthorizedPayer
        whenNotPaused
        nonReentrant
    {
        uint256 totalAmount = _validateAndSumBatch(recipients, amounts);

        usdc.safeTransferFrom(msg.sender, address(this), totalAmount);

        uint256 recipientCount = recipients.length;
        for (uint256 i = 0; i < recipientCount; ++i) {
            usdc.safeTransfer(recipients[i], amounts[i]);
        }

        emit BatchPayrollExecuted(msg.sender, totalAmount, recipientCount, block.timestamp);
    }

    function schedulePayroll(
        bytes32 batchId,
        address[] calldata recipients,
        uint256[] calldata amounts,
        uint256 executeAt
    ) external onlyAuthorizedPayer whenNotPaused {
        if (executeAt < block.timestamp) {
            revert InvalidExecuteAt();
        }

        ScheduledBatch storage existing = batches[batchId];
        if (existing.payer != address(0)) {
            revert BatchAlreadyExists();
        }

        uint256 totalAmount = _validateAndSumBatch(recipients, amounts);

        ScheduledBatch storage batch = batches[batchId];
        batch.payer = msg.sender;
        batch.totalAmount = totalAmount;
        batch.executeAt = executeAt;

        uint256 recipientCount = recipients.length;
        for (uint256 i = 0; i < recipientCount; ++i) {
            batch.recipients.push(recipients[i]);
            batch.amounts.push(amounts[i]);
        }

        emit ScheduledPayrollCreated(batchId, msg.sender, totalAmount, executeAt, recipientCount);
    }

    function executeScheduled(bytes32 batchId) external whenNotPaused nonReentrant {
        ScheduledBatch storage batch = batches[batchId];

        if (batch.payer == address(0)) {
            revert BatchNotFound();
        }
        if (batch.executed) {
            revert BatchAlreadyExecuted();
        }
        if (batch.cancelled) {
            revert BatchAlreadyCancelled();
        }
        if (block.timestamp < batch.executeAt) {
            revert ExecuteTimeNotReached();
        }

        batch.executed = true;

        usdc.safeTransferFrom(batch.payer, address(this), batch.totalAmount);

        uint256 recipientCount = batch.recipients.length;
        for (uint256 i = 0; i < recipientCount; ++i) {
            usdc.safeTransfer(batch.recipients[i], batch.amounts[i]);
        }

        emit ScheduledPayrollExecuted(batchId, batch.payer, batch.totalAmount, block.timestamp);
    }

    function cancelScheduled(bytes32 batchId) external whenNotPaused {
        ScheduledBatch storage batch = batches[batchId];

        if (batch.payer == address(0)) {
            revert BatchNotFound();
        }
        if (batch.payer != msg.sender) {
            revert UnauthorizedPayer();
        }
        if (batch.executed) {
            revert BatchAlreadyExecuted();
        }
        if (batch.cancelled) {
            revert BatchAlreadyCancelled();
        }

        emit ScheduledPayrollCancelled(batchId, msg.sender, block.timestamp);
        delete batches[batchId];
    }

    function _validateAndSumBatch(address[] calldata recipients, uint256[] calldata amounts)
        internal
        pure
        returns (uint256 totalAmount)
    {
        uint256 recipientCount = recipients.length;

        if (recipientCount == 0) {
            revert EmptyBatch();
        }
        if (recipientCount != amounts.length) {
            revert LengthMismatch();
        }

        for (uint256 i = 0; i < recipientCount; ++i) {
            address recipient = recipients[i];
            uint256 amount = amounts[i];

            if (recipient == address(0)) {
                revert InvalidRecipient();
            }
            if (amount == 0) {
                revert AmountMustBeGreaterThanZero();
            }

            totalAmount += amount;
        }
    }
}
