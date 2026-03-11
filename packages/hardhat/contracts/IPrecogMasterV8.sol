// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;
pragma abicoder v2;

/**
 * @title IPrecogMasterV8
 * @notice Interface for PrecogMasterV8 — public and onlyMarketOperator functions.
 */
interface IPrecogMasterV8 {

    /*//////////////////////////////////////////////////////////////
                                STRUCTS
    //////////////////////////////////////////////////////////////*/

    struct MarketData {
        string question;
        string resolutionCriteria;
        string imageURL;
        string category;
        string outcomes;
        address creator;
        address operator;
        address market;
        uint256 startTimestamp;
        uint256 endTimestamp;
        address collateral;
    }

    struct MarketConfig {
        address oracle;
        uint256 totalOutcomes;
        uint256 liquidity;
        uint256 overround;
        int256 sellFeeFactor;
        uint256 collateralFunding;
        address collateralFunder;
    }

    /*//////////////////////////////////////////////////////////////
                                EVENTS
    //////////////////////////////////////////////////////////////*/

    event MarketCreated(address indexed creator, address indexed operator, uint256 id, address market);

    /*//////////////////////////////////////////////////////////////
                        PUBLIC STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice Total markets created
    function createdMarkets() external view returns (uint256);

    /// @notice Market data of created markets
    function markets(uint256 marketId) external view returns (
        string memory question,
        string memory resolutionCriteria,
        string memory imageURL,
        string memory category,
        string memory outcomes,
        address creator,
        address operator,
        address market,
        uint256 startTimestamp,
        uint256 endTimestamp,
        address collateral
    );

    /// @notice Whitelisted market oracles for market operators
    function allowedOracles(address oracle) external view returns (bool);

    /// @notice Whitelisted market collaterals for market operators
    function allowedCollaterals(address collateral) external view returns (bool);

    /// @notice Allowed receivers of market funding withdrawals
    function allowedReceivers(address receiver) external view returns (bool);

    /// @notice Special collaterals owned by this contract
    function ownedCollaterals(address collateral) external view returns (bool);

    /*//////////////////////////////////////////////////////////////
                            TRADING FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Buys shares for the specified outcome in the desired market
     * @param marketId Unique market identifier to trade
     * @param outcome The outcome index of which shares are being bought (e.g.: 1 for YES, 2 for NO)
     * @param sharesAmount Number of outcome shares to buy (as a signed 64.64-bit fixed point number)
     * @param maxAmountIn Max amount of collateral tokens willing to spend (slippage protection)
     * @return amountIn Actual amount of collateral tokens spent on the trade
     */
    function marketBuy(
        uint256 marketId,
        uint256 outcome,
        int128 sharesAmount,
        uint256 maxAmountIn
    ) external returns (uint256 amountIn);

