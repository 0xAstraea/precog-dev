// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title IPrecogToken: Interface for Precog collateral tokens
 * @notice ERC20 token with owner-controlled mint, burn, and move functionality
 * @dev Extends standard ERC20 with privileged operations for PrecogMaster
 */
interface IPrecogToken is IERC20 {

    /*//////////////////////////////////////////////////////////////
                            ERC20 METADATA
    //////////////////////////////////////////////////////////////*/

    /** @notice Returns the token name */
    function name() external view returns (string memory);

    /** @notice Returns the token symbol */
    function symbol() external view returns (string memory);

    /** @notice Returns the token decimals */
    function decimals() external view returns (uint8);

    /*//////////////////////////////////////////////////////////////
                        PRIVILEGED OPERATIONS
    //////////////////////////////////////////////////////////////*/

    /** @notice Mints tokens to an address (owner only) */
    function mint(address to, uint256 amount) external;

    /** @notice Burns tokens from an address (owner only) */
    function burn(address from, uint256 amount) external;

    /** @notice Transfers tokens between addresses without approval (owner only) */
    function move(address from, address to, uint256 amount) external;

    /*//////////////////////////////////////////////////////////////
                            OWNERSHIP
    //////////////////////////////////////////////////////////////*/

    /** @notice Returns the contract owner */
    function owner() external view returns (address);

    /** @notice Transfers contract ownership (owner only) */
    function transferOwnership(address newOwner) external;

    /*//////////////////////////////////////////////////////////////
                            EVENTS
    //////////////////////////////////////////////////////////////*/

    /** @notice Emitted when ownership is transferred */
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
}