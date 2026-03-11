// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "./ABDKMath64x64.sol";

/**
 * @title PrecogMarketV8: An implementation for Liquidity-Sensitive LMSR market maker in Solidity
 * @author Marto (https://github.com/0xMarto)
 * @dev Feel free to leave any code improvements (DMs are open @0xMarto)
 */
contract PrecogMarketV8 {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    int128 public constant ONE_SHARE = int128(1) << 64;  // Constant to ensure no fractional share buying

    struct AccountData {
        uint64 buys;  // Total amount of Buys
        uint64 sells;  // Total amount of Sells
        uint256 deposited; // Total collateral-in on Buys
        uint256 withdrawn; // Total collateral-out on Sells
        uint256 redeemed; // Total collateral-out on Redeems (equal to redeemed shares)
        mapping(uint256 => uint256) balances;  // Shares balances by outcome (has a custom getter)
    }

    // Public variables
    address public owner;  // Should be the PrecogMaster contract
    address public token;  // ERC20 collateral of the market (to buy, sell and redeem shares)
    address public oracle;  // EOA or Contract responsible to report market result
    uint32 public id;  // Unique Identifier for the market on the Precog Master contract
    uint16 public totalOutcomes; // Amount of outcomes (2 usually mean 1=YES, 2=NO)
    uint16 public result;  // Final outcome of the market (published by the oracle)
    uint64 public closeTimestamp;  // Time when the result was reported
    uint64 public startTimestamp;  // Time when Buy/Sell shares are enabled
    uint64 public endTimestamp;  // Time when Buy/Sell shares are disabled
    bool public datesUpdateEnabled;  // Flag that enables updates to market dates (signaled by the oracle)

    // Private variables
    mapping(address => AccountData) private accounts;  // Account shares balances & stats (has custom getter)
    int128[] private shares;  // Market shares balances indexed by outcome (signed 64.64 bit fixed point number)
    uint256 private tokenScale;  // Cached scale of the initialized token (10 ** tokenDecimals)
    uint256 private initialCollateral;  // Initial amount of collateral received on setup
    int128 private alpha;  // Liquidity-Sensitive LMSR market variable (signed 64.64 bit fixed point number)
    int128 private sellFeeFactor;  // Calculate sell fees and mitigate token leaks (signed 64.64 bit fixed point number)
    int128 private currentCost;  // Current amount of liquidity in the market (signed 64.64 bit fixed point number)
    int128 private totalShares;  // Total amount of shares across all outcomes (signed 64.64 bit fixed point number)
    int128 private totalRedeemedShares;  // Total shares already redeemed (signed 64.64 bit fixed point number)
    int128 private initialShares;  // Initial shares minted for each outcome (signed 64.64 bit fixed point number)
    uint64 private totalBuys;  // Total amount of buys made from all account
    uint64 private totalSells;  // Total amount of sells made from all account
    uint8 private unlocked;  // No reentrancy flag

    // Events emitted
    event SharesBought(address indexed account, uint256 indexed outcome, uint256 amount, uint256 tokenIn);
    event SharesSold(address indexed account, uint256 indexed outcome, uint256 amount, uint256 tokenOut);
    event SharesRedeemed(address indexed account, uint256 indexed outcome, uint256 amount, uint256 tokenOut);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ResultReported(address indexed oracle, uint256 indexed result, uint256 closeTimestamp);
    event DatesUpdated(address indexed updater, uint64 newStartTimestamp, uint64 newEndTimestamp);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyOracle() {
        require(msg.sender == oracle, "Only oracle");
        _;
    }

    modifier onlyOracleOrOwner() {
        require(msg.sender == oracle || msg.sender == owner, "Only oracle or owner");
        _;
    }

    modifier lock() {
        require(unlocked == 1, "Unavailable"); // reentrancy check
        unlocked = 2;   // Activate lock! (enter critical section)
        _;
        unlocked = 1;   // Deactivate lock! (exit critical section)
    }

    /**
     * @notice Constructor like function for the market maker
     * @param _token ERC-20 token will be used to purchase and redeem rewards for the market
     */
    function initialize(address _token) external {
        require(owner == address(0) && token == address(0), "Already initialized");
        owner = msg.sender;
        token = _token;

        // Optimization: Pre fetch decimals to avoid extra calls on market trades
        uint8 decimals = ERC20(_token).decimals();
        require(decimals <= 18, "Invalid decimals");
        tokenScale = 10 ** decimals;
    }

    /**
     * @notice Sets up the market with the specified parameters
     * @param _id The unique identifier for the market
     * @param _oracle The address of the oracle that will report the result
     * @param _outcomes The number of possible outcomes for the market
     * @param _liquidity The initial funding used to seed the market (defined on initialized token)
     * @param _overround The AMM profit margin in basis points (bps) [recommended: (100 * _totalOutcomes)]
     */
    function setup(
        uint256 _id, address _oracle, uint256 _outcomes, uint256 _liquidity, uint256 _overround
    ) external onlyOwner {
        require(unlocked == 0, "Already setup");  // `unlock` it's only initialized at `_setup`
        require(_outcomes >= 2, "Invalid outcomes");  // Min 2 possible outcomes
        require(_liquidity >= tokenScale, "Invalid liquidity");  // Min 1 collateral unit (based on decimals)
        require(_overround >= 200, "Invalid overround");  // Min 2% overround (based on sensitivity)

        // Get initial liquidity tokens from sender
        IERC20(token).safeTransferFrom(msg.sender, address(this), _liquidity);

        // Call internal function to setup the market
        _setup(_id, _oracle, _outcomes, _liquidity, _overround);

        // Save initial collateral received by the market
        initialCollateral = _liquidity;
    }

    /**
     * @notice Sets up the market with the Virtual Liquidity received and specified parameters
     * @param _id The unique identifier for the market
     * @param _oracle The address of the oracle that will report the result
     * @param _outcomes Total number of possible outcomes for the market
     * @param _liquidity Initial virtual liquidity used to seed the market (defined on initialized token)
     * @param _overround The AMM profit margin in basis points (bps) [recommended: (100 * _totalOutcomes)]
     * @param _funding liquidity used to collateralize the market (should be higher than max theoretical loss)
     */
    function setupVL(
        uint256 _id, address _oracle, uint256 _outcomes, uint256 _liquidity, uint256 _overround, uint256 _funding
    ) external onlyOwner {
        require(unlocked == 0, "Already setup");  // `unlock` it's only initialized at `_setup`
        require(_outcomes >= 2, "Invalid outcomes");  // Min 2 possible outcomes
        require(_liquidity >= tokenScale, "Invalid liquidity");  // Min 1 collateral unit (based on decimals)
        require(_overround >= 200, "Invalid overround");  // Min 2% overround (based on sensitivity)

        // Calculate min collateral needed based on liquidity and overround received (LS-LMSR max-loss formula)
        uint256 maxCollateralLoss = _liquidity.mul(_overround).div(10_000);
        require(_funding >= maxCollateralLoss, "Invalid funding");

        // Get initial funding tokens from sender (max theoretical loss + dust)
        IERC20(token).safeTransferFrom(msg.sender, address(this), _funding);

        // Call internal function to setup the market
        _setup(_id, _oracle, _outcomes, _liquidity, _overround);

        // Save initial collateral received by the market
        initialCollateral = _funding;
    }

    /**
     * @notice Internal function to setup the market with the received parameters
     */
    function _setup(uint256 _id, address _oracle, uint256 _outcomes, uint256 _liquidity, uint256 _overround) internal {
        // Save basic parameters
        id = uint32(_id);  // Should be less than the 4 billon limit
        oracle = _oracle;
        totalOutcomes = uint16(_outcomes);  // Should be less than 65 thousand limit
        initialShares = _fromTokenUnits(_liquidity);

        // Calculate initialization variables
        int128 n = ABDKMath.fromUInt(_outcomes);
        int128 overround = ABDKMath.divu(_overround, 10_000); // if the overround is too low the exp function overflows
        alpha = ABDKMath.div(overround, ABDKMath.mul(n, ABDKMath.ln(n)));
        shares = new int128[](_outcomes.add(1));
        for (uint256 outcome = 1; outcome <= _outcomes; outcome++) {
            shares[outcome] = initialShares;
            totalShares = ABDKMath.add(totalShares, initialShares);
        }

        // Initialize token leak mitigation of 0.001% (sellFee = 1/sellFeeFactor)
        // Note: Needed to avoid leaks due to rounding errors on math logarithmic and exponential approximations
        sellFeeFactor = ABDKMath.fromUInt(100_000);  // 100k as signed 64.64 bit fixed point

        // Calculate current cost on the market
        int128 beta = ABDKMath.mul(totalShares, alpha);
        currentCost = _cost(shares, beta);

        // Register successful setup and initialize reentrancy locks
        unlocked = 1;
    }

    /**
     * @notice Buys outcome shares for the specified outcome
     * @param _outcome The outcome of which shares are being bought (e.g.: 1 for YES, 2 for NO)
     * @param _amount The number of outcome shares to buy (as a signed 64.64-bit fixed point number)
     * @param _maxCost Max amount of collateral tokens to spend (0 = no limit, skip slippage check)
     * @return tokenCost The total token amount used for buying the specified amount of outcome shares
     */
    function buy(uint256 _outcome, int128 _amount, uint256 _maxCost) external lock
    returns (uint256 tokenCost) {
        // Send BUY call with msg sender as buyer and payer
        tokenCost = _buy(_outcome, _amount, msg.sender, msg.sender);
        if (_maxCost != 0) require(tokenCost <= _maxCost, "Buy cost too high");
    }

    /**
     * @notice Internal function to buy market shares for a specific buyer and payer
     * @param _outcome The outcome of which shares are being bought (e.g.: 1 for YES, 2 for NO)
     * @param _amount The number of outcome shares to buy (as a signed 64.64-bit fixed point number)
     * @param _buyer The address of the account that receives the outcome shares
     * @param _payer The address that pays the token cost of the trade (usually the buyer)
     * @return tokenCost The total token amount used for buying the specified amount of outcome shares
     */
    function _buy(uint256 _outcome, int128 _amount, address _buyer, address _payer) internal
    returns (uint256 tokenCost) {
        _checkOpenMarket();
        require(_outcome > 0 && _outcome <= totalOutcomes, "Invalid outcome");
        require(_amount > 0 && _amount % ONE_SHARE == 0, "Invalid amount");

        // Add amount of shares to be bought from specific outcome and calculate new total shares
        shares[_outcome] = ABDKMath.add(shares[_outcome], _amount);
        int128 newTotalShares = ABDKMath.add(totalShares, _amount);

        // Calculate new cost and tokens to receive (deltaCost)
        int128 newBeta = ABDKMath.mul(alpha, newTotalShares);
        int128 newCost = _cost(shares, newBeta);
        int128 deltaCost = ABDKMath.sub(newCost, currentCost);

        // Save new cost and new total shares of the market
        currentCost = newCost;
        totalShares = newTotalShares;

        // Get amount of tokens from sender (as current payment)
        tokenCost = _toTokenUnits(deltaCost);
        require(tokenCost > 0, "Invalid cost");
        IERC20(token).safeTransferFrom(_payer, address(this), tokenCost);
        uint256 outcomeShares = _toTokenUnits(_amount);

        // Register BUY in market total and Account details
        totalBuys += 1;  // SafeMath not needed here (max 2^64)
        AccountData storage account = accounts[_buyer];
        account.buys += 1;  // SafeMath not needed here (max 2^64)
        account.deposited = account.deposited.add(tokenCost);
        account.balances[_outcome] = account.balances[_outcome].add(outcomeShares);

        emit SharesBought(_buyer, _outcome, outcomeShares, tokenCost);
        return tokenCost;
    }

    /**
     * @notice Sells outcome shares for the specified outcome
     * @param _outcome The outcome of which shares are being sold (e.g.: 1 for YES, 2 for NO)
     * @param _amount The number of outcome shares to sell (as a signed 64.64-bit fixed point number)
     * @param _minReturn Min amount of collateral tokens to obtain (slippage protection)
     * @return tokenReturn The total amount of tokens received from selling the outcome shares
     */
    function sell(uint256 _outcome, int128 _amount, uint256 _minReturn) external lock
    returns (uint256 tokenReturn) {
        // Send SELL call to internal function with the msg sender as seller and receiver
        tokenReturn = _sell(_outcome, _amount, msg.sender, msg.sender);
        if (_minReturn != 0) require(tokenReturn >= _minReturn, "Sell return too low");
    }

    /**
     * @notice Internal function to sell market shares for a specific seller and receiver
     * @param _outcome The outcome for which shares are being sold (e.g.: 1 for YES, 2 for NO)
     * @param _amount The number of outcome shares to sell (as a signed 64.64-bit fixed point number)
     * @param _seller The address of the account that sells the shares balance
     * @param _receiver The address that receive the token return of the trade (usually the seller)
     * @return tokenReturn The total amount of tokens received from selling the outcome shares
     */
    function _sell(uint256 _outcome, int128 _amount, address _seller, address _receiver) internal
    returns (uint256 tokenReturn) {
        _checkOpenMarket();
        require(sellFeeFactor > 0, "Market sells disabled");
        require(_outcome > 0 && _outcome <= totalOutcomes, "Invalid outcome");
        require(_amount > 0 && _amount % ONE_SHARE == 0, "Invalid amount");

        // Get seller account from storage
        AccountData storage account = accounts[_seller];
        uint256 accountOutcomeBalance = account.balances[_outcome];

        // Check that the received account has the amount of shares to sell (account balance are in uint256)
        uint256 outcomeShares = _toTokenUnits(_amount);
        require(accountOutcomeBalance >= outcomeShares, "Insufficient shares");

        // Remove amount of shares to be sold from the specific outcome and calculate new total shares
        shares[_outcome] = ABDKMath.sub(shares[_outcome], _amount);
        int128 newTotalShares = ABDKMath.sub(totalShares, _amount);

        // Calculate new cost and tokens to return (deltaCost - sellFeeCost)
        int128 newBeta = ABDKMath.mul(alpha, newTotalShares);
        int128 newCost = _cost(shares, newBeta);
        int128 deltaCost = ABDKMath.sub(currentCost, newCost);
        require(deltaCost >= 0, "Invalid delta cost"); // Safety check
        int128 sellFeeCost = ABDKMath.div(deltaCost, sellFeeFactor);  // sellFee = 1/sellFeeFactor

        // Save new cost and new total shares of the market
        currentCost = newCost;
        totalShares = newTotalShares;

        // Calculate return amount of token to send (should be always positive or zero in extreme cases)
        tokenReturn = _toTokenUnits(ABDKMath.sub(deltaCost, sellFeeCost));

        // Register SELL in market total and Account details
        totalSells += 1;  // SafeMath not needed here (max 2^64)
        account.sells += 1;  // SafeMath not needed here (max 2^64)
        account.withdrawn = account.withdrawn.add(tokenReturn);
        account.balances[_outcome] = accountOutcomeBalance.sub(outcomeShares);

        // Transfer collateral tokens to the receiver account
        IERC20(token).safeTransfer(_receiver, tokenReturn);

        emit SharesSold(_seller, _outcome, outcomeShares, tokenReturn);
        return tokenReturn;
    }

    /**
     * @notice Internal function to open market state (used on `buy` and `sell`)
     */
    function _checkOpenMarket() internal view {
        uint64 start = startTimestamp;
        uint64 end = endTimestamp;
        uint64 close = closeTimestamp;

        require(block.timestamp >= start, "Market not started");
        require(end == 0 || block.timestamp <= end, "Market ended");
        require(close == 0, "Market already closed");
    }

    /**
     * @notice Redeems the current sender shares for the result of the market
     * @return redeemedShares The number of shares redeemed
     */
    function redeemShares() external lock returns (uint256 redeemedShares) {
        return _redeem(msg.sender);
    }

    /**
     * @notice Internal function to redeems winning shares for a specific account
     * @param _account The address of the account with winning shares of the market
     * @return redeemedShares The number of shares redeemed
     */
    function _redeem(address _account) internal returns (uint256 redeemedShares) {
        // Check current state of the market and received account
        require(closeTimestamp > 0, "Market not closed");
        require(accounts[_account].redeemed == 0, "Shares already redeemed");

        // Get amount of shares to be redeemed for received account
        redeemedShares = accounts[_account].balances[result];
        require(redeemedShares > 0, "Nothing to redeem");

        // Register amount of shares redeemed and send corresponding collateral tokens (ratio 1:1)
        totalRedeemedShares = ABDKMath.add(totalRedeemedShares, _fromTokenUnits(redeemedShares));
        accounts[_account].redeemed = redeemedShares;
        IERC20(token).safeTransfer(_account, redeemedShares);

        emit SharesRedeemed(_account, result, redeemedShares, redeemedShares);
        return redeemedShares;
    }

    /**
     * @notice Reports the result of the market (limited to only Oracle)
     * @param _id The unique identifier of the market
     * @param _outcome The outcome that is reported as the result of the market
     */
    function reportResult(uint256 _id, uint256 _outcome) external lock onlyOracle {
        require(_id == id, "Invalid market");
        require(_outcome > 0 && _outcome <= totalOutcomes, "Invalid outcome");

        // Check current state of the market
        require(block.timestamp > endTimestamp, "Market not ended");
        require(closeTimestamp == 0, "Market already closed");

        // Verify that the collateral on the market is higher than the redeemable collateral
        uint256 marketCollateral = IERC20(token).balanceOf(address(this));
        int128 winningShares = ABDKMath.sub(shares[_outcome], initialShares);
        uint256 redeemableCollateral = _toTokenUnits(winningShares);
        require(marketCollateral >= redeemableCollateral, "Market not closable");

        // Register reported result and current time
        result = uint16(_outcome);  // The index should be less than 65 thousand limit (same as total outcomes)
        closeTimestamp = uint64(block.timestamp);  // Should be less than 500 billon years

        emit ResultReported(msg.sender, result, closeTimestamp);
    }

    /**
     * @notice Redeems shares in batch for multiple accounts  (limited to only Oracle or Owner)
     * @param _accounts The list of accounts to redeem shares for (skips account if can not redeem)
     * @dev The list of accounts could be calculated using the "SharesBought" event
     * @return redeems The number of successful redeems
     */
    function redeemBatch(address[] memory _accounts) external lock onlyOracleOrOwner
    returns (uint256 redeems) {
        bool closed = closeTimestamp > 0;  // Cached variable
        require(closed, "Market not closed");
        require(_accounts.length <= 100, "Batch too large");

        uint16 winningOutcome = result;  // Cached variable
        for (uint256 i = 0; i < _accounts.length; i++) {
            AccountData storage account = accounts[_accounts[i]];
            if (closed && account.redeemed == 0 && account.balances[winningOutcome] > 0) {
                _redeem(_accounts[i]);
                redeems += 1;
            }
        }
        return redeems;
    }

    /**
     * @notice Authorize market owner to update start and end timestamps (limited to only Oracle)
     * @dev Used when the oracle authorize/request early market closure
     * @param _id The unique identifier of the market
     */
    function enableDatesUpdate(uint256 _id) external onlyOracle {
        require(_id == id, "Invalid market");
        require(!datesUpdateEnabled, "Date updates already enabled");

        // Enable market dates updates
        datesUpdateEnabled = true;
    }

    /**
     * @notice Execute internal buy for received buyer and payer (limited to only owner)
     * @dev No reentrancy guard - Owner (PrecogMaster) must use its own lock modifier (to avoid double-locking)
     * @param _buyer The address of the account that receives the outcome shares
     * @param _payer The address that pays the token cost of the trade (usually the buyer)
     * @param _outcome The outcome of which shares are being bought (e.g.: 1 for YES, 2 for NO)
     * @param _amount The number of outcome shares to buy (as a signed 64.64-bit fixed point number)
     * @return tokenCost The total token amount used for buying the specified amount of outcome shares
     */
    function buyFor(address _buyer, address _payer, uint256 _outcome, int128 _amount) external onlyOwner
    returns (uint256 tokenCost) {
        return _buy(_outcome, _amount, _buyer, _payer);
    }

    /**
     * @notice Execute internal sell for received seller and receiver (limited to only owner)
     * @dev No reentrancy guard - Owner (PrecogMaster) must use its own lock modifier (to avoid double-locking)
     * @param _seller The address of the account that sells the shares balance
     * @param _receiver The address that receive the token return of the trade (usually the seller)
     * @param _outcome The outcome for which shares are being sold (e.g.: 1 for YES, 2 for NO)
     * @param _amount The number of outcome shares to sell (as a signed 64.64-bit fixed point number)
     * @return tokenReturn The total amount of tokens received from selling the outcome shares
     */
    function sellFor(address _seller, address _receiver, uint256 _outcome, int128 _amount) external onlyOwner
    returns (uint256 tokenReturn) {
        return _sell(_outcome, _amount, _seller, _receiver);
    }

    /**
     * @notice Execute internal redeem for received account (limited to only owner)
     * @dev No reentrancy guard - Owner (PrecogMaster) must use its own lock modifier (to avoid double-locking)
     * @param _account The address of the account with winning shares of the market
     * @return redeemedShares The number of shares redeemed
     */
    function redeemFor(address _account) external onlyOwner returns (uint256 redeemedShares) {
        return _redeem(_account);
    }

    /**
     * @notice Updates the start and end timestamps for the market with oracle authorization (limited to only owner)
     * @param _newStartTimestamp The timestamp when the market starts allowing trading
     * @param _newEndTimestamp The timestamp when the market stops allowing trading
     */
    function updateDates(uint256 _newStartTimestamp, uint256 _newEndTimestamp) external onlyOwner {
        require(_newStartTimestamp <= _newEndTimestamp, "Invalid new dates");
        require(startTimestamp == 0 || datesUpdateEnabled, "Date updates disabled");

        startTimestamp = uint64(_newStartTimestamp);  // Should be less than 500 billon years
        endTimestamp = uint64(_newEndTimestamp);  // Should be less than 500 billon years

        // Revoke oracle authorization and emit event
        datesUpdateEnabled = false;
        emit DatesUpdated(msg.sender, startTimestamp, endTimestamp);
    }

    /**
     * @notice Update the oracle address of the market (limited to only owner)
     * @param _newOracle The address of the EOA or contract that can close the market
     */
    function updateOracle(address _newOracle) external onlyOwner {
        require(_newOracle != address(0), "Invalid new oracle");
        oracle = _newOracle;
    }

    /**
     * @notice Update the sell fee factor of the market (limited to only owner)
     * @param _newSellFeeFactor Used to calculate sell fees (1/sellFeeFactor) and mitigate leaks on math roundings
     */
    function updateSellFeeFactor(uint256 _newSellFeeFactor) external onlyOwner {
        // Note: Can't be lower than 0.001% to avoid token leaks due to rounding errors (sellFee = 1 / sellFeeFactor)
        require(_newSellFeeFactor <= 100_000, "Invalid new factor");
        sellFeeFactor = ABDKMath.fromUInt(_newSellFeeFactor);  // new value as signed 64.64 bit fixed point
    }

    /**
     * @notice Withdraws any remaining collateral from the market (limited to only owner)
     * @param _to The destination address of the ERC-20 collateral to withdraw
     */
    function withdrawAvailableCollateral(address _to) external lock onlyOwner returns (uint256 amount) {
        require(closeTimestamp > 0, "Market not closed");

        // Gets collateral amount available to be withdraw (taking into account past & future redeems)
        amount = getWithdrawableCollateral();

        // Transfer available tokens
        IERC20(token).safeTransfer(_to, amount);
        return amount;
    }

    /**
     * @notice Withdraws any non-collateral token or native balance received by the market (limited to only owner)
     * @dev Emergency function to rescue funds received by the market
     * @param _token The address of the ERC-20 token to withdraw
     */
    function withdraw(address _token) external lock onlyOwner returns (uint256 amount) {
        require(closeTimestamp > 0, "Market not closed");
        require(_token != token, "Invalid token");

        if (_token == address(0)) {
            amount = address(this).balance;
            (bool ok,) = msg.sender.call{value: amount}("");
            require(ok, "ETH withdraw failed");
        } else {
            amount = IERC20(_token).balanceOf(address(this));
            IERC20(_token).safeTransfer(msg.sender, amount);
        }
        return amount;
    }

    /**
     * @notice Transfers the ownership of the contract to a new owner (limited to only owner)
     * @param _newOwner The address of the new owner
     */
    function transferOwnership(address _newOwner) external virtual onlyOwner {
        require(_newOwner != address(0), "Invalid new owner");
        emit OwnershipTransferred(owner, _newOwner);
        owner = _newOwner;
    }

    /**
     * @notice Gets the cost of buying the specified amount of outcome shares
     * @param _outcome The outcome for which shares are being bought
     * @param _amount The number of outcome shares to buy (as signed 64.64-bit fixed point number)
     * @return tokenCost The token cost amount (as a signed 64.64-bit fixed point number)
     */
    function buyPrice(uint256 _outcome, int128 _amount) public view returns (int128 tokenCost) {
        require(_outcome > 0 && _outcome <= totalOutcomes, 'Invalid outcome');
        require(_amount > 0, 'Invalid amount');  // No integer-share validation to allow continuous price curves
        return ABDKMath.sub(_costAfterBuy(_outcome, _amount), currentCost);
    }

    /**
     * @notice Gets the return from selling the specified amount of outcome shares
     * @param _outcome The outcome for which shares are being sold
     * @param _amount The number of outcome shares to sell (as signed 64.64-bit fixed point number)
     * @return tokenReturn The token return amount (as a signed 64.64-bit fixed point number)
     */
    function sellPrice(uint256 _outcome, int128 _amount) public view returns (int128 tokenReturn) {
        require(_outcome > 0 && _outcome <= totalOutcomes, 'Invalid outcome');
        // Note: No integer-share validation to allow continuous price curves. Also validating against total minted
        require(_amount > 0 && _amount <= shares[_outcome], 'Invalid amount');
        int128 deltaCost = ABDKMath.sub(currentCost, _costAfterSell(_outcome, _amount));
        int128 sellFeeCost = ABDKMath.div(deltaCost, sellFeeFactor);
        return ABDKMath.sub(deltaCost, sellFeeCost);
    }

    /**
     * @notice Gets total collateral amount available to be withdraw after all winning shares redeems
     */
    function getWithdrawableCollateral() public view returns (uint256) {
        // No collateral is available to withdraw until a valid result is registered
        if (result == 0) {
            return 0;
        }

        // Get all collateral currently on the market
        uint256 marketCollateral = IERC20(token).balanceOf(address(this));

        // Calculate all collateral left to be redeemed by the winning shares (winning shares - already redeem)
        int128 winningShares = ABDKMath.sub(shares[result], initialShares);
        uint256 redeemableCollateral = _toTokenUnits(ABDKMath.sub(winningShares, totalRedeemedShares));

        return SafeMath.sub(marketCollateral, redeemableCollateral);
    }

    /**
     * @notice Gets the current market state information
     * @return totalShares The current total shares minted for all outcomes of the market
     * @return sharesBalances Balances of all outcomes (indexed by outcome)
     * @return totalRedeemedShares Total redeemed shares of the reported outcome
     * @return currentCost The current liquidity of the market
     * @return totalBuys Buys counter of the market
     * @return totalSells Sells counter of the market
     */
    function getMarketInfo() external view returns (int128, int128[] memory, int128, int128, uint256, uint256) {
        int128[] memory sharesBalances = new int128[](shares.length);

        // Verify if market setup was made
        if (unlocked == 0) {
            return (0, sharesBalances, 0, 0, 0, 0);
        }

        // Populate shares balances based on total outcomes configured for the market
        for (uint256 outcome = 1; outcome <= totalOutcomes; outcome++) {
            sharesBalances[outcome] = shares[outcome];
        }

        return (totalShares, sharesBalances, totalRedeemedShares, currentCost, totalBuys, totalSells);
    }

    /**
     * @notice Gets the market setup parameters
     * @return initialShares The total initial shares minted for each outcome [ qi ]
     * @return alpha The calculated alpha the market [ overround/(n.log(n)) ]
     * @return outcomes Total amount of possible outcomes of the market [ n ]
     * @return sellFeeFactor used to mitigate token leaks and calculate sell fees [ 1/sellFeeFactor ]
     * @return initialCollateral The total initial collateral received on market setup [ funding ]
     */
    function getMarketSetupInfo() external view returns (int128, int128, uint256, int128, uint256) {
        return (initialShares, alpha, totalOutcomes, sellFeeFactor, initialCollateral);
    }

    /**
     * @notice Gets current market buy and sell prices for all outcomes
     * @dev Helper function to fast calculate market prediction and spreads
     * @return buyPrices buy price of 1 share for all outcomes (indexed by outcome)
     * @return sellPrices sell price of 1 share for all outcomes (indexed by outcome)
     */
    function getPrices() external view returns (uint256[] memory buyPrices, uint256[] memory sellPrices) {
        buyPrices = new uint256[](shares.length);
        sellPrices = new uint256[](shares.length);
        for (uint256 outcome = 1; outcome <= totalOutcomes; outcome++) {
            buyPrices[outcome] = _toTokenUnits(buyPrice(outcome, ONE_SHARE));
            sellPrices[outcome] = _toTokenUnits(sellPrice(outcome, ONE_SHARE));
        }
        return (buyPrices, sellPrices);
    }

    /**
     * @notice Returns aggregated trading and settlement statistics for an account
     * @param _account Address of the account to query
     * @return buys Total number of buy operations executed by the account
     * @return sells Total number of sell operations executed by the account
     * @return deposited Total collateral deposited via buy operations
     * @return withdrawn Total collateral withdrawn via sell operations
     * @return redeemed Total collateral withdrawn via redeem operation (equal to total redeemed shares)
     */
    function getAccountStats(address _account) external view returns (
        uint256 buys, uint256 sells, uint256 deposited, uint256 withdrawn, uint256 redeemed
    ) {
        AccountData storage account = accounts[_account];
        return (account.buys, account.sells, account.deposited, account.withdrawn, account.redeemed);
    }

    /**
     * @notice Gets the amount of shares that an account owns for all outcomes
     * @param _account The address of the account to query
     * @return balances The balances of shares for all outcomes (indexed by outcome)
     */
    function getAccountOutcomeBalances(address _account) external view returns (uint256[] memory balances) {
        balances = new uint256[](shares.length);
        for (uint256 outcome = 1; outcome <= totalOutcomes; outcome++) {
            balances[outcome] = accounts[_account].balances[outcome];
        }
        return balances;
    }

    /**
     * @notice Get the total cost value in the market based on received parameters
     * @return totalCost The total cost in the form of a signed 64.64-bit fixed point number
     */
    function _cost(int128[] memory _shares, int128 _beta) internal pure returns (int128) {
        // Implementation based on LS-LMSR Formula: cost=b.ln(∑ e^(Qi/b))
        // Math fix: Avoid overflows using Log-Sum-Exp (LSE) function: ln(∑e^x) = c + ln(∑ e^(x-c)) with c=max(x)
        uint256 outcomes = _shares.length - 1;  // shares indexed start in 1

        // Find max exponent of the LS-LMSR formula: max(shares[outcome] / beta)
        int128 maxExponent = ABDKMath.div(_shares[1], _beta);
        for (uint256 i = 2; i <= outcomes; i++) {
            int128 x = ABDKMath.div(_shares[i], _beta);
            if (x > maxExponent) maxExponent = x;
        }

        // Calculate total sum of exp(x - maxExponent)
        int128 sum;
        for (uint256 i = 1; i <= outcomes; i++) {
            int128 x = ABDKMath.div(_shares[i], _beta);
            sum = ABDKMath.add(sum, ABDKMath.exp(ABDKMath.sub(x, maxExponent)));
        }

        // Return calculated cost = beta * (maxExponent + ln(sum))
        return ABDKMath.mul(_beta, ABDKMath.add(ABDKMath.ln(sum), maxExponent));
    }

    /**
     *  @notice Gets the total collateral value in the market after a received BUY trade (used in simulations)
     *  @dev Internal function used to calculate buy price
     */
    function _costAfterBuy(uint256 _outcome, int128 _amount) internal view returns (int128) {
        // Initialize and copy shares variable (on memory)
        int128[] memory newShares = new int128[](shares.length);
        for (uint256 outcome = 1; outcome <= totalOutcomes; outcome++) {
            newShares[outcome] = shares[outcome];
        }

        // Apply potential new trade to shares copy
        newShares[_outcome] = ABDKMath.add(newShares[_outcome], _amount);

        // Calculate potential new beta (based on new total shares and fixed alpha)
        int128 newBeta = ABDKMath.mul(alpha, ABDKMath.add(totalShares, _amount));

        // Return potential new cost after received trade
        return _cost(newShares, newBeta);
    }

    /**
     *  @notice Gets the total collateral value in the market after a received SELL trade (used in simulations)
     *  @dev Internal function used to calculate sell price
     */
    function _costAfterSell(uint256 _outcome, int128 _amount) internal view returns (int128) {
        // Initialize and copy shares variable (on memory)
        int128[] memory newShares = new int128[](shares.length);
        for (uint256 outcome = 1; outcome <= totalOutcomes; outcome++) {
            newShares[outcome] = shares[outcome];
        }

        // Apply potential new trade to shares copy
        newShares[_outcome] = ABDKMath.sub(newShares[_outcome], _amount);

        // Calculate potential new beta (based on new total shares and fixed alpha)
        int128 newBeta = ABDKMath.mul(alpha, ABDKMath.sub(totalShares, _amount));

        // Return potential new cost after received trade
        return _cost(newShares, newBeta);
    }

    /**
     * @notice Converts a signed 64.64 fixed-point amount (int128) into token units (uint256).
     * @dev Rounds to nearest instead of flooring when using `.mulu`.
     * @param _amount Amount in internal 64.64 fixed-point representation.
     * @return Token amount in smallest token units (e.g. wei).
     */
    function _toTokenUnits(int128 _amount) internal view returns (uint256) {
        // Increase result by half to avoid flooring error of `.mulu`
        int128 halfUnit = (int128(1) << 63) / int128(tokenScale);
        return ABDKMath.mulu(ABDKMath.add(_amount, halfUnit), tokenScale);
    }

    /**
     * @notice Converts a token amount (uint256) into signed 64.64 fixed-point format (int128).
     * @dev Used to normalize token amounts into the internal math representation.
     * @param _amount Token amount in smallest token units (e.g. wei).
     * @return Amount in internal 64.64 fixed-point representation.
     */
    function _fromTokenUnits(uint256 _amount) internal view returns (int128) {
        return ABDKMath.divu(_amount, tokenScale);
    }
}