    /**
     * @notice Buys shares using EIP-2612 permit signature for gasless approval (advanced, gas-optimized path)
     * @dev The permit signature must approve the Market contract directly (not Master) as the spender.
     * @param marketId Unique market identifier to trade
     * @param outcome The outcome index of which shares are being bought (e.g.: 1 for YES, 2 for NO)
     * @param sharesAmount Number of outcome shares to buy (as a signed 64.64-bit fixed point number)
     * @param maxAmountIn Max amount of collateral tokens willing to spend (slippage protection)
     * @param deadline Unix timestamp after which the permit signature expires
     * @param v Recovery byte of the ECDSA signature
     * @param r First 32 bytes of the ECDSA signature
     * @param s Second 32 bytes of the ECDSA signature
     * @return amountIn Actual amount of collateral tokens spent on the trade
     */
    function marketBuyWithPermit(
        uint256 marketId,
        uint256 outcome,
        int128 sharesAmount,
        uint256 maxAmountIn,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external returns (uint256 amountIn);

    /**
     * @notice Buys shares using Permit2 signature for gasless approval (single transaction, any token)
     * @dev This function uses Uniswap's Permit2 contract for signature-based token transfers.
     * @param marketId Unique market identifier to trade
     * @param outcome The outcome index of which shares are being bought (e.g.: 1 for YES, 2 for NO)
     * @param sharesAmount Number of outcome shares to buy (as a signed 64.64-bit fixed point number)
     * @param maxAmountIn Max amount of collateral tokens willing to spend (slippage protection)
     * @param nonce Unique value to prevent signature replay (from Permit2 contract)
     * @param deadline Unix timestamp after which the permit signature expires
     * @param sig Permit2 signature authorizing the transfer
     * @return amountIn Actual amount of collateral tokens spent on the trade
     */
    function marketBuyWithPermit2(
        uint256 marketId,
        uint256 outcome,
        int128 sharesAmount,
        uint256 maxAmountIn,
        uint256 nonce,
        uint256 deadline,
        bytes calldata sig
    ) external returns (uint256 amountIn);

    /**
     * @notice Buys shares for the specified outcome in a owned collateralized market (advanced, non-approve path)
     * @param marketId Unique market identifier to trade
     * @param outcome The outcome index of which shares are being bought (e.g.: 1 for YES, 2 for NO)
     * @param sharesAmount Number of outcome shares to buy (as a signed 64.64-bit fixed point number)
     * @param maxAmountIn Max amount of collateral tokens willing to spend (slippage protection)
     * @return amountIn Actual amount of collateral tokens spent on the trade
     */
    function ownedMarketBuy(
        uint256 marketId,
        uint256 outcome,
        int128 sharesAmount,
        uint256 maxAmountIn
    ) external returns (uint256 amountIn);

    /**
     * @notice Sells shares for the specified outcome in the desired market
     * @param marketId Unique market identifier to trade
     * @param outcome The outcome of which shares are being sold (e.g.: 1 for YES, 2 for NO)
     * @param sharesAmount Number of outcome shares to sell (as a signed 64.64-bit fixed point number)
     * @param minAmountOut Min amount of collateral tokens to obtain (slippage protection)
     * @return amountOut Token amount obtain from selling the specified amount of shares
     */
    function marketSell(
        uint256 marketId,
        uint256 outcome,
        int128 sharesAmount,
        uint256 minAmountOut
    ) external returns (uint256 amountOut);

    /**
     * @notice Redeems the total sender shares in the desired market
     * @param marketId Unique market identifier
     * @return shares Number of shares redeemed
     */
    function marketRedeemShares(uint256 marketId) external returns (uint256 shares);

    /*//////////////////////////////////////////////////////////////
                            PRICE QUERIES
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Gets the cost of buying the specified amount of outcome shares in the desired market
     * @param marketId Unique market identifier to trade
     * @param outcome The outcome for which tokens are being bought
     * @param sharesAmount Number of outcome shares to buy (as signed 64.64-bit fixed point number)
     * @return tokenCost The token cost amount (as a signed 64.64-bit fixed point number)
     */
    function marketBuyPrice(
        uint256 marketId,
        uint256 outcome,
        int128 sharesAmount
    ) external view returns (int128 tokenCost);

    /**
     * @notice Gets the return from selling the specified amount of outcome shares in the desired market
     * @param marketId Unique market identifier to trade
     * @param outcome The outcome for which shares are being sold
     * @param sharesAmount The number of outcome shares to sell (as signed 64.64-bit fixed point number)
     * @return tokenReturn The token return amount (as a signed 64.64-bit fixed point number)
     */
    function marketSellPrice(
        uint256 marketId,
        uint256 outcome,
        int128 sharesAmount
    ) external view returns (int128 tokenReturn);

    /**
     * @notice Gets market buy and sell prices for all outcomes of the desired market
     * @dev Helper function to fast calculate market prediction and spreads
     * @param marketId unique market identifier to trade
     * @return buyPrices buy price of 1 share for all outcomes (indexed by outcome)
     * @return sellPrices sell price of 1 share for all outcomes (indexed by outcome)
     */
    function marketPrices(uint256 marketId) external view
    returns (uint256[] memory buyPrices, uint256[] memory sellPrices);

    /*//////////////////////////////////////////////////////////////
                            MARKET INFO
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Gets market result summary of the desired market
     * @dev Helper function to show closed market info
     * @param marketId unique market identifier to trade
     * @return result Reported market result outcome
     * @return closed Timestamp when the market result was reported
     * @return reporter Address of the market result reporter (market oracle)
     */
    function marketResultInfo(uint256 marketId) external view
    returns (uint256 result, uint256 closed, address reporter);

    /**
     * @notice Gets the market setup parameters
     * @dev Helper function to show market setup info
     * @return initialShares The total initial shares minted for each outcome [ qi ]
     * @return alpha The calculated alpha the market [ overround/(n.log(n)) ]
     * @return outcomes Total amount of possible outcomes of the market [ n ]
     * @return sellFeeFactor used to mitigate token leaks and calculate sell fees [ 1/sellFeeFactor ]
     * @return initialCollateral The total initial collateral received on market setup [ funding ]
     */
    function marketSetupInfo(uint256 marketId) external view
    returns (
        int128 initialShares,
        int128 alpha,
        uint256 outcomes,
        int128 sellFeeFactor,
        uint256 initialCollateral
    );

    /**
     * @notice Gets the current market state info of the desired market
     * @dev Helper function to show general market shares info
     * @param marketId unique market identifier
     * @return totalShares Current total shares minted for all outcomes of the market
     * @return sharesBalances All shares balances (indexed by outcome)
     * @return redeemed Total redeemed shares of the reported outcome
     * @return cost Total redeemed shares of the reported outcome
     * @return buys Buys counter of the market
     * @return sells Sells counter of the market
     */
    function marketSharesInfo(uint256 marketId) external view
    returns (
        int128 totalShares,
        int128[] memory sharesBalances,
        int128 redeemed,
        int128 cost,
        uint256 buys,
        uint256 sells
    );

    /**
     * @notice Gets market account information for a specific market
     * @dev Returns trading statistics and outcome share balances for an account in the specified market.
     * @param marketId Unique market identifier
     * @param account Address of the account to query
     * @return buys Total number of buy transactions executed by this account
     * @return sells Total number of sell transactions executed by this account
     * @return deposited Total collateral deposited through buy transactions (cumulative)
     * @return withdrawn Total collateral withdrawn through sell transactions (cumulative)
     * @return redeemed Total collateral redeemed after market closure (0 if not redeemed yet)
     * @return balances Share balances for each outcome, indexed by outcome (balances[0] always unused)
     */
    function marketAccountInfo(uint256 marketId, address account) external view
    returns (
        uint256 buys,
        uint256 sells,
        uint256 deposited,
        uint256 withdrawn,
        uint256 redeemed,
        uint256[] memory balances
    );

    /**
     * @notice Gets collateral token information for a specific market
     * @dev Returns ERC20 token details (address, name, symbol, decimals) used on the market
     * @param marketId Unique market identifier
     * @return token Collateral token contract address
     * @return name Token name (e.g., "USD Coin")
     * @return symbol Token symbol (e.g., "USDC")
     * @return decimals Token decimals (e.g., 6 for USDC, 18 for DAI)
     */
    function marketCollateralInfo(uint256 marketId) external view
    returns (address token, string memory name, string memory symbol, uint8 decimals);

    /**
     * @notice Gets the global market creation configuration and protocol parameters
     * @dev Returns parameters used to validate and configure new markets created by operators.
     * @return implementation Address of the base market implementation contract used for cloning
     * @return minOverround Minimum overround (in basis points) required for market creation
     * @return minSellFeeFactor Minimum sell fee factor allowed (negative value disables validation)
     * @return feeFactor Protocol fee factor used to calculate fees on market profits (fee = 1 / feeFactor)
     */
    function getMarketsConfigs() external view
    returns (
        address implementation,
        uint256 minOverround,
        int256 minSellFeeFactor,
        uint256 feeFactor
    );

    /*//////////////////////////////////////////////////////////////
                        MARKET OPERATOR FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Creates a new prediction market with the specified configuration
     * @dev Deploys a minimal proxy clone of the base market implementation. Only callable by market operators.
     * @param data Market metadata including question, resolution criteria, outcomes, dates, and collateral
     * @param config Market parameters including oracle, liquidity, overround, and fee settings
     * @return newMarketId Unique identifier for the newly created market
     */
    function createMarket(
        MarketData memory data,
        MarketConfig memory config
    ) external returns (uint256 newMarketId);

    /**
     * @notice Withdraws available collateral from a closed market (initial funding + profits)
     * @dev Only the registered operator for the specific market can withdraw its collateral.
     * @param marketId Unique market identifier
     * @return amount Total collateral withdrawn (after protocol fee deduction, if applicable)
     */
    function withdrawMarketCollateral(uint256 marketId) external returns (uint256 amount);

    /**
     * @notice Buys shares on behalf of another account using Permit2 signature (operator-only)
     * @dev Allows market operators to execute trades for users via gasless Permit2 signatures.
     * @param account Address that will receive the purchased shares
     * @param marketId Unique market identifier
     * @param outcome Outcome index for which shares are being bought (e.g., 1=YES, 2=NO)
     * @param sharesAmount Number of shares to buy (64.64 fixed point)
     * @param maxAmountIn Max amount of collateral tokens willing to spend (slippage protection)
     * @param nonce Permit2 nonce to prevent signature replay
     * @param deadline Unix timestamp after which signature expires
     * @param sig Permit2 signature from the account authorizing the transfer
     * @return amountIn Actual collateral spent on the purchase
     */
    function buyMarketSharesFor(
        address account,
        uint256 marketId,
        uint256 outcome,
        int128 sharesAmount,
        uint256 maxAmountIn,
        uint256 nonce,
        uint256 deadline,
        bytes calldata sig
    ) external returns (uint256 amountIn);
}
