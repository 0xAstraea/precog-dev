// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/drafts/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract FakeUSDC is ERC20, ERC20Permit, Ownable {
    string private constant TOKEN_NAME = "USDC";
    string private constant TOKEN_SYMBOL = "USDC";

    constructor(address owner) ERC20(TOKEN_NAME, TOKEN_SYMBOL) ERC20Permit(TOKEN_SYMBOL) {
        _setupDecimals(6);
        transferOwnership(owner);
    }

    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }
}
