// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;
pragma abicoder v2;

/**
 * @title IPermit2: Minimal interface for Uniswap's Permit2 contract
 * @notice Enables gasless token approvals via signature for any ERC20 token
 * @dev SignatureTransfer functionality only - see https://docs.uniswap.org/contracts/permit2
 */
interface IPermit2 {
    /** @notice Token and amount to permit */
    struct TokenPermissions {
        address token;
        uint256 amount;
    }

    /** @notice Permit data for signature-based transfer */
    struct PermitTransferFrom {
        TokenPermissions permitted;
        uint256 nonce;
        uint256 deadline;
    }

    /** @notice Transfer destination and amount */
    struct SignatureTransferDetails {
        address to;
        uint256 requestedAmount;
    }

    /** @notice Executes a token transfer using a signature-based permit */
    function permitTransferFrom(
        PermitTransferFrom memory permit,
        SignatureTransferDetails calldata transferDetails,
        address owner,
        bytes calldata signature
    ) external;
}

/**
 * @title IERC20Permit: Minimal interface for EIP-2612 permit functionality
 * @notice Enables gasless ERC20 approvals via signature (only for tokens that support it)
 * @dev See https://eips.ethereum.org/EIPS/eip-2612
 */
interface IERC20Permit {
    /** @notice Sets approval via signature instead of transaction */
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}
