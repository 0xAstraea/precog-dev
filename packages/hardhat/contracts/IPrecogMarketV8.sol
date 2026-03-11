// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;

/**
 * @title IPrecogMarketV8: Interface for Precog prediction market contracts
 * @author Marto (https://github.com/0xMarto)
 * @notice Defines the public API for interacting with Precog prediction markets
 */
interface IPrecogMarketV8 {
    /*//////////////////////////////////////////////////////////////
                                EVENTS
    //////////////////////////////////////////////////////////////*/

    event SharesBought(address indexed account, uint256 indexed outcome, uint256 amount, uint256 tokenIn);
    event SharesSold(address indexed account, uint256 indexed outcome, uint256 amount, uint256 tokenOut);
    event SharesRedeemed(address indexed account, uint256 indexed outcome, uint256 amount, uint256 tokenOut);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ResultReported(address indexed oracle, uint256 indexed result, uint256 closeTimestamp);
    event DatesUpdated(address indexed updater, uint256 newStartTimestamp, uint256 newEndTimestamp);

    /*//////////////////////////////////////////////////////////////
                            VIEW VARIABLES
    //////////////////////////////////////////////////////////////*/

    /** @notice Returns the contract owner (typically PrecogMaster) */
    function owner() external view returns (address);

    /** @notice Returns the collateral token address */
    function token() external view returns (address);

    /** @notice Returns the unique market identifier */
    function id() external view returns (uint256);

    /** @notice Returns the total number of outcomes */
    function totalOutcomes() external view returns (uint256);

    /** @notice Returns the oracle address responsible for reporting results */
    function oracle() external view returns (address);

    /** @notice Returns the market start timestamp */
    function startTimestamp() external view returns (uint256);

    /** @notice Returns the market end timestamp */
    function endTimestamp() external view returns (uint256);

    /** @notice Returns the timestamp when result was reported (0 if not closed) */
    function closeTimestamp() external view returns (uint256);

    /** @notice Returns the reported market result (0 if not closed) */
    function result() external view returns (uint256);

    /** @notice Returns whether oracle can authorize date updates */
    function datesUpdateEnabled() external view returns (bool);

    /*//////////////////////////////////////////////////////////////
                            MARKET SETUP
    //////////////////////////////////////////////////////////////*/

    /** @notice Initializes the market with collateral token */
    function initialize(address _token) external;

    /** @notice Sets up a fully collateralized market */
    function setup(uint256 _id, address _oracle, uint256 _outcomes, uint256 _liquidity, uint256 _overround) external;

    /** @notice Sets up a virtually collateralized market */
    function setupVL(
        uint256 _id, address _oracle, uint256 _outcomes, uint256 _liquidity, uint256 _overround, uint256 _funding
    ) external;

    /*//////////////////////////////////////////////////////////////
                            TRADING
    //////////////////////////////////////////////////////////////*/

    /** @notice Buys outcome shares (with slippage protection) */
    function buy(uint256 _outcome, int128 _amount, uint256 _maxCost) external returns (uint256 tokenCost);

    /** @notice Sells outcome shares (with slippage protection) */
    function sell(uint256 _outcome, int128 _amount, uint256 _minReturn) external returns (uint256 tokenReturn);

    /*//////////////////////////////////////////////////////////////
                        PRICE DISCOVERY (VIEW)
    //////////////////////////////////////////////////////////////*/

    /** @notice Calculates the cost to buy shares */
    function buyPrice(uint256 _outcome, int128 _amount) external view returns (int128 tokenCost);

    /** @notice Calculates the return from selling shares */
    function sellPrice(uint256 _outcome, int128 _amount) external view returns (int128 tokenReturn);

    /** @notice Returns current buy and sell prices for all outcomes */
    function getPrices() external view returns (uint256[] memory buyPrices, uint256[] memory sellPrices);

    /*//////////////////////////////////////////////////////////////
                        MARKET INFORMATION (VIEW)
    //////////////////////////////////////////////////////////////*/

    /** @notice Returns market state and trading statistics */
    function getMarketInfo() external view returns (
        int128 totalShares,
        int128[] memory sharesBalances,
        int128 totalRedeemedShares,
        int128 currentCost,
        uint256 totalBuys,
        uint256 totalSells
    );

    /** @notice Returns market setup parameters */
    function getMarketSetupInfo() external view returns (
        int128 initialShares,
        int128 alpha,
        uint256 outcomes,
        int128 sellFeeFactor,
        uint256 initialCollateral
    );

    /** @notice Returns available collateral for withdrawal */
    function getWithdrawableCollateral() external view returns (uint256);

    /*//////////////////////////////////////////////////////////////
                        ACCOUNT INFORMATION (VIEW)
    //////////////////////////////////////////////////////////////*/

    /** @notice Returns account trading statistics */
    function getAccountStats(address _account) external view returns (
        uint256 buys,
        uint256 sells,
        uint256 deposited,
        uint256 withdrew,
        uint256 redeemed
    );

    /** @notice Returns account share balances for all outcomes */
    function getAccountOutcomeBalances(address _account) external view returns (uint256[] memory balances);

    /*//////////////////////////////////////////////////////////////
                        MARKET RESOLUTION
    //////////////////////////////////////////////////////////////*/

    /** @notice Reports the market result (oracle only) */
    function reportResult(uint256 _id, uint256 _outcome) external;

    /** @notice Redeems caller's shares after market closure */
    function redeemShares() external returns (uint256 redeemedShares);

    /** @notice Redeems shares for multiple accounts (batch operation) */
    function redeemBatch(address[] calldata _accounts) external returns (uint256 redeems);

    /*//////////////////////////////////////////////////////////////
                        ADMIN FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /** @notice Updates market start and end timestamps */
    function updateDates(uint256 _newStartTimestamp, uint256 _newEndTimestamp) external;

    /** @notice Updates the oracle address */
    function updateOracle(address _newOracle) external;

    /** @notice Updates the sell fee factor */
    function updateSellFeeFactor(uint256 _newSellFeeFactor) external;

    /** @notice Enables date updates (oracle authorization) */
    function enableDatesUpdate(uint256 _id) external;

    /** @notice Buys shares for an account with separate payer */
    function buyFor(address _buyer, address _payer, uint256 _outcome, int128 _amount) external returns (uint256);

    /** @notice Sells shares for an account with separate receiver */
    function sellFor(address _seller, address _receiver, uint256 _outcome, int128 _amount) external returns (uint256);

    /** @notice Redeems shares for an account */
    function redeemFor(address _account) external returns (uint256);

    /** @notice Withdraws accidentally sent tokens */
    function withdraw(address _token) external returns (uint256);

    /** @notice Withdraws available collateral to specified address */
    function withdrawAvailableCollateral(address _to) external returns (uint256);

    /** @notice Transfers contract ownership */
    function transferOwnership(address _newOwner) external;
}