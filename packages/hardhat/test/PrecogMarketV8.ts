import {expect} from "chai";
import {ethers} from "hardhat";
import {PrecogToken, PrecogMarketV8, FakeUSDC} from "../typechain-types";
import {HardhatEthersSigner} from "@nomicfoundation/hardhat-ethers/signers";
import {fromInt128toNumber, fromNumberToInt128, getCurrentBlockTimestamp, matchedDecimalPlaces} from "../libs/helpers"
import {LSLMSR} from "../libs/markets";

describe("Precog Market V8", function () {
    const detailsEnabled: boolean = process.env.TEST_DETAILS === 'true';
    let pre: PrecogToken;
    let preAddress: string;
    let market: PrecogMarketV8;
    let marketAddress: string;
    let owner: HardhatEthersSigner;
    let caller: HardhatEthersSigner;
    let user: HardhatEthersSigner;
    let quadMarket: PrecogMarketV8;
    let quadMarketAddress: string;
    let vlMarket: PrecogMarketV8;
    let vlMarketAddress: string;
    let usdc: FakeUSDC;
    let usdcAddress: string;
    let localMarket: LSLMSR;

    beforeEach(async function () {
        [owner, caller, user] = await ethers.getSigners();
    })

    describe("Deployment", function () {
        it("Deploy and Mint a test Token for users", async function () {
            // Deploy test token (to be used as collateral in markets)
            const PRE = await ethers.getContractFactory("PrecogToken");
            const precogMaster: string = owner.address;
            pre = await PRE.deploy(precogMaster);
            preAddress = await pre.getAddress();

            // Mint some token to users
            const initialSupply: bigint = ethers.parseEther('10000');
            await pre.mint(owner.address, initialSupply);
            await pre.mint(caller.address, initialSupply);
            await pre.mint(user.address, initialSupply);
            expect(await pre.balanceOf(owner.address)).to.equal(initialSupply);
            expect(await pre.balanceOf(caller.address)).to.equal(initialSupply);
            expect(await pre.balanceOf(user.address)).to.equal(initialSupply);
        })

        it("Deploy PrecogMarketV8 contract", async function () {
            const PrecogMarket = await ethers.getContractFactory("PrecogMarketV8");
            market = await PrecogMarket.deploy();
            marketAddress = await market.getAddress();
            await market.initialize(preAddress);
        })

        it("Approve PrecogMarket to spend all test Token balance from users", async function () {
            const ownerBalance: bigint = await pre.balanceOf(owner.address);
            await pre.approve(marketAddress, ownerBalance);

            const callerBalance: bigint = await pre.balanceOf(caller.address);
            await pre.connect(caller).approve(marketAddress, callerBalance);

            const userBalance: bigint = await pre.balanceOf(user.address);
            await pre.connect(user).approve(marketAddress, userBalance);

            expect(await pre.allowance(owner.address, marketAddress)).to.equal(ownerBalance);
            expect(await pre.allowance(caller.address, marketAddress)).to.equal(callerBalance);
            expect(await pre.allowance(user.address, marketAddress)).to.equal(userBalance);
        })

        it("Setup a binary outcome Market (YES/NO)", async function () {
            const ownerInitialBalance: bigint = await pre.balanceOf(owner.address);

            const marketId: number = 1;
            const totalOutcomes: number = 2;
            const initialShares: number = 2000;
            const liquidity: bigint = ethers.parseEther(initialShares.toString());
            const overround: number = 200;
            await market.setup(marketId, owner.address, totalOutcomes, liquidity, overround);

            // Calculate owner needed liquidity
            const ownerFinalBalance: bigint = await pre.balanceOf(owner.address);
            const ownerNeededBalance = ownerInitialBalance - ownerFinalBalance;
            const marketBalance = await pre.balanceOf(marketAddress);

            // Calculate theoretical initial Alpha and Beta
            const calculatedAlpha = (overround / 10000) / (totalOutcomes * Math.log(totalOutcomes));
            const calculatedBeta = (2000 * totalOutcomes) * calculatedAlpha;

            const marketSetupInfo: any[] = await market.getMarketSetupInfo();
            const marketAlpha: number = fromInt128toNumber(marketSetupInfo[1]);
            const marketInitialCollateral: bigint = marketSetupInfo[4];

            const marketInfo: any[] = await market.getMarketInfo();
            const marketTotalShares: number = fromInt128toNumber(marketInfo[0]);
            const marketBeta: number = marketTotalShares * marketAlpha;

            // Checks about initial Math calculation to ensure EVM floating point accuracy
            expect(marketAlpha).to.equal(calculatedAlpha);
            expect(marketBeta).to.equal(calculatedBeta);

            // Checks about market initialization final costs and the initial liquidity needed
            expect(marketBalance).to.equal(liquidity);
            expect(marketBalance).to.equal(ownerNeededBalance);
            expect(marketInitialCollateral).to.equal(liquidity);

            // Register local market (to make verification against local calculations)
            localMarket = new LSLMSR(['A', 'B'], marketAlpha, initialShares);
        })
    })

    describe("Check base market info and price functions", function () {
        it("| Check initial market info", async function () {
            if (detailsEnabled) console.log("");
            const marketInfo: any[] = await market.getMarketInfo();
            const totalShares: number = fromInt128toNumber(marketInfo[0]);
            const outcomeOne: number = fromInt128toNumber(marketInfo[1][1]);
            const outcomeTwo: number = fromInt128toNumber(marketInfo[1][2]);
            const cost: number = fromInt128toNumber(marketInfo[3]);
            const totalBuys: bigint = marketInfo[4];
            const totalSells: bigint = marketInfo[5];

            const marketSetupInfo: any[] = await market.getMarketSetupInfo();
            const initialShares: number = fromInt128toNumber(marketSetupInfo[0]);
            const alpha: number = fromInt128toNumber(marketSetupInfo[1]);
            const totalOutcomes: number = Number(marketSetupInfo[2]);
            const initialCollateral: bigint = marketSetupInfo[4];
            // Calculate market overround based on setup info
            const overround = alpha * Math.log(totalOutcomes) * totalOutcomes;  // Formula: Alpha=overround/(n.log(n))

            // Get total amount of collateral available to withdraw of the market
            const withdrawableCollateral = await market.getWithdrawableCollateral();

            if (detailsEnabled) {
                console.log(`\t| InitialShares (per outcome): ${initialShares}, TotalOutcomes: ${totalOutcomes}`);
                console.log(`\t| Alpha: ${alpha}, Overround: ${overround}`);
                console.log(`\t| TotalShares: ${totalShares}, OutcomeOne: ${outcomeOne}, OutcomeTwo: ${outcomeTwo}`);
                console.log(`\t| TotalDeposited: ${cost}, totalBuys: ${totalBuys}, totalSells: ${totalSells}`);
                console.log(`\t| withdrawableCollateral: ${withdrawableCollateral}`);
            }

            expect(totalOutcomes).to.equal(2); // 2 outcomes ("YES","NO")
            expect(initialShares).to.equal(2000); // 2000 shares per outcome
            expect(overround).to.equal(0.02); // 2% overround
            expect(cost).to.equal(2040); // 2000 subsidy with 2% overround (aka market maker margin)
            expect(totalShares).to.equal(4000) // 2000 subsidy with 2 outcomes
            expect(withdrawableCollateral).to.equal(0) // Zero collateral can be withdrawn before closing
            expect(initialCollateral).to.equal(ethers.parseEther('2000')) // 2000 Initial liquidity
        })

        it("| Check initial buy prices math calculation", async function () {
            if (detailsEnabled) console.log("");
            const marketInfo: any[] = await market.getMarketInfo();
            const totalShares: number = fromInt128toNumber(marketInfo[0]);
            const outcomeOne: number = fromInt128toNumber(marketInfo[1][1]);
            const outcomeTwo: number = fromInt128toNumber(marketInfo[1][2]);
            const cost: number = fromInt128toNumber(marketInfo[3]);
            const shares: number[] = [0, outcomeOne, outcomeTwo];

            const marketSetupInfo: any[] = await market.getMarketSetupInfo();
            const initialShares: number = fromInt128toNumber(marketSetupInfo[0]);
            const alpha: number = fromInt128toNumber(marketSetupInfo[1]);
            const totalOutcomes: number = Number(marketSetupInfo[2]);

            if (detailsEnabled) {
                console.log(`\t| Initial Shares: ${initialShares}, Total Outcomes: ${totalOutcomes}`);
                console.log(`\t| Total Shares: ${totalShares}, Shares: [${shares}]`);
                console.log(`\t| Current Cost: ${cost}, Alpha: ${alpha}`);
                console.log(`\t| Market Prices (on chain):`);
            }

            // Get all Buy prices from Market on-chain
            const buyPrices: any[] = [null, [], []];  // the first item is added just for simplicity
            const possibleOutcomes: number[] = [1, 2];
            const sharesAmounts: number[] = [1, 10, 100, 1000];
            for (const outcome of possibleOutcomes) {
                for (const amount of sharesAmounts) {
                    const sharesInt128: bigint = fromNumberToInt128(amount);
                    const priceInt128: bigint = await market.buyPrice(outcome, sharesInt128);
                    const price = fromInt128toNumber(priceInt128) / amount;
                    if (detailsEnabled) {
                        console.log(`\t|  Buy: outcome=${outcome}, amount=${amount} => ${price} collateral/share`);
                    }
                    buyPrices[outcome].push(price);
                }
            }

            if (detailsEnabled) {
                console.log(`\t| Market Prices (calculated locally):`);
            }

            // Calculate all Buy prices based on local calculation (with chain Shares balances and Alpha)
            const calculatedBuyPrices: any[] = [null, [], []];  // the first item is added just for simplicity
            for (const outcome of possibleOutcomes) {
                for (const amount of sharesAmounts) {
                    // Calculated price
                    const outcomeLabel = localMarket.getOutcome(outcome);
                    const cost = localMarket.tradeCost(outcomeLabel, amount);
                    const price = cost / amount;
                    if (detailsEnabled) {
                        console.log(`\t|  Buy: outcome=${outcome}, amount=${amount} => ${price} collateral/share`);
                    }
                    calculatedBuyPrices[outcome].push(price);
                }
            }

            // Check that all calculated prices are in tolerance
            const priceTolerance = 0.0000000001;  // at lease 9 digits
            sharesAmounts.forEach((_, index) => {
                expect(buyPrices[1][index]).to.be.closeTo(calculatedBuyPrices[1][index], priceTolerance);
                expect(buyPrices[2][index]).to.be.closeTo(calculatedBuyPrices[2][index], priceTolerance);
            });
        })

        it("| Check initial buy & sell prices consistency", async function () {
            if (detailsEnabled) console.log("");
            const buyPrices: any[] = [null, [], []];  // the first item is added just for simplicity
            const sellPrices: any[] = [null, [], []];  // the first item is added just for simplicity
            const possibleOutcomes: number[] = [1, 2];
            const sharesAmounts: number[] = [1, 10, 100];
            for (const outcome of possibleOutcomes) {
                for (const shares of sharesAmounts) {
                    const sharesInt128: bigint = fromNumberToInt128(shares);
                    const priceInt128: bigint = await market.buyPrice(outcome, sharesInt128);
                    const price = fromInt128toNumber(priceInt128);
                    if (detailsEnabled) {
                        console.log(`\t|  Buy: outcome=${outcome}, amount=${shares} => ${price} [${priceInt128}]`);
                    }
                    buyPrices[outcome].push(price);
                }
            }
            for (const outcome of possibleOutcomes) {
                for (const shares of sharesAmounts) {
                    const sharesInt128: bigint = fromNumberToInt128(shares);
                    const priceInt128: bigint = await market.sellPrice(outcome, sharesInt128);
                    const price = fromInt128toNumber(priceInt128);
                    if (detailsEnabled) {
                        console.log(`\t| Sell: outcome=${outcome}, amount=${shares} => ${price} [${priceInt128}]`);
                    }
                    sellPrices[outcome].push(price);
                }
            }
            expect(buyPrices[1].toString()).to.equal(buyPrices[2].toString());
            expect(sellPrices[1].toString()).to.equal(sellPrices[2].toString());

            // Test prices using new V7 getter function
            const marketPrices: bigint[][] = await market.getPrices();
            const marketBuyPrices = marketPrices[0].map(value => Number(ethers.formatEther(value)));
            const marketSellPrices = marketPrices[1].map(value => Number(ethers.formatEther(value)));
            if (detailsEnabled) {
                console.log(`\t|  Fast Buy Prices: YES (${marketBuyPrices[1]}) - NO (${marketBuyPrices[2]})`);
                console.log(`\t| Fast Sell Prices: YES (${marketSellPrices[1]}) - NO (${marketSellPrices[2]})`);
            }
            expect(marketBuyPrices[1]).to.be.equal(buyPrices[1][0]);
            expect(marketBuyPrices[2]).to.be.equal(buyPrices[2][0]);
            expect(marketSellPrices[1]).to.be.equal(sellPrices[1][0]);
            expect(marketSellPrices[2]).to.be.equal(sellPrices[2][0]);
        })
    })

    describe("Test buy and sell shares functions", function () {
        it("| Buy 1 YES share [outcome=1]", async function () {
            if (detailsEnabled) console.log("");
            const balanceBefore = await pre.balanceOf(owner.address);
            const outcome: number = 1;
            const shares: number = 1;
            const sharesInt128: bigint = fromNumberToInt128(shares);
            if (detailsEnabled) {
                console.log(`\t| Buying: outcome=${outcome}, shares=${shares} [${sharesInt128}]`);
            }
            const priceInt128: bigint = await market.buyPrice(outcome, sharesInt128);
            const price: number = fromInt128toNumber(priceInt128);
            const maxCost: bigint = ethers.parseUnits(`${price * 1.0000000001}`, 18);  // Ultra low slippage

            const buyTx = market.buy(outcome, sharesInt128, maxCost);
            await expect(buyTx).to.emit(market, "SharesBought");

            const balanceAfter = await pre.balanceOf(owner.address);
            const preCost: number = Number(ethers.formatEther(balanceBefore - balanceAfter));
            if (detailsEnabled) {
                console.log(`\t| PRE: ${ethers.formatEther(balanceBefore)} -> ${ethers.formatEther(balanceAfter)}`);
                console.log(`\t| Buy cost: ${preCost}, Calculated Price: ${price}`);
            }
            const priceTolerance = 0.0000000001;  // at lease 9 digits
            expect(preCost).to.be.closeTo(price, priceTolerance);
            const ownerStats: any[] = await market.getAccountStats(owner.address);
            const outcomeBalances: bigint[] = await market.getAccountOutcomeBalances(owner.address);
            const outcomeOneShares: string = ethers.formatEther(outcomeBalances[1]);
            const outcomeTwoShares: string = ethers.formatEther(outcomeBalances[2]);
            const buys: bigint = ownerStats[0];
            const sells: bigint = ownerStats[1];
            const deposited: string = ethers.formatEther(ownerStats[2]);
            const withdrawn: string = ethers.formatEther(ownerStats[3]);
            const redeemed: string = ethers.formatEther(ownerStats[4]);
            if (detailsEnabled) {
                console.log(`\t| Buys: ${buys}, Sells: ${sells}`);
                console.log(`\t| Deposited: ${deposited}, Withdrawn: ${withdrawn}, 'Redeemed': ${redeemed}`);
                console.log(`\t| Share balances: YES: ${outcomeOneShares}, NO: ${outcomeTwoShares}`);
            }
            expect(Number(buys)).be.equal(1);
            expect(Number(sells)).be.equal(0);
            expect(Number(outcomeOneShares)).be.equal(1);
            expect(Number(outcomeTwoShares)).be.equal(0);
        })

        it("| Check current market info (after 1 buy)", async function () {
            if (detailsEnabled) console.log("");
            const marketInfo: any[] = await market.getMarketInfo();
            const totalShares: number = fromInt128toNumber(marketInfo[0]);
            const outcomeOne: number = fromInt128toNumber(marketInfo[1][1]);
            const outcomeTwo: number = fromInt128toNumber(marketInfo[1][2]);
            const cost: number = fromInt128toNumber(marketInfo[3]);
            const totalBuys: bigint = marketInfo[4];
            const totalSells: bigint = marketInfo[5];
            if (detailsEnabled) {
                console.log(`\t| TotalShares: ${totalShares}, YES: ${outcomeOne}, NO: ${outcomeTwo}`);
                console.log(`\t| TotalDeposited: ${cost}, totalBuys: ${totalBuys}, totalSells: ${totalSells}`);
            }
            expect(totalBuys).be.equal(1);
            expect(totalSells).be.equal(0);
        })

        it("| Buy 1 NO share [outcome=2] (with slippage test)", async function () {
            if (detailsEnabled) console.log("");
            const balanceBefore = await pre.balanceOf(owner.address);

            const outcome: number = 2;
            const shares: number = 1;
            const sharesInt128: bigint = fromNumberToInt128(shares);
            if (detailsEnabled) {
                console.log(`\t| Buying: outcome=${outcome}, amount=${shares} [${sharesInt128}]`);
            }
            const priceInt128: bigint = await market.buyPrice(outcome, sharesInt128);
            const price = fromInt128toNumber(priceInt128);

            // Test slippage on Buys
            const lowMaxCost: bigint = ethers.parseUnits(`${price * 0.999999999}`, 18);
            const lowMaxCostBuyTx = market.buy(outcome, sharesInt128, lowMaxCost);
            await expect(lowMaxCostBuyTx).to.be.revertedWith("Buy cost too high");

            // Send the `buy` call with the correct `maxCost` amount
            const maxCost: bigint = ethers.parseUnits(`${price * 1.0000000001}`, 18);  // Ultra low slippage
            await market.buy(outcome, sharesInt128, maxCost);

            const balanceAfter = await pre.balanceOf(owner.address);
            const preCost: number = Number(ethers.formatEther(balanceBefore - balanceAfter));
            if (detailsEnabled) {
                console.log(`\t| PRE: ${ethers.formatEther(balanceBefore)} -> ${ethers.formatEther(balanceAfter)}`);
                console.log(`\t| Buy cost: ${preCost}, Calculated Price: ${price}`);
            }
            const priceTolerance = 0.0000000001;  // at lease 9 digits
            expect(preCost).to.be.closeTo(price, priceTolerance);
            const ownerStats: bigint[] = await market.getAccountStats(owner.address);
            const outcomeBalances: bigint[] = await market.getAccountOutcomeBalances(owner.address);
            const outcomeOneShares: string = ethers.formatEther(outcomeBalances[1]);
            const outcomeTwoShares: string = ethers.formatEther(outcomeBalances[2]);
            const buys: bigint = ownerStats[0];
            const sells: bigint = ownerStats[1];
            const deposited: string = ethers.formatEther(ownerStats[2]);
            const withdrawn: string = ethers.formatEther(ownerStats[3]);
            const redeemed: string = ethers.formatEther(ownerStats[4]);
            if (detailsEnabled) {
                console.log(`\t| Buys: ${buys}, Sells: ${sells}`);
                console.log(`\t| Deposited: ${deposited}, Withdrawn: ${withdrawn}, Redeemed: ${redeemed}`);
                console.log(`\t| Share balances: YES: ${outcomeOneShares}, NO: ${outcomeTwoShares}`);
            }
            expect(Number(buys)).be.equal(2);
            expect(Number(sells)).be.equal(0);
            expect(Number(outcomeOneShares)).be.equal(1);  // From a prior test
            expect(Number(outcomeTwoShares)).be.equal(1);  // From this test
        })

        it("| Check current market info (after 2 buys)", async function () {
            if (detailsEnabled) console.log("");
            const marketInfo: any[] = await market.getMarketInfo();
            const totalShares: number = fromInt128toNumber(marketInfo[0]);
            const outcomeOne: number = fromInt128toNumber(marketInfo[1][1]);
            const outcomeTwo: number = fromInt128toNumber(marketInfo[1][2]);
            const cost: number = fromInt128toNumber(marketInfo[3]);
            const totalBuys = marketInfo[4];
            const totalSells = marketInfo[5];
            if (detailsEnabled) {
                console.log(`\t| TotalShares: ${totalShares}, YES: ${outcomeOne}, NO: ${outcomeTwo}`);
                console.log(`\t| TotalDeposited: ${cost}, totalBuys: ${totalBuys}, totalSells: ${totalSells}`);
            }
            expect(Number(totalBuys)).be.equal(2);
            expect(Number(totalSells)).be.equal(0);
        })

        it("| Verify disabling and re-enabling share sells", async function () {
            if (detailsEnabled) console.log("");

            // Get market sell fee factor before test
            const oldMarketSetupInfo: any[] = await market.getMarketSetupInfo();
            const oldMarketSellFeeFactor: number = fromInt128toNumber(oldMarketSetupInfo[3]);
            const oldMarketSellFee: number = 1 / oldMarketSellFeeFactor;

            if (detailsEnabled) {
                console.log(`\t| Old Factor: ${oldMarketSellFeeFactor} -> Sell Fee: ${oldMarketSellFee * 100}%`);
            }

            // Update `sellFeeFactor` to zero (disabling market sells)
            const newFactor = 0; //  Sells disabled!
            await market.updateSellFeeFactor(newFactor);

            // Try to sell 1 share of outcome 1 with a min return of zero [sell(outcome,shares,minReturn)]
            const sellTx = market.sell(1, fromNumberToInt128(1), 0);
            await expect(sellTx).to.be.revertedWith("Market sells disabled");

            // Update `sellFeeFactor` to old value (re-enabling market sells)
            await market.updateSellFeeFactor(oldMarketSellFeeFactor);

            // Get market sell fee factor after test
            const newMarketSetupInfo: any[] = await market.getMarketSetupInfo();
            const newMarketSellFeeFactor: number = fromInt128toNumber(newMarketSetupInfo[3]);
            const newMarketSellFee: number = 1 / newMarketSellFeeFactor;

            if (detailsEnabled) {
                console.log(`\t| New Factor: ${newMarketSellFeeFactor} -> Sell Fee: ${newMarketSellFee * 100}%`);
            }

            // Verify that current test do not update the market sell fee
            expect(newMarketSellFeeFactor).be.equal(oldMarketSellFeeFactor);
            expect(oldMarketSellFee).be.equal(newMarketSellFee);
        })

        it("| Try to buy or sell non-exact share amounts (not allowed)", async function () {
            if (detailsEnabled) console.log("");

            const outcome = 1;
            const nonExactShares = 1.0000000001;
            // const nonExactShares = 0.9999999999;  // Only for testing
            const nonExactSharesInt128 = BigInt(Math.floor(nonExactShares * 2 ** 64));

            if (detailsEnabled) {
                console.log(`\t| Trying to Buy: ${nonExactShares} shares [${nonExactSharesInt128}]`);
            }

            // Try to buy 1.5 shares of outcome 1 with a max cost of 2 [buy(outcome,shares,maxCost)]
            const maxCost = ethers.parseUnits("2", 18);
            const buyTx = market.buy(outcome, nonExactSharesInt128, maxCost);
            await expect(buyTx).to.be.revertedWith("Invalid amount");

            if (detailsEnabled) {
                console.log(`\t| Trying to Sell: ${nonExactShares} shares [${nonExactSharesInt128}]`);
            }

            // Try to sell 1.5 shares of outcome 1 with a min return of zero [sell(outcome,shares,minReturn)]
            const minReturn = 0;
            const sellTx = market.sell(outcome, nonExactSharesInt128, minReturn);
            await expect(sellTx).to.be.revertedWith("Invalid amount");
        })

        it("| Buy 200 YES & NO shares from many sizes", async function () {
            if (detailsEnabled) console.log("");
            const initialMarketInfo: any[] = await market.getMarketInfo();
            const initialCost: number = fromInt128toNumber(initialMarketInfo[3]);
            const initialPre: bigint = await pre.balanceOf(owner.address);

            const outcomeYes: number = 1;
            const outcomeNo: number = 2;
            const oneSharesInt128: bigint = fromNumberToInt128(1);
            const fiveSharesInt128: bigint = fromNumberToInt128(5);
            const tenSharesInt128: bigint = fromNumberToInt128(10);
            const fiftySharesInt128: bigint = fromNumberToInt128(50);
            const hundredSharesInt128: bigint = fromNumberToInt128(100);

            // Buying 199 shares of YES (note: 1 share it is already bought by the previous test case)
            await market.buy(outcomeYes, oneSharesInt128, 0);
            await market.buy(outcomeYes, oneSharesInt128, 0);
            await market.buy(outcomeYes, oneSharesInt128, 0);
            await market.buy(outcomeYes, oneSharesInt128, 0);
            await market.buy(outcomeYes, fiveSharesInt128, 0);
            await market.buy(outcomeYes, tenSharesInt128, 0);
            await market.buy(outcomeYes, tenSharesInt128, 0);
            await market.buy(outcomeYes, tenSharesInt128, 0);
            await market.buy(outcomeYes, tenSharesInt128, 0);
            await market.buy(outcomeYes, fiftySharesInt128, 0);
            await market.buy(outcomeYes, hundredSharesInt128, 0);

            // Buying 199 shares of NO (note: 1 share it is already bought by the previous test case)
            await market.buy(outcomeNo, oneSharesInt128, 0);
            await market.buy(outcomeNo, oneSharesInt128, 0);
            await market.buy(outcomeNo, oneSharesInt128, 0);
            await market.buy(outcomeNo, oneSharesInt128, 0);
            await market.buy(outcomeNo, fiveSharesInt128, 0);
            await market.buy(outcomeNo, tenSharesInt128, 0);
            await market.buy(outcomeNo, tenSharesInt128, 0);
            await market.buy(outcomeNo, tenSharesInt128, 0);
            await market.buy(outcomeNo, tenSharesInt128, 0);
            await market.buy(outcomeNo, fiftySharesInt128, 0);
            await market.buy(outcomeNo, hundredSharesInt128, 0);

            const finalMarketInfo: any[] = await market.getMarketInfo();
            const finalCost: number = fromInt128toNumber(finalMarketInfo[3]);
            const finalPre: bigint = await pre.balanceOf(owner.address);
            if (detailsEnabled) {
                console.log(`\t| Cost: ${initialCost} -> ${finalCost}`);
                console.log(`\t| PRE: ${ethers.formatEther(initialPre)} -> ${ethers.formatEther(finalPre)}`);
            }
            const ownerStats: bigint[] = await market.getAccountStats(owner.address);
            const outcomeBalances: bigint[] = await market.getAccountOutcomeBalances(owner.address);
            const outcomeOneShares: string = ethers.formatEther(outcomeBalances[1]);
            const outcomeTwoShares: string = ethers.formatEther(outcomeBalances[2]);
            const buys: bigint = ownerStats[0];
            const sells: bigint = ownerStats[1];
            const deposited: string = ethers.formatEther(ownerStats[2]);
            const withdrawn: string = ethers.formatEther(ownerStats[3]);
            const redeemed: string = ethers.formatEther(ownerStats[4]);
            if (detailsEnabled) {
                console.log(`\t| Buys: ${buys}, Sells: ${sells}`);
                console.log(`\t| Deposited: ${deposited}, Withdrawn: ${withdrawn}, Redeemed: ${redeemed}`);
                console.log(`\t| Share balances: YES: ${outcomeOneShares}, NO: ${outcomeTwoShares}`);
            }

            expect(Number(buys)).be.greaterThan(2);
            expect(Number(sells)).be.equal(0);
            expect(Number(outcomeOneShares)).be.equal(200);
            expect(Number(outcomeTwoShares)).be.equal(200);
        })

        it("| Sell 1 YES share [outcome=1]", async function () {
            if (detailsEnabled) console.log("");
            const outcomeBalancesBefore: bigint[] = await market.getAccountOutcomeBalances(owner.address);
            const outcomeOneSharesBefore: string = ethers.formatEther(outcomeBalancesBefore[1]);
            const outcomeTwoSharesBefore: string = ethers.formatEther(outcomeBalancesBefore[2]);
            const balanceBefore = await pre.balanceOf(owner.address);

            const outcome: number = 1;
            const shares: number = 1;
            const sharesInt128: bigint = fromNumberToInt128(shares);
            const priceInt128: bigint = await market.sellPrice(outcome, sharesInt128);
            const expectedReturn: number = fromInt128toNumber(priceInt128);
            const minReturn = ethers.parseUnits(`${expectedReturn * 0.999999999}`, 18);
            if (detailsEnabled) {
                console.log(`\t| Shares : 1-YES=${outcomeOneSharesBefore}, 2-NO=${outcomeTwoSharesBefore}`);
                console.log(`\t| Selling: outcome=${outcome}, shares=${shares} [${sharesInt128}]`);
                console.log(`\t|   Expected return: ${expectedReturn} PRE`);
            }

            const sellTx = market.sell(outcome, sharesInt128, minReturn);
            await expect(sellTx).to.emit(market, "SharesSold");

            const ownerStatsAfter: bigint[] = await market.getAccountStats(owner.address);
            const outcomeBalancesAfter: bigint[] = await market.getAccountOutcomeBalances(owner.address);
            const balanceAfter: bigint = await pre.balanceOf(owner.address);
            const preReturn: number = Number(ethers.formatEther(balanceAfter - balanceBefore));
            const returnAccuracy = matchedDecimalPlaces(expectedReturn, preReturn);
            if (detailsEnabled) {
                console.log(`\t| After Sold return: ${preReturn} PRE (accuracy: ${returnAccuracy} decimals)`);
            }

            const outcomeOneSharesAfter: string = ethers.formatEther(outcomeBalancesAfter[1]);
            const outcomeTwoSharesAfter: string = ethers.formatEther(outcomeBalancesAfter[2]);
            const buys: bigint = ownerStatsAfter[0];
            const sells: bigint = ownerStatsAfter[1];
            const deposited: string = ethers.formatEther(ownerStatsAfter[2]);
            const withdrawn: string = ethers.formatEther(ownerStatsAfter[3]);
            const redeemed: string = ethers.formatEther(ownerStatsAfter[4]);
            if (detailsEnabled) {
                console.log(`\t| Shares : 1-YES=${outcomeOneSharesAfter}, 2-NO=${outcomeTwoSharesAfter}`);
                console.log(`\t| Buys: ${buys}, Sells: ${sells}`);
                console.log(`\t| Deposited: ${deposited}, Withdrawn: ${withdrawn}, Redeemed: ${redeemed}`);
            }

            const returnTolerance = 0.0000000001;  // at lease 9 digits
            expect(preReturn).to.be.closeTo(expectedReturn, returnTolerance);
            expect(Number(sells)).be.equal(1);
            expect(Number(outcomeOneSharesAfter)).be.equal(Number(outcomeOneSharesBefore) - 1);
            expect(Number(outcomeTwoSharesAfter)).be.equal(Number(outcomeTwoSharesBefore));
        })

        it("| Sell 1 NO share [outcome=2] (with slippage test)", async function () {
            if (detailsEnabled) console.log("");
            const outcomeBalancesBefore: bigint[] = await market.getAccountOutcomeBalances(owner.address);
            const outcomeOneSharesBefore: string = ethers.formatEther(outcomeBalancesBefore[1]);
            const outcomeTwoSharesBefore: string = ethers.formatEther(outcomeBalancesBefore[2]);
            const balanceBefore = await pre.balanceOf(owner.address);

            const outcome: number = 2;
            const shares: number = 1;
            const sharesInt128: bigint = fromNumberToInt128(shares);
            const priceInt128: bigint = await market.sellPrice(outcome, sharesInt128);
            const expectedReturn: number = fromInt128toNumber(priceInt128);
            if (detailsEnabled) {
                console.log(`\t| Shares : 1-YES=${outcomeOneSharesBefore}, 2-NO=${outcomeTwoSharesBefore}`);
                console.log(`\t| Selling: outcome=${outcome}, shares=${shares} [${sharesInt128}]`);
                console.log(`\t|   Expected return: ${expectedReturn} PRE`);
            }

            // Test slippage on Sells
            const highMinReturn = ethers.parseUnits(`${expectedReturn * 1.0000000001}`, 18);
            const highMinReturnSellTx = market.sell(outcome, sharesInt128, highMinReturn);
            await expect(highMinReturnSellTx).to.be.revertedWith("Sell return too low");

            // Send the `sell` call with the correct `minReturn` amount
            const minReturn = ethers.parseUnits(`${expectedReturn * 0.999999999}`, 18);
            await market.sell(outcome, sharesInt128, minReturn);

            const ownerStatsAfter: bigint[] = await market.getAccountStats(owner.address);
            const outcomeBalancesAfter: bigint[] = await market.getAccountOutcomeBalances(owner.address);
            const balanceAfter: bigint = await pre.balanceOf(owner.address);
            const preReturn: number = Number(ethers.formatEther(balanceAfter - balanceBefore));
            const returnAccuracy = matchedDecimalPlaces(expectedReturn, preReturn);
            if (detailsEnabled) {
                console.log(`\t| After Sold return: ${preReturn} PRE (accuracy ${returnAccuracy} digits)`);
            }

            const outcomeOneSharesAfter = ethers.formatEther(outcomeBalancesAfter[1]);
            const outcomeTwoSharesAfter = ethers.formatEther(outcomeBalancesAfter[2]);
            const buys: bigint = ownerStatsAfter[0];
            const sells: bigint = ownerStatsAfter[1];
            const deposited: string = ethers.formatEther(ownerStatsAfter[2]);
            const withdrawn: string = ethers.formatEther(ownerStatsAfter[3]);
            const redeemed: string = ethers.formatEther(ownerStatsAfter[4]);
            if (detailsEnabled) {
                console.log(`\t| Shares : 1-YES=${outcomeOneSharesAfter}, 2-NO=${outcomeTwoSharesAfter}`);
                console.log(`\t| Buys: ${buys}, Sells: ${sells}`);
                console.log(`\t| Deposited: ${deposited}, Withdrawn: ${withdrawn}, Redeemed: ${redeemed}`);
            }

            const returnTolerance = 0.0000000001;  // at lease 9 digits
            expect(preReturn).to.be.closeTo(expectedReturn, returnTolerance);
            expect(Number(sells)).be.equal(2);
            expect(Number(outcomeTwoSharesAfter)).be.equal(Number(outcomeTwoSharesBefore) - 1);
            expect(Number(outcomeOneSharesAfter)).be.equal(Number(outcomeOneSharesBefore));
        })

        it("| Check consistency on many small buys & one big sell", async function () {
            if (detailsEnabled) console.log("");
            const userStatsBefore: bigint[] = await market.getAccountStats(user.address);
            const buysBefore: bigint = userStatsBefore[0];
            const sellsBefore: bigint = userStatsBefore[1];
            const outcomeBalancesBefore: bigint[] = await market.getAccountOutcomeBalances(owner.address);
            const outcomeOneSharesBefore: string = ethers.formatEther(outcomeBalancesBefore[1]);
            const outcomeTwoSharesBefore: string = ethers.formatEther(outcomeBalancesBefore[2]);
            if (detailsEnabled) {
                console.log(`\t| User Shares: 1-YES=${outcomeOneSharesBefore}, 2-NO=${outcomeTwoSharesBefore}`);
                console.log(`\t| User Actions: BUYs=${buysBefore}, SELLs= ${sellsBefore}`);
            }

            const balanceBefore = await pre.balanceOf(user.address);
            const yesOutcome: number = 1;

            // CASE 1: Small buys, big sell
            const buys: number = 100;
            if (detailsEnabled) console.log(`\t| Buying (1 share, ${buys} times)...`);
            for (let i: number = 0; i < buys; i++) {
                await market.connect(user).buy(yesOutcome, fromNumberToInt128(1), 0);
            }
            if (detailsEnabled) console.log(`\t| Selling (${buys} shares)...`);
            await market.connect(user).sell(yesOutcome, fromNumberToInt128(buys), 0);

            const balanceAfter: bigint = await pre.balanceOf(user.address);
            const deltaBalance: string = ethers.formatEther(balanceAfter - balanceBefore);
            if (detailsEnabled) {
                console.log(`\t| Balance: ${balanceBefore} -> ${balanceAfter} PRE`);
                console.log(`\t| Delta balance: ${deltaBalance} PRE`);
            }
            expect(balanceAfter).be.lessThanOrEqual(balanceBefore);

            const ownerStatsAfter: bigint[] = await market.getAccountStats(user.address);
            const buysAfter: bigint = ownerStatsAfter[0];
            const sellsAfter: bigint = ownerStatsAfter[1];
            const outcomeBalancesAfter: bigint[] = await market.getAccountOutcomeBalances(owner.address);
            const outcomeOneSharesAfter: string = ethers.formatEther(outcomeBalancesAfter[1]);
            const outcomeTwoSharesAfter: string = ethers.formatEther(outcomeBalancesBefore[2]);
            if (detailsEnabled) {
                console.log(`\t| User Shares (after): 1-YES=${outcomeOneSharesAfter}, 2-NO=${outcomeTwoSharesAfter}`);
                console.log(`\t| User Actions (after): BUYs=${buysAfter}, SELLs= ${sellsAfter}`);
            }

            expect(Number(outcomeOneSharesAfter)).be.equal(Number(outcomeOneSharesBefore));
            expect(Number(outcomeTwoSharesAfter)).be.equal(Number(outcomeTwoSharesBefore));
        })

        it("| Check consistency on one big buy & many small sells", async function () {
            if (detailsEnabled) console.log("");
            const userStatsBefore: bigint[] = await market.getAccountStats(user.address);
            const buysBefore = userStatsBefore[0];
            const sellsBefore = userStatsBefore[1];
            const outcomeBalancesBefore: bigint[] = await market.getAccountOutcomeBalances(owner.address);
            const outcomeOneSharesBefore: string = ethers.formatEther(outcomeBalancesBefore[1]);
            const outcomeTwoSharesBefore: string = ethers.formatEther(outcomeBalancesBefore[2]);
            if (detailsEnabled) {
                console.log(`\t| User Shares: 1-YES=${outcomeOneSharesBefore}, 2-NO=${outcomeTwoSharesBefore}`);
                console.log(`\t| User Actions: BUYs=${buysBefore}, SELLs= ${sellsBefore}`);
            }

            const balanceBefore = await pre.balanceOf(user.address);
            const yesOutcome: number = 1;

            // CASE 2: Big buy, small sells
            const sells: number = 100;
            if (detailsEnabled) console.log(`\t| Buying (${sells} shares)...`);
            await market.connect(user).buy(yesOutcome, fromNumberToInt128(sells), 0);
            if (detailsEnabled) console.log(`\t| Selling (1 share, ${sells} times)...`);
            for (let i: number = 0; i < sells; i++) {
                await market.connect(user).sell(yesOutcome, fromNumberToInt128(1), 0);
            }

            const balanceAfter: bigint = await pre.balanceOf(user.address);
            const deltaBalance: string = ethers.formatEther(balanceAfter - balanceBefore);
            if (detailsEnabled) {
                console.log(`\t| Balance: ${balanceBefore} -> ${balanceAfter} PRE`);
                console.log(`\t| Delta balance: ${deltaBalance} PRE`);
            }
            expect(balanceAfter).be.lessThanOrEqual(balanceBefore);

            const ownerStatsAfter: bigint[] = await market.getAccountStats(user.address);
            const buysAfter: bigint = ownerStatsAfter[0];
            const sellsAfter: bigint = ownerStatsAfter[1];
            const outcomeBalancesAfter: bigint[] = await market.getAccountOutcomeBalances(owner.address);
            const outcomeOneSharesAfter: string = ethers.formatEther(outcomeBalancesAfter[1]);
            const outcomeTwoSharesAfter: string = ethers.formatEther(outcomeBalancesAfter[2]);
            if (detailsEnabled) {
                console.log(`\t| User Shares (after): 1-YES=${outcomeOneSharesAfter}, 2-NO=${outcomeTwoSharesAfter}`);
                console.log(`\t| User Actions (after): BUYs=${buysAfter}, SELLs= ${sellsAfter}`);
            }

            expect(Number(outcomeOneSharesAfter)).be.equal(Number(outcomeOneSharesBefore));
            expect(Number(outcomeTwoSharesAfter)).be.equal(Number(outcomeTwoSharesBefore));
        })

        it("| Verify profit on buying low and selling high", async function () {
            if (detailsEnabled) console.log("");

            const userStatsBefore: bigint[] = await market.getAccountStats(user.address);
            const buysBefore: bigint = userStatsBefore[0];
            const sellsBefore: bigint = userStatsBefore[1];
            const outcomeBalancesBefore: bigint[] = await market.getAccountOutcomeBalances(owner.address);
            const outcomeOneSharesBefore: string = ethers.formatEther(outcomeBalancesBefore[1]);
            const outcomeTwoSharesBefore: string = ethers.formatEther(outcomeBalancesBefore[2]);
            if (detailsEnabled) {
                console.log(`\t| User Shares: 1-YES=${outcomeOneSharesBefore}, 2-NO=${outcomeTwoSharesBefore}`);
                console.log(`\t| User Actions: BUYs=${buysBefore}, SELLs= ${sellsBefore}`);
            }

            // Dev Note: There is a lib limit of 1545 shares YES/NO delta on 200 overround.
            const balanceBefore: bigint = await pre.balanceOf(user.address);

            const YesOutcome: number = 1;

            // User BUY 1 share of YES at some initial low price
            await market.connect(user).buy(YesOutcome, fromNumberToInt128(1), 0);

            // Another user BUY 1 share of YES
            await market.connect(caller).buy(YesOutcome, fromNumberToInt128(1), 0);

            // User SELL 1 share of YES at a higher price
            await market.connect(user).sell(YesOutcome, fromNumberToInt128(1), 0);

            // Another user SELLs 1 share of YES (to keep equality, this user will operate at a loss)
            await market.connect(caller).sell(YesOutcome, fromNumberToInt128(1), 0);

            const balanceAfter: bigint = await pre.balanceOf(user.address);
            const deltaBalance: number = Number(ethers.formatEther(balanceAfter - balanceBefore));
            if (detailsEnabled) {
                console.log(`\t| Bought Low, Sold High!, Total Cost: ${deltaBalance} PRE\``);
            }

            const ownerStatsAfter: bigint[] = await market.getAccountStats(user.address);
            const buysAfter: bigint = ownerStatsAfter[0];
            const sellsAfter: bigint = ownerStatsAfter[1];
            const outcomeBalancesAfter: bigint[] = await market.getAccountOutcomeBalances(owner.address);
            const outcomeOneSharesAfter: string = ethers.formatEther(outcomeBalancesAfter[1]);
            const outcomeTwoSharesAfter: string = ethers.formatEther(outcomeBalancesAfter[2]);
            if (detailsEnabled) {
                console.log(`\t| User Shares (after): 1-YES=${outcomeOneSharesAfter}, 2-NO=${outcomeTwoSharesAfter}`);
                console.log(`\t| User Actions (after): BUYs=${buysAfter}, SELLs= ${sellsAfter}`);
            }

            expect(deltaBalance).be.greaterThan(0);
            expect(Number(outcomeOneSharesAfter)).be.equal(Number(outcomeOneSharesBefore));
            expect(Number(outcomeTwoSharesAfter)).be.equal(Number(outcomeTwoSharesBefore));
        })

        it("| Check final market info (equal YES/NO quantities)", async function () {
            if (detailsEnabled) console.log("");
            const marketInfo: any[] = await market.getMarketInfo();
            const totalShares: number = fromInt128toNumber(marketInfo[0]);
            const outcomeOne: number = fromInt128toNumber(marketInfo[1][1]);
            const outcomeTwo: number = fromInt128toNumber(marketInfo[1][2]);
            const cost: number = fromInt128toNumber(marketInfo[3]);
            const totalBuys = marketInfo[4];
            const totalSells = marketInfo[5];
            const marketPreBalance: bigint = await pre.balanceOf(marketAddress);
            if (detailsEnabled) {
                console.log(`\t| TotalShares: ${totalShares}, OutcomeOne: ${outcomeOne}, OutcomeTwo: ${outcomeTwo}`);
                console.log(`\t| TotalDeposited: ${cost}, totalBuys: ${totalBuys}, totalSells: ${totalSells}`);
                console.log(`\t| Market balance: ${ethers.formatEther(marketPreBalance)}`);
            }
            expect(outcomeOne).be.equal(outcomeTwo);
        })

        it("| Check final prices (equal YES/NO quantities)", async function () {
            if (detailsEnabled) console.log("");
            const buyPrices: any[] = [null, [], []];  // the first item is added just for simplicity
            const sellPrices: any[] = [null, [], []];  // the first item is added just for simplicity
            const possibleOutcomes: number[] = [1, 2];
            const sharesAmounts: number[] = [1, 10, 100];
            for (const outcome of possibleOutcomes) {
                for (const shares of sharesAmounts) {
                    const sharesInt128: bigint = fromNumberToInt128(shares);
                    const priceInt128: bigint = await market.buyPrice(outcome, sharesInt128);
                    const price = fromInt128toNumber(priceInt128);
                    if (detailsEnabled) {
                        console.log(`\t|  Buy: outcome=${outcome}, amount=${shares} => ${price} [${priceInt128}]`);
                    }
                    buyPrices[outcome].push(price);
                }
            }
            for (const outcome of possibleOutcomes) {
                for (const shares of sharesAmounts) {
                    const sharesInt128: bigint = fromNumberToInt128(shares);
                    const priceInt128: bigint = await market.sellPrice(outcome, sharesInt128);
                    const price = fromInt128toNumber(priceInt128);
                    if (detailsEnabled) {
                        console.log(`\t| Sell: outcome=${outcome}, amount=${shares} => ${price} [${priceInt128}]`);
                    }
                    sellPrices[outcome].push(price);
                }
            }
            expect(buyPrices[1].toString()).to.equal(buyPrices[2].toString());
            expect(sellPrices[1].toString()).to.equal(sellPrices[2].toString());

            // Test prices using new V7 getter function
            const marketPrices: bigint[][] = await market.getPrices();
            const marketBuyPrices = marketPrices[0].map(value => Number(ethers.formatEther(value)));
            const marketSellPrices = marketPrices[1].map(value => Number(ethers.formatEther(value)));
            if (detailsEnabled) {
                console.log(`\t|  Fast Buy Prices: YES (${marketBuyPrices[1]}) - NO (${marketBuyPrices[2]})`);
                console.log(`\t| Fast Sell Prices: YES (${marketSellPrices[1]}) - NO (${marketSellPrices[2]})`);
            }
            expect(marketBuyPrices[1]).to.be.equal(buyPrices[1][0]);
            expect(marketBuyPrices[2]).to.be.equal(buyPrices[2][0]);
            expect(marketSellPrices[1]).to.be.equal(sellPrices[1][0]);
            expect(marketSellPrices[2]).to.be.equal(sellPrices[2][0]);
        })
    })

    describe("Test report result and redeem shares functions", function () {
        it("| Buy 1 NO share [outcome=2] from a User account", async function () {
            if (detailsEnabled) console.log("");
            const balanceBefore = await pre.balanceOf(user.address);

            const outcome: number = 2;
            const shares: number = 1;
            const sharesInt128: bigint = fromNumberToInt128(shares);
            const priceInt128: bigint = await market.buyPrice(outcome, sharesInt128);
            const price: number = fromInt128toNumber(priceInt128);
            if (detailsEnabled) {
                console.log(`\t| Buying: outcome=${outcome}, amount=${shares} [${sharesInt128}]`);
                console.log(`\t|  Expected cost: ${price}`);
            }

            await market.connect(user).buy(outcome, sharesInt128, 0);

            const balanceAfter = await pre.balanceOf(user.address);
            const preCost: number = Number(ethers.formatEther(balanceBefore - balanceAfter));
            if (detailsEnabled) {
                console.log(`\t|       Buy cost: ${preCost}`);
                console.log(`\t| PRE: ${ethers.formatEther(balanceBefore)} -> ${ethers.formatEther(balanceAfter)}`);
            }
            const ownerStats: bigint[] = await market.getAccountStats(user.address);
            const outcomeBalances: bigint[] = await market.getAccountOutcomeBalances(user.address);
            const outcomeOneShares: string = ethers.formatEther(outcomeBalances[1]);
            const outcomeTwoShares: string = ethers.formatEther(outcomeBalances[2]);
            const buys: bigint = ownerStats[0];
            const sells: bigint = ownerStats[1];
            const deposited: string = ethers.formatEther(ownerStats[2]);
            const withdrawn: string = ethers.formatEther(ownerStats[3]);
            const redeemed: string = ethers.formatEther(ownerStats[4]);
            if (detailsEnabled) {
                console.log(`\t| Buys: ${buys}, Sells: ${sells}`);
                console.log(`\t| Deposited: ${deposited}, Withdrawn: ${withdrawn}, Redeemed: ${redeemed}`);
                console.log(`\t| Share balances: YES: ${outcomeOneShares}, NO: ${outcomeTwoShares}`);
            }

            const priceTolerance = 0.0000000001;  // at lease 9 digits
            expect(preCost).to.be.closeTo(price, priceTolerance);
            expect(Number(outcomeOneShares)).be.equal(0);
            expect(Number(outcomeTwoShares)).be.equal(1);
        })

        it("| Buy 1 NO share [outcome=2] from a Caller account", async function () {
            if (detailsEnabled) console.log("");
            const balanceBefore = await pre.balanceOf(caller.address);

            const outcome: number = 2;
            const shares: number = 1;
            const sharesInt128: bigint = fromNumberToInt128(shares);
            const priceInt128: bigint = await market.buyPrice(outcome, sharesInt128);
            const price: number = fromInt128toNumber(priceInt128);
            if (detailsEnabled) {
                console.log(`\t| Buying: outcome=${outcome}, amount=${shares} [${sharesInt128}]`);
                console.log(`\t|  Expected cost: ${price}`);
            }

            await market.connect(caller).buy(outcome, sharesInt128, 0);

            const balanceAfter = await pre.balanceOf(caller.address);
            const preCost: number = Number(ethers.formatEther(balanceBefore - balanceAfter));
            if (detailsEnabled) {
                console.log(`\t|       Buy cost: ${preCost}`);
                console.log(`\t| PRE: ${ethers.formatEther(balanceBefore)} -> ${ethers.formatEther(balanceAfter)}`);
            }
            const ownerStats: bigint[] = await market.getAccountStats(caller.address);
            const outcomeBalances: bigint[] = await market.getAccountOutcomeBalances(caller.address);
            const outcomeOneShares: string = ethers.formatEther(outcomeBalances[1]);
            const outcomeTwoShares: string = ethers.formatEther(outcomeBalances[2]);
            const buys: bigint = ownerStats[0];
            const sells: bigint = ownerStats[1];
            const deposited: string = ethers.formatEther(ownerStats[2]);
            const withdrawn: string = ethers.formatEther(ownerStats[3]);
            const redeemed: string = ethers.formatEther(ownerStats[4]);
            if (detailsEnabled) {
                console.log(`\t| Buys: ${buys}, Sells: ${sells}`);
                console.log(`\t| Deposited: ${deposited}, Withdrawn: ${withdrawn}, Redeemed: ${redeemed}`);
                console.log(`\t| Share balances: YES: ${outcomeOneShares}, NO: ${outcomeTwoShares}`);
            }

            const priceTolerance = 0.0000000001;  // at lease 9 digits
            expect(preCost).to.be.closeTo(price, priceTolerance);
            expect(Number(outcomeOneShares)).be.equal(0);
            expect(Number(outcomeTwoShares)).be.equal(1);
        })

        it("| Report result NO[outcome=2] from the Oracle account", async function () {
            if (detailsEnabled) console.log("");
            const oracle: string = await market.oracle();
            const startTimestamp: bigint = await market.startTimestamp();
            const endTimestamp: bigint = await market.endTimestamp();
            const initialCloseTimestamp: bigint = await market.closeTimestamp();
            const initialResult: bigint = await market.result();
            const initialCollateral: bigint = await pre.balanceOf(marketAddress);
            const initialWithdrawableCollateral: bigint = await market.getWithdrawableCollateral();
            const initialWithdrawable = ethers.formatEther(initialWithdrawableCollateral);
            if (detailsEnabled) {
                console.log(`\t| Oracle: ${oracle}`);
                console.log(`\t| StartTimestamp: ${startTimestamp}, EndTimestamp=${endTimestamp}`);
                console.log(`\t| Market balance: ${ethers.formatEther(initialCollateral)} PRE`);
                console.log(`\t| Initial -> CloseTimestamp: ${initialCloseTimestamp}, Result=${initialResult}`);
                console.log(`\t|            WithdrawableCollateral: ${initialWithdrawable} PRE`);
            }

            const marketId: number = 1;
            const resultOutcome: number = 2;

            const reportTx = market.reportResult(marketId, resultOutcome);
            await expect(reportTx).to.emit(market, "ResultReported");

            const finalCloseTimestamp: bigint = await market.closeTimestamp();
            const finalResult: bigint = await market.result();

            // Get total amount of collateral available to withdraw of the market
            const finalWithdrawableCollateral = await market.getWithdrawableCollateral();

            // Get final collateral in the market and the max payout based on the reported result
            const finalCollateral: bigint = await pre.balanceOf(marketAddress);
            const marketSetupInfo: any[] = await market.getMarketSetupInfo();
            const marketInitialShares: number = fromInt128toNumber(marketSetupInfo[0]);
            const finalMarketInfo: any[] = await market.getMarketInfo();
            const finalSharesBalances: any[] = finalMarketInfo[1].map((value: bigint) => fromInt128toNumber(value));
            const marketMaxPayout: number = finalSharesBalances[resultOutcome] - marketInitialShares;

            if (detailsEnabled) {
                console.log(`\t|   Final -> CloseTimestamp: ${finalCloseTimestamp}, Result=${finalResult}`);
                console.log(`\t|            Collateral: ${ethers.formatEther(finalCollateral)} PRE`);
                console.log(`\t|            MaxPayout: ${marketMaxPayout} PRE`);
                console.log(`\t|            Withdrawable: ${ethers.formatEther(finalWithdrawableCollateral)} PRE`);
            }

            expect(initialResult).be.equal(0);
            expect(initialCloseTimestamp).be.equal(0);
            expect(initialWithdrawableCollateral).be.equal(0);
            expect(finalResult).be.equal(resultOutcome);
            expect(finalCloseTimestamp).be.greaterThan(0);
            expect(finalWithdrawableCollateral).be.equal(finalCollateral - ethers.parseEther(`${marketMaxPayout}`));
        })

        it("| Try to buy after Market result was reported (not allowed)", async function () {
            if (detailsEnabled) console.log("");
            const shares: number = 10;
            const sharesInt128: bigint = fromNumberToInt128(shares);
            const nowTimestamp = await getCurrentBlockTimestamp();
            if (detailsEnabled) {
                console.log(`\t| Current Timestamp: ${nowTimestamp}`);
                console.log(`\t| Buying: condition=1, amount=${shares} [${sharesInt128}]`);
            }

            await expect(market.buy(1, sharesInt128, 0)).to.be.revertedWith("Market already closed");

            const finalCloseTimestamp: bigint = await market.closeTimestamp();
            const finalResult: bigint = await market.result();
            if (detailsEnabled) {
                console.log(`\t|  CloseTimestamp: ${finalCloseTimestamp}, Result=${finalResult}`);
            }
        })

        it("| Try to update dates without oracle authorization (not allowed)", async function () {
            if (detailsEnabled) console.log("");

            const initialMarketStart: bigint = await market.startTimestamp();
            const initialMarketEnd: bigint = await market.endTimestamp();
            const initialDatesUpdateEnabled = await market.datesUpdateEnabled();
            if (detailsEnabled) {
                console.log(`\t| Initial -> start: ${initialMarketStart}, end: ${initialMarketEnd}`);
                console.log(`\t|            datesUpdateEnabled: ${initialDatesUpdateEnabled}`);
            }

            // Update "undated" market (startTimestamp=0) to some valid values [this tx should succeed]
            await market.updateDates(500, 1000);

            // Try to update dates from valid values set [this tx should revert]
            await expect(market.updateDates(1000, 2000)).to.be.revertedWith("Date updates disabled");

            // Enable date updates (only allowed from oracle account)
            const marketId: number = 1;
            await market.enableDatesUpdate(marketId);

            // Update market dates back to original state (only allowed from owner account)
            await market.updateDates(0, 0);

            const finalMarketStart = await market.startTimestamp();
            const finalMarketEnd = await market.endTimestamp();
            const finalDatesUpdateEnabled = await market.datesUpdateEnabled();
            if (detailsEnabled) {
                console.log(`\t|   Final -> start: ${finalMarketStart}, end: ${finalMarketEnd}`);
                console.log(`\t|            datesUpdateEnabled: ${finalDatesUpdateEnabled}`);
            }

            expect(initialMarketStart).equal(finalMarketStart);
            expect(initialMarketEnd).equal(finalMarketEnd);
        })

        it("| Redeem wining shares from Market", async function () {
            if (detailsEnabled) console.log("");
            const initialPre: bigint = await pre.balanceOf(owner.address);
            const initialOwnerStats: bigint[] = await market.getAccountStats(owner.address);
            const initialOutcomeBalances: bigint[] = await market.getAccountOutcomeBalances(owner.address);
            const initialOutcomeOneShares: string = ethers.formatEther(initialOutcomeBalances[1]);
            const initialOutcomeTwoShares: string = ethers.formatEther(initialOutcomeBalances[2]);
            const buys: bigint = initialOwnerStats[0];
            const sells: bigint = initialOwnerStats[1];
            const deposited: string = ethers.formatEther(initialOwnerStats[2]);
            const withdrawn: string = ethers.formatEther(initialOwnerStats[3]);
            const initialRedeemed: string = ethers.formatEther(initialOwnerStats[4]);
            if (detailsEnabled) {
                console.log(`\t| Initial balance: ${ethers.formatEther(initialPre)} PRE`);
                console.log(`\t| Buys: ${buys}, Sells: ${sells}`);
                console.log(`\t| Deposited: ${deposited}, Withdrawn: ${withdrawn}, Redeemed: ${initialRedeemed}`);
                console.log(`\t| Share balances: YES: ${initialOutcomeOneShares}, NO: ${initialOutcomeTwoShares}`);
            }
            const sharesToRedeem: bigint = initialOutcomeBalances[2]; // balance of outcome 2 shares

            const redeemTx = market.redeemShares();
            await expect(redeemTx).to.emit(market, "SharesRedeemed");

            const finalOwnerStats: bigint[] = await market.getAccountStats(owner.address);
            const finalOutcomeBalances: bigint[] = await market.getAccountOutcomeBalances(owner.address);
            const finalOutcomeOneShares: string = ethers.formatEther(finalOutcomeBalances[1]);
            const finalOutcomeTwoShares: string = ethers.formatEther(finalOutcomeBalances[2]);
            const finalPre: bigint = await pre.balanceOf(owner.address);
            const finalRedeemed: string = ethers.formatEther(finalOwnerStats[4]);
            const redeemedBalance: bigint = finalPre - initialPre;
            const deltaPre: string = ethers.formatEther(finalPre - initialPre);
            if (detailsEnabled) {
                console.log(`\t| Final balance: ${ethers.formatEther(finalPre)} PRE (delta: ${deltaPre})`);
                console.log(`\t| Final Redeemed: ${finalRedeemed}`);
            }

            expect(redeemedBalance).be.equal(sharesToRedeem);
            expect(finalOutcomeOneShares).be.equal(initialOutcomeOneShares);
            expect(finalOutcomeTwoShares).be.equal(initialOutcomeTwoShares);
        })

        it("| Redeem shares for a list of accounts from Oracle account", async function () {
            if (detailsEnabled) console.log("");
            const oracle: string = await market.oracle();
            const startTimestamp: bigint = await market.startTimestamp();
            const endTimestamp: bigint = await market.endTimestamp();
            const initialCloseTimestamp: bigint = await market.closeTimestamp();
            const initialResult: bigint = await market.result();
            const initialMarketPre: bigint = await pre.balanceOf(marketAddress);
            const initialMarketInfo: any[] = await market.getMarketInfo();
            const initialRedeemedShares: number = fromInt128toNumber(initialMarketInfo[2]);
            const initialWithdrawableCollateral = await market.getWithdrawableCollateral();
            if (detailsEnabled) {
                console.log(`\t| Oracle: ${oracle}`);
                console.log(`\t| StartTimestamp: ${startTimestamp}, EndTimestamp=${endTimestamp}`);
                console.log(`\t| StartTimestamp: ${startTimestamp}, EndTimestamp=${endTimestamp}`);
                console.log(`\t| Initial -> CloseTimestamp: ${initialCloseTimestamp}, Result=${initialResult}`);
                console.log(`\t|            Redeemed Shares: ${initialRedeemedShares}`);
                console.log(`\t|            Market Collateral: ${ethers.formatEther(initialMarketPre)} PRE`);
                console.log(`\t|            WithdrawableCollateral: ${initialWithdrawableCollateral}`);
            }

            // Note: do not matter if the 'owner' already redeemed. This should work with NO revert
            const accounts: string[] = [owner.address, caller.address, user.address];
            await market.connect(owner).redeemBatch(accounts);

            const ownerStats: bigint[] = await market.getAccountStats(owner.address);
            const ownerRedeemed = ethers.formatEther(ownerStats[4]);
            const ownerHasRedeemed: boolean = ownerStats[4] > 0;

            const callerStats: bigint[] = await market.getAccountStats(caller.address);
            const callerRedeemed = ethers.formatEther(callerStats[4]);
            const callerHasRedeemed: boolean = callerStats[4] > 0;

            const userStats: bigint[] = await market.getAccountStats(user.address);
            const userRedeemed = ethers.formatEther(userStats[4]);
            const userHasRedeemed: boolean = userStats[4] > 0;

            const finalMarketInfo: any[] = await market.getMarketInfo();
            const finalRedeemedShares: number = fromInt128toNumber(finalMarketInfo[2]);
            const finalMarketPre: bigint = await pre.balanceOf(marketAddress);
            const finalWithdrawableCollateral = await market.getWithdrawableCollateral();

            if (detailsEnabled) {
                console.log(`\t| owner -> Redeemed: ${ownerRedeemed} (HasRedeemed: ${ownerHasRedeemed})`);
                console.log(`\t| caller -> Redeemed: ${callerRedeemed} (HasRedeemed: ${callerHasRedeemed})`);
                console.log(`\t| user -> Redeemed: ${userRedeemed} (HasRedeemed: ${userHasRedeemed})`);
                console.log(`\t| Final -> Redeemed Shares: ${finalRedeemedShares}`);
                console.log(`\t|          Market Collateral: ${ethers.formatEther(finalMarketPre)} PRE`);
                console.log(`\t|          WithdrawableCollateral: ${finalWithdrawableCollateral}`);
            }

            const totalRedeemed = Number(ownerRedeemed) + Number(callerRedeemed) + Number(userRedeemed);
            expect(finalRedeemedShares).be.equal(totalRedeemed);
            expect(ownerHasRedeemed).be.equal(true);
            expect(callerHasRedeemed).be.equal(true);
            expect(userHasRedeemed).be.equal(true);
            expect(finalWithdrawableCollateral).be.equal(initialWithdrawableCollateral);
        })

        it("| Withdraw collateral (funding + profit) from Market", async function () {
            if (detailsEnabled) console.log("");
            const destination = owner.address;

            const initialDestinationPre: bigint = await pre.balanceOf(destination);
            const initialMarketPre: bigint = await pre.balanceOf(marketAddress);
            const initialMarketInfo: any[] = await market.getMarketInfo();
            const winningShares: number = fromInt128toNumber(initialMarketInfo[1][2]);
            const redeemedShares: number = fromInt128toNumber(initialMarketInfo[2]);
            const initialMarketSetupInfo: any[] = await market.getMarketSetupInfo();
            const initialShares: number = fromInt128toNumber(initialMarketSetupInfo[0]);
            const initialMarketCost: number = fromInt128toNumber(initialMarketInfo[3]);
            const withdrawableCollateral: bigint = await market.getWithdrawableCollateral();

            if (detailsEnabled) {
                console.log(`\t| Redeemable shares: ${winningShares - initialShares} (result=2)`);
                console.log(`\t| Total redeemed shares: ${redeemedShares}`);
                console.log(`\t| Withdrawable Collateral: ${ethers.formatEther(withdrawableCollateral)} PRE`);
                console.log(`\t| Initial Destination balance: ${ethers.formatEther(initialDestinationPre)} PRE`);
                console.log(`\t| Initial market balance: ${ethers.formatEther(initialMarketPre)} PRE`);
                console.log(`\t| Initial market cost: ${initialMarketCost} PRE`);
            }

            await market.withdrawAvailableCollateral(destination);

            const finalDestinationPre: bigint = await pre.balanceOf(destination);
            const finalMarketPre: bigint = await pre.balanceOf(marketAddress);
            const finalMarketInfo: any[] = await market.getMarketInfo();
            const finalMarketCost: number = fromInt128toNumber(finalMarketInfo[3]);

            if (detailsEnabled) {
                console.log(`\t| Final destination balance: ${ethers.formatEther(finalDestinationPre)} PRE`);
                console.log(`\t| Final market balance: ${ethers.formatEther(finalMarketPre)} PRE`);
                console.log(`\t| Final market cost: ${finalMarketCost} PRE`);
            }

            expect(finalDestinationPre).be.equal(initialDestinationPre + withdrawableCollateral);
            expect(finalMarketPre).be.equal(0);
            expect(finalMarketCost).be.equal(initialMarketCost);
        })
    })

    describe("Test a quaternary outcome Market", function () {
        it("| Deploy and setup a quaternary Market", async function () {
            if (detailsEnabled) console.log("");
            const PrecogMarket = await ethers.getContractFactory("PrecogMarketV8");
            quadMarket = await PrecogMarket.deploy();
            await quadMarket.initialize(preAddress);
            quadMarketAddress = await quadMarket.getAddress();
            if (detailsEnabled) {
                console.log(`\t|  Quad Market: ${quadMarketAddress}`);
                console.log(`\t|    Pre Token: ${preAddress}`);
            }
            expect(!quadMarketAddress);
            expect(quadMarketAddress).not.equal(marketAddress);

            // Approve quad market to use PRE tokens from users
            await pre.approve(quadMarketAddress, ethers.parseEther('10000'));
            await pre.connect(caller).approve(quadMarketAddress, ethers.parseEther('10000'));
            await pre.connect(user).approve(quadMarketAddress, ethers.parseEther('10000'));

            // Initialize a new quaternary market
            const ownerInitialBalance: bigint = await pre.balanceOf(owner.address);
            const marketId: number = 2;
            const totalOutcomes: number = 4;
            const initialShares: number = 500;
            const subsidy: bigint = ethers.parseEther(initialShares.toString());
            const overround: number = 400;  // General rule: 100x totalOutcomes
            await quadMarket.setup(marketId, owner.address, totalOutcomes, subsidy, overround);
            const ownerFinalBalance: bigint = await pre.balanceOf(owner.address);
            expect(await pre.balanceOf(quadMarketAddress)).to.equal(subsidy);
            expect(ownerFinalBalance).to.equal(ownerInitialBalance - subsidy);

            const marketInfo: any[] = await quadMarket.getMarketInfo();
            const totalShares: number = fromInt128toNumber(marketInfo[0]);
            const oneShares: number = fromInt128toNumber(marketInfo[1][1]);
            const twoShares: number = fromInt128toNumber(marketInfo[1][2]);
            const threeShares: number = fromInt128toNumber(marketInfo[1][3]);
            const fourShares: number = fromInt128toNumber(marketInfo[1][4]);
            const initialCost: number = fromInt128toNumber(marketInfo[3]);

            const marketSetupInfo: any[] = await quadMarket.getMarketSetupInfo();
            const marketAlpha: number = fromInt128toNumber(marketSetupInfo[1]);

            if (detailsEnabled) {
                console.log(`\t| Market Alpha: ${marketAlpha}`);
                console.log(`\t| Total shares: ${totalShares}`);
                console.log(`\t|  By Outcomes: 1=${oneShares}, 2=${twoShares}, 3=${threeShares}, 4=${fourShares}`);
                console.log(`\t|         Cost: ${initialCost}`);
            }

            expect(totalShares).be.equal(oneShares + twoShares + threeShares + fourShares);
            expect(initialCost).be.equal(520);  // 500 (Subsidy) + 4% (overround)

            // Register local market (to make verification against local calculations)
            localMarket = new LSLMSR(['A', 'B', 'C', 'D'], marketAlpha, initialShares);
        })

        it("| Check base quaternary Market prices", async function () {
            if (detailsEnabled) console.log("");
            const buyPrices: any[] = [null, [], [], [], []];  // the first item is added just for simplicity
            const sellPrices: any[] = [null, [], [], [], []];  // the first item is added just for simplicity
            const possibleOutcomes: number[] = [1, 2, 3, 4];
            for (const outcome of possibleOutcomes) {
                const sharesInt128: bigint = fromNumberToInt128(1);
                const priceInt128: bigint = await quadMarket.buyPrice(outcome, sharesInt128);
                const price: number = fromInt128toNumber(priceInt128);
                if (detailsEnabled) {
                    console.log(`\t|  Buy: outcome=${outcome}, amount=${1} => ${price}`);
                }
                buyPrices[outcome].push(price);
            }
            for (const outcome of possibleOutcomes) {
                const sharesInt128: bigint = fromNumberToInt128(1);
                const priceInt128: bigint = await quadMarket.sellPrice(outcome, sharesInt128);
                const price: number = fromInt128toNumber(priceInt128);
                if (detailsEnabled) {
                    console.log(`\t| Sell: outcome=${outcome}, amount=${1} => ${price}`);
                }
                sellPrices[outcome].push(price);
            }
            expect(buyPrices[1].toString()).to.equal(buyPrices[2].toString());
            expect(buyPrices[3].toString()).to.equal(buyPrices[4].toString());
            expect(buyPrices[1].toString()).to.equal(buyPrices[4].toString());
            expect(sellPrices[1].toString()).to.equal(sellPrices[2].toString());
            expect(sellPrices[3].toString()).to.equal(sellPrices[4].toString());
            expect(sellPrices[1].toString()).to.equal(sellPrices[4].toString());

            // Test prices using new V7 getter function
            const quadMarketPrices: bigint[][] = await quadMarket.getPrices();
            const fBuyPrices = quadMarketPrices[0].map(value => Number(ethers.formatEther(value)));
            const fSellPrices = quadMarketPrices[1].map(value => Number(ethers.formatEther(value)));
            if (detailsEnabled) {
                console.log(`\t|  Fast Buy Prices: Outcome 1(${fBuyPrices[1]}) - Outcome 2(${fBuyPrices[2]})`);
                console.log(`\t|                   Outcome 3(${fBuyPrices[3]}) - Outcome 4(${fBuyPrices[4]})`);
                console.log(`\t| Fast Sell Prices: Outcome 1(${fSellPrices[1]}) - Outcome 2(${fSellPrices[2]})`);
                console.log(`\t|                   Outcome 3(${fSellPrices[3]}) - Outcome 4(${fSellPrices[4]})`);
            }
            expect(fBuyPrices[1]).to.be.equal(buyPrices[1][0]);
            expect(fBuyPrices[2]).to.be.equal(buyPrices[2][0]);
            expect(fBuyPrices[3]).to.be.equal(buyPrices[3][0]);
            expect(fBuyPrices[4]).to.be.equal(buyPrices[4][0]);
            expect(fSellPrices[1]).to.be.equal(sellPrices[1][0]);
            expect(fSellPrices[2]).to.be.equal(sellPrices[2][0]);
            expect(fSellPrices[3]).to.be.equal(sellPrices[3][0]);
            expect(fSellPrices[4]).to.be.equal(sellPrices[4][0]);
        })

        it("| Buy 10 shares of outcome=4 (with max cost)", async function () {
            if (detailsEnabled) console.log("");
            const balanceBefore = await pre.balanceOf(owner.address);
            const outcome: number = 4;
            const shares: number = 10;
            const sharesInt128: bigint = fromNumberToInt128(shares);
            if (detailsEnabled) {
                console.log(`\t| Buying: outcome=${outcome}, shares=${shares} [${sharesInt128}]`);
            }
            const priceInt128: bigint = await quadMarket.buyPrice(outcome, sharesInt128);
            const price: number = fromInt128toNumber(priceInt128);

            // Pre-calculate buy price (after trade is made) from Chain
            const priceInt128OneMoreShare: bigint = await quadMarket.buyPrice(outcome, fromNumberToInt128(shares + 1));
            const futureBuyPrice: number = fromInt128toNumber(priceInt128OneMoreShare) - price;

            // Execute buy trade
            const maxCost = ethers.parseUnits(`${price * 1.0000000001}`, 18);
            await quadMarket.buy(outcome, sharesInt128, maxCost);

            const balanceAfter: bigint = await pre.balanceOf(owner.address);
            const preCost: number = Number(ethers.formatEther(balanceBefore - balanceAfter));
            if (detailsEnabled) {
                console.log(`\t| Buy cost: ${preCost}, Calculated Price: ${price}`);
            }
            const priceTolerance = 0.0000000001;  // at lease 9 digits
            expect(preCost).to.be.closeTo(price, priceTolerance);

            const priceInt128BeforeBuy: bigint = await quadMarket.buyPrice(outcome, fromNumberToInt128(1));
            const actualBuyPrice: number = fromInt128toNumber(priceInt128BeforeBuy);
            if (detailsEnabled) {
                console.log(`\t| Future Buy price (before buy): ${futureBuyPrice} [chain]`);
                console.log(`\t| Actual Buy price (after buy) : ${actualBuyPrice} [chain]`);
            }
            const ownerStats: any[] = await quadMarket.getAccountStats(owner.address);
            const outcomeBalances: bigint[] = await quadMarket.getAccountOutcomeBalances(owner.address);
            const oneShares: string = ethers.formatEther(outcomeBalances[1]);
            const twoShares: string = ethers.formatEther(outcomeBalances[2]);
            const threeShares: string = ethers.formatEther(outcomeBalances[3]);
            const fourShares: string = ethers.formatEther(outcomeBalances[4]);
            const buys: bigint = ownerStats[0];
            const sells: bigint = ownerStats[1];
            const deposited: string = ethers.formatEther(ownerStats[2]);
            const withdrawn: string = ethers.formatEther(ownerStats[3]);
            const redeemed: string = ethers.formatEther(ownerStats[4]);
            if (detailsEnabled) {
                console.log(`\t| Buys: ${buys}, Sells: ${sells}`);
                console.log(`\t| Deposited: ${deposited}, Withdrawn: ${withdrawn}, 'Redeemed': ${redeemed}`);
                console.log(`\t| Shares by outcome: 1=${oneShares}, 2=${twoShares}, 3=${threeShares}, 4=${fourShares}`);
            }
            expect(Number(buys)).be.equal(1);
            expect(Number(sells)).be.equal(0);
            expect(Number(oneShares)).be.equal(0);
            expect(Number(twoShares)).be.equal(0);
            expect(Number(twoShares)).be.equal(0);
            expect(Number(fourShares)).be.equal(shares);
        })

        it("| Check new quaternary Market prices (after buy)", async function () {
            if (detailsEnabled) console.log("");
            const buyPrices: any[] = [null, [], [], [], []];  // the first item is added just for simplicity
            const sellPrices: any[] = [null, [], [], [], []];  // the first item is added just for simplicity
            const possibleOutcomes: number[] = [1, 2, 3, 4];
            for (const outcome of possibleOutcomes) {
                const sharesInt128: bigint = fromNumberToInt128(1);
                const priceInt128: bigint = await quadMarket.buyPrice(outcome, sharesInt128);
                const price: number = fromInt128toNumber(priceInt128);
                if (detailsEnabled) {
                    console.log(`\t|  Buy: outcome=${outcome}, amount=${1} => ${price}`);
                }
                buyPrices[outcome].push(price);
            }
            for (const outcome of possibleOutcomes) {
                const sharesInt128: bigint = fromNumberToInt128(1);
                const priceInt128: bigint = await quadMarket.sellPrice(outcome, sharesInt128);
                const price: number = fromInt128toNumber(priceInt128);
                if (detailsEnabled) {
                    console.log(`\t| Sell: outcome=${outcome}, amount=${1} => ${price}`);
                }
                sellPrices[outcome].push(price);
            }

            // All prices of outcomes 1, 2 and 3 should be equal
            expect(buyPrices[1].toString()).to.equal(buyPrices[2].toString());
            expect(buyPrices[2].toString()).to.equal(buyPrices[3].toString());
            expect(sellPrices[1].toString()).to.equal(sellPrices[2].toString());
            expect(sellPrices[2].toString()).to.equal(sellPrices[3].toString());
            // Any price of outcome 4 should be higher than any price of all other outcomes
            expect(buyPrices[4][0]).be.greaterThan(buyPrices[1][0]);
            expect(sellPrices[4][0]).be.greaterThan(sellPrices[1][0]);

            // Test prices using new V7 getter function
            const quadMarketPrices: bigint[][] = await quadMarket.getPrices();
            const fBuyPrices = quadMarketPrices[0].map(value => Number(ethers.formatEther(value)));
            const fSellPrices = quadMarketPrices[1].map(value => Number(ethers.formatEther(value)));
            if (detailsEnabled) {
                console.log(`\t|  Fast Buy Prices: Outcome 1(${fBuyPrices[1]}) - Outcome 2(${fBuyPrices[2]})`);
                console.log(`\t|                   Outcome 3(${fBuyPrices[3]}) - Outcome 4(${fBuyPrices[4]})`);
                console.log(`\t| Fast Sell Prices: Outcome 1(${fSellPrices[1]}) - Outcome 2(${fSellPrices[2]})`);
                console.log(`\t|                   Outcome 3(${fSellPrices[3]}) - Outcome 4(${fSellPrices[4]})`);
            }
            expect(fBuyPrices[1]).to.be.equal(buyPrices[1][0]);
            expect(fBuyPrices[2]).to.be.equal(buyPrices[2][0]);
            expect(fBuyPrices[3]).to.be.equal(buyPrices[3][0]);
            expect(fBuyPrices[4]).to.be.equal(buyPrices[4][0]);
            expect(fSellPrices[1]).to.be.equal(sellPrices[1][0]);
            expect(fSellPrices[2]).to.be.equal(sellPrices[2][0]);
            expect(fSellPrices[3]).to.be.equal(sellPrices[3][0]);
            expect(fSellPrices[4]).to.be.equal(sellPrices[4][0]);
        })

        it("| Report outcome=4 as result for quaternary Market", async function () {
            if (detailsEnabled) console.log("");
            const oracle: string = await quadMarket.oracle();
            const startTimestamp: bigint = await quadMarket.startTimestamp();
            const endTimestamp: bigint = await quadMarket.endTimestamp();
            const initialCloseTimestamp: bigint = await quadMarket.closeTimestamp();
            const initialResult: bigint = await quadMarket.result();
            if (detailsEnabled) {
                console.log(`\t| Oracle: ${oracle}`);
                console.log(`\t| StartTimestamp: ${startTimestamp}, EndTimestamp=${endTimestamp}`);
                console.log(`\t| Initial -> CloseTimestamp: ${initialCloseTimestamp}, Result=${initialResult}`);
            }

            const marketId: number = 2;
            const resultOutcome: number = 4;
            await quadMarket.reportResult(marketId, resultOutcome);

            const finalCloseTimestamp: bigint = await quadMarket.closeTimestamp();
            const finalResult: bigint = await quadMarket.result();
            if (detailsEnabled) {
                console.log(`\t|   Final -> CloseTimestamp: ${finalCloseTimestamp}, Result=${finalResult}`);
            }

            expect(initialResult).be.equal(0);
            expect(initialCloseTimestamp).be.equal(0);
            expect(finalResult).be.equal(resultOutcome);
            expect(finalCloseTimestamp).be.greaterThan(0);
        })

        it("| Redeem shares from quaternary Market", async function () {
            if (detailsEnabled) console.log("");
            const initialPre: bigint = await pre.balanceOf(owner.address);
            const initialOwnerStats: bigint[] = await quadMarket.getAccountStats(owner.address);
            const outcomeBalances: bigint[] = await quadMarket.getAccountOutcomeBalances(owner.address);
            const oneShares: string = ethers.formatEther(outcomeBalances[1]);
            const twoShares: string = ethers.formatEther(outcomeBalances[2]);
            const threeShares: string = ethers.formatEther(outcomeBalances[3]);
            const fourShares: string = ethers.formatEther(outcomeBalances[4]);
            const buys: bigint = initialOwnerStats[0];
            const sells: bigint = initialOwnerStats[1];
            const deposited: string = ethers.formatEther(initialOwnerStats[2]);
            const withdrawn: string = ethers.formatEther(initialOwnerStats[3]);
            const initialRedeemed: string = ethers.formatEther(initialOwnerStats[4]);
            if (detailsEnabled) {
                console.log(`\t| Initial balance: ${ethers.formatEther(initialPre)} PRE`);
                console.log(`\t| Buys: ${buys}, Sells: ${sells}`);
                console.log(`\t| Deposited: ${deposited}, Withdrawn: ${withdrawn}, Redeemed: ${initialRedeemed}`);
                console.log(`\t| Shares by outcome: 1=${oneShares}, 2=${twoShares}, 3=${threeShares}, 4=${fourShares}`);
            }
            const sharesToRedeem: bigint = outcomeBalances[4]; // balance of outcome 2 shares

            await quadMarket.redeemShares();

            const finalOwnerStats: bigint[] = await quadMarket.getAccountStats(owner.address);
            const finalPre: bigint = await pre.balanceOf(owner.address);
            const finalRedeemed: string = ethers.formatEther(finalOwnerStats[4]);
            const redeemedBalance: bigint = finalPre - initialPre;
            const deltaPre: string = ethers.formatEther(finalPre - initialPre);
            if (detailsEnabled) {
                console.log(`\t| Final balance: ${ethers.formatEther(finalPre)} PRE (delta: ${deltaPre})`);
                console.log(`\t| Final Redeemed: ${finalRedeemed}`);
            }

            expect(redeemedBalance).be.equal(sharesToRedeem);
        })

        it("| Withdraw all collateral left from quaternary Market", async function () {
            if (detailsEnabled) console.log("");
            const destination = owner.address;

            const initialDestinationCollateral: bigint = await pre.balanceOf(destination);
            const initialMarketCollateral: bigint = await pre.balanceOf(quadMarketAddress);

            const marketResult: bigint = await quadMarket.result();
            const initialMarketInfo: any[] = await quadMarket.getMarketInfo();
            const winningShares: number = fromInt128toNumber(initialMarketInfo[1][Number(marketResult)]);
            const redeemedShares: number = fromInt128toNumber(initialMarketInfo[2]);
            const initialMarketSetupInfo: any[] = await quadMarket.getMarketSetupInfo();
            const initialShares: number = fromInt128toNumber(initialMarketSetupInfo[0]);
            const withdrawableCollateral: bigint = await quadMarket.getWithdrawableCollateral();
            if (detailsEnabled) {
                console.log(`\t| Redeemable shares: ${winningShares - initialShares} (result=${marketResult})`);
                console.log(`\t| Total redeemed shares: ${redeemedShares}`);
                console.log(`\t| Total Withdrawable: ${ethers.formatUnits(withdrawableCollateral, 18)} PRE`);
                console.log(`\t| Collateral balance (before withdraw):`);
                console.log(`\t|   Destination: ${ethers.formatUnits(initialDestinationCollateral, 18)} PRE`);
                console.log(`\t|        Market: ${ethers.formatUnits(initialMarketCollateral, 18)} PRE`);
            }

            await quadMarket.withdrawAvailableCollateral(destination);

            const finalDestinationCollateral: bigint = await pre.balanceOf(destination);
            const finalMarketCollateral: bigint = await pre.balanceOf(quadMarketAddress);
            if (detailsEnabled) {
                console.log(`\t| Collateral balance (after withdraw):`);
                console.log(`\t|   Destination: ${ethers.formatUnits(finalDestinationCollateral, 18)} PRE`);
                console.log(`\t|        Market: ${ethers.formatUnits(finalMarketCollateral, 18)} PRE`);
            }

            expect(redeemedShares).be.equal(winningShares - initialShares);
            expect(finalDestinationCollateral).be.equal(initialDestinationCollateral + withdrawableCollateral);
            expect(finalMarketCollateral).be.equal(0);
        })
    })

    describe("Test a Virtual Liquidity Market", function () {
        it("| Deploy fakeUSDC contract and mint tokens for users", async function () {
            if (detailsEnabled) console.log("");

            const USDC = await ethers.getContractFactory("FakeUSDC");
            const precogMaster: string = owner.address;
            usdc = await USDC.deploy(precogMaster);
            usdcAddress = await usdc.getAddress();

            const usdcDecimals: number = Number(await usdc.decimals());
            const usdcSymbol: string = await usdc.symbol();

            if (detailsEnabled) {
                console.log(`\t|  USDC Address: ${usdcAddress}`);
                console.log(`\t|      Decimals: ${usdcDecimals}`);
                console.log(`\t|        Symbol: ${usdcSymbol}`);
            }

            const initialSupply: bigint = ethers.parseUnits('100000', usdcDecimals);
            await usdc.mint(owner.address, initialSupply);
            await usdc.mint(caller.address, initialSupply);
            await usdc.mint(user.address, initialSupply * BigInt(3));

            expect(await usdc.balanceOf(owner.address)).to.equal(initialSupply);
            expect(await usdc.balanceOf(caller.address)).to.equal(initialSupply);
            expect(await usdc.balanceOf(user.address)).to.equal(initialSupply * BigInt(3));
        })

        it("| Deploy and setup a Market with virtual liquidity", async function () {
            if (detailsEnabled) console.log("");
            const PrecogMarket = await ethers.getContractFactory("PrecogMarketV8");

            vlMarket = await PrecogMarket.deploy();
            await vlMarket.initialize(usdcAddress);

            vlMarketAddress = await vlMarket.getAddress();
            const usdcSymbol = await usdc.symbol();
            if (detailsEnabled) {
                console.log(`\t|      VL Market: ${vlMarketAddress}`);
                console.log(`\t|     Collateral: ${usdcSymbol} (${usdcAddress})`);
            }
            expect(!vlMarketAddress);
            expect(vlMarketAddress).not.equal(marketAddress);

            // Approve market to use USDC tokens from users
            const decimals: number = Number(await usdc.decimals());
            await usdc.connect(owner).approve(vlMarketAddress, ethers.parseUnits('50000', decimals));
            await usdc.connect(caller).approve(vlMarketAddress, ethers.parseUnits('50000', decimals));
            await usdc.connect(user).approve(vlMarketAddress, ethers.parseUnits('50000', decimals));

            // Initialize a new quaternary market
            const ownerInitialBalance: bigint = await usdc.balanceOf(owner.address);
            const marketId: number = 3;
            const totalOutcomes: number = 4;
            const overround: number = 400;  // General rule: 100x totalOutcomes
            const funding: number = 1_000;
            const initialShares: number = funding / (overround / 10_000);
            const virtualLiquidity: bigint = ethers.parseUnits(`${initialShares}`, decimals);
            const realLiquidity: bigint = ethers.parseUnits(`${funding}`, decimals)

            await vlMarket.setupVL(marketId, owner.address, totalOutcomes, virtualLiquidity, overround, realLiquidity);

            const ownerFinalBalance: bigint = await usdc.balanceOf(owner.address);
            const ownerSetupCost: bigint = ownerInitialBalance - ownerFinalBalance;
            const marketFinalBalance: bigint = await usdc.balanceOf(vlMarketAddress)

            const marketSetupInfo: any[] = await vlMarket.getMarketSetupInfo();
            const marketInitialShares: number = fromInt128toNumber(marketSetupInfo[0]);
            const marketAlpha: number = fromInt128toNumber(marketSetupInfo[1]);
            const marketTotalOutcomes: number = Number(marketSetupInfo[2]);

            const marketInfo: any[] = await vlMarket.getMarketInfo();
            const totalShares: number = fromInt128toNumber(marketInfo[0]);
            const oneShares: number = fromInt128toNumber(marketInfo[1][1]);
            const twoShares: number = fromInt128toNumber(marketInfo[1][2]);
            const threeShares: number = fromInt128toNumber(marketInfo[1][3]);
            const fourShares: number = fromInt128toNumber(marketInfo[1][4]);
            const currentCost: number = fromInt128toNumber(marketInfo[3]);

            // Calculate deployed market info
            const marketOverround = marketAlpha * Math.log(marketTotalOutcomes) * marketTotalOutcomes;

            if (detailsEnabled) {
                console.log(`\t|   Virtual Liq.: ${marketInitialShares} ${usdcSymbol}`);
                console.log(`\t|   Creator Cost: ${ethers.formatUnits(ownerSetupCost, decimals)} ${usdcSymbol}`);
                console.log(`\t|      Overround: ${marketOverround}, Alpha: ${marketAlpha}`);
                console.log(`\t|   Total shares: ${totalShares}, Outcomes: ${marketTotalOutcomes}`);
                console.log(`\t|    By Outcomes: 1=${oneShares}, 2=${twoShares}, 3=${threeShares}, 4=${fourShares}`);
                console.log(`\t|     Collateral: ${ethers.formatUnits(marketFinalBalance, decimals)} ${usdcSymbol}`);
            }

            expect(marketOverround).be.equal(overround / 10_000);  // 0.04 (overround)
            expect(marketInitialShares).be.equal(initialShares);  // 25000 (Initial Shares)
            expect(ownerSetupCost).be.equal(realLiquidity);
            expect(marketFinalBalance).be.equal(realLiquidity);
            expect(totalShares).be.equal(initialShares * totalOutcomes);
            expect(currentCost).be.equal(initialShares * (1 + overround / 10_000));  //

            // Register local market (to make verification against local calculations)
            localMarket = new LSLMSR(['A', 'B', 'C', 'D'], marketAlpha, initialShares);
        })

        it("| Check buy costs and share prices precision", async function () {
            if (detailsEnabled) console.log("");

            const localAlpha = localMarket.alpha;
            const localInitialShares = localMarket.initialShares;
            const localMaxBuyShares = Math.floor(localMarket.maxSharesFromPrice('A', 0.99998));

            if (detailsEnabled) {
                console.log(`\t| Local Market info:`);
                console.log(`\t|            Alpha: ${localAlpha}`);
                console.log(`\t|   Initial Shares: ${localInitialShares}`);
                console.log(`\t|   Max Buy shares: ${localMaxBuyShares}`);
                console.log(`\t| Market Buy Prices (on chain vs local):`);
            }

            // Get all Buy prices from Market on-chain
            const outcome: number =  1  // Index of the outcome to buy
            const sharesAmounts: number[] = [1, 10, 100, 1000, 2000, 5000, 10_000, 12_000, 15_000, 20_000, 25_000];
            for (const amount of sharesAmounts) {
                // Calculate share price for on chain market
                const sharesInt128: bigint = fromNumberToInt128(amount);
                const costInt128: bigint = await vlMarket.buyPrice(outcome, sharesInt128);
                const cost: number = fromInt128toNumber(costInt128);
                const price: number = cost / amount;

                // Calculate share price for local market
                const outcomeLabel: string = localMarket.getOutcome(outcome);
                const localCost: number = localMarket.tradeCost(outcomeLabel, amount);
                const localPrice: number = localCost / amount;

                const pricePrecision = matchedDecimalPlaces(localPrice, price);
                const costPrecision = matchedDecimalPlaces(localCost, cost);

                if (detailsEnabled) {
                    const buyDetails = `Buy (out=${outcome}, shares=${amount.toString().padStart(4)})`;
                    const resultDetails = `price: ${price.toFixed(12)}, cost: ${cost.toFixed(12)}`;
                    const precisionDetails = `Precision: p=${pricePrecision}, c=${costPrecision}`;
                    console.log(`\t|  ${buyDetails} => ${resultDetails} (${precisionDetails})`);
                }

                // Test price and cost precision
                const decimalPrecision = 9;
                expect(pricePrecision).be.greaterThanOrEqual(decimalPrecision);
                expect(costPrecision).be.greaterThanOrEqual(decimalPrecision);
            }
        })

        it("| Check sell returns and share prices precision", async function () {
            if (detailsEnabled) console.log("");

            // Update `sellFeeFactor` to verify sell price sensitivity
            const newFactor = 5; //  SellFee = 20%
            await vlMarket.updateSellFeeFactor(newFactor);

            // Get sell mitigation variable from the market
            const marketSetupInfo: any[] = await vlMarket.getMarketSetupInfo();
            const marketSellFeeFactor: number = fromInt128toNumber(marketSetupInfo[3]);
            const marketSellFee: number = 1 / marketSellFeeFactor;

            // Set sellFee on local market
            localMarket.sellFee = marketSellFee;

            if (detailsEnabled) {
                console.log(`\t| Market Sell Fee Factor: ${marketSellFeeFactor} (${marketSellFee * 100}%)`);
                console.log(`\t| Local Market info:`);
                console.log(`\t|            Alpha: ${localMarket.alpha}`);
                console.log(`\t|   Initial Shares: ${localMarket.initialShares}`);
                console.log(`\t|         Sell Fee: ${localMarket.sellFee}`);
                console.log(`\t| Market Sell Prices (on chain vs local):`);
            }

            // Get all Buy prices from Market on-chain
            const outcome: number =  1  // Index of the outcome to sell
            const sharesAmounts: number[] = [1, 10, 100, 1000, 2000, 5000, 10_000, 12_000, 15_000, 20_000, 25_000];
            for (const amount of sharesAmounts) {
                // Calculate share price for on chain market
                const sharesInt128: bigint = fromNumberToInt128(amount);
                const costInt128: bigint = await vlMarket.sellPrice(outcome, sharesInt128);
                const cost: number = fromInt128toNumber(costInt128);
                const price: number = cost / amount;

                // Calculate share price for local market
                const outcomeLabel: string = localMarket.getOutcome(outcome);
                const localCost: number = localMarket.tradeCost(outcomeLabel, -amount);
                const localPrice: number = localCost / amount;

                // Calculate cost and price precision
                const costPrecision = matchedDecimalPlaces(localCost, cost);
                const pricePrecision = matchedDecimalPlaces(localPrice, price);

                if (detailsEnabled) {
                    const buyDetails = `Sell (out=${outcome}, shares=${amount.toString().padStart(5)})`;
                    const resultDetails = `price: ${price.toFixed(12)}, cost: ${cost.toFixed(12)}`;
                    const precisionDetails = `Precision: p=${pricePrecision}, c=${costPrecision}`;
                    console.log(`\t|  ${buyDetails} => ${resultDetails} (${precisionDetails})`);
                }

                // Test price and cost precision
                const decimalPrecision = 9;
                expect(pricePrecision).be.greaterThanOrEqual(decimalPrecision);
                expect(costPrecision).be.greaterThanOrEqual(decimalPrecision);
            }
        })

        it("| Test buy limit and verify max-loss on worst-case scenario", async function () {
            // To reach theoretical max loss on the chain, we simulate the worst scenario (an obvious market).
            if (detailsEnabled) console.log("");
            const outcome: number = 1;

            // Get initial market values
            const collateralBefore: bigint = await usdc.balanceOf(vlMarketAddress);
            const marketCollateralBefore: number = Number(ethers.formatUnits(collateralBefore, 6));
            const marketInfoBefore: any[] = await vlMarket.getMarketInfo();
            const sharesBalancesBefore: any[] = marketInfoBefore[1].map((value: bigint) => fromInt128toNumber(value));
            const marketInitialShares = sharesBalancesBefore[outcome];  // Shares per outcome

            if (detailsEnabled) {
                console.log(`\t| Market (before max buy):`);
                console.log(`\t|   Collateral: ${marketCollateralBefore} USDC [raw: ${collateralBefore}]`);
                console.log(`\t|   Initial Shares: ${marketInitialShares} (per outcome)`);
            }

            // Make outcome 1 cheap buying max amounts of the other 3 outcomes
            await usdc.mint(owner.address, '1000000000000');
            await usdc.approve(vlMarketAddress, '1000000000000');
            await vlMarket.buy(2, fromNumberToInt128(50000), 0); localMarket.buy('B', 50000);  // Buy max amount of B
            await vlMarket.buy(3, fromNumberToInt128(50000), 0); localMarket.buy('C', 50000);  // Buy max amount of C
            await vlMarket.buy(4, fromNumberToInt128(50000), 0); localMarket.buy('D', 50000);  // Buy max amount of D

            // Calculate the number of shares to be bought to reach close to 1 (marginal share price)
            const targetPrice = 1.0;
            const firstOutcome = localMarket.outcomes[outcome - 1];
            const maxShares = Math.ceil(localMarket.maxSharesFromPrice(firstOutcome, targetPrice));

            // Get the current market price and calculate max token in
            const maxSharesAmount: bigint = fromNumberToInt128(maxShares);
            const buyPriceInt128: bigint = await vlMarket.buyPrice(outcome, maxSharesAmount);
            const buyCost: number = fromInt128toNumber(buyPriceInt128);
            const maxAmountIn: bigint = ethers.parseUnits(buyCost.toFixed(6), 6);

            // Give allowance of USDC to Market
            await usdc.connect(user).approve(vlMarketAddress, maxAmountIn);
            const userBalance = ethers.formatUnits(await usdc.balanceOf(user.address), 6);

            if (detailsEnabled) {
                console.log(`\t| Max BUY: ${targetPrice.toFixed(1)} target price (user balance: ${userBalance} USDC)`);
                console.log(`\t| Buying: outcome=${outcome}, amount=${maxShares}, expectedCost=${buyCost} USDC`);
            }

            // Send BUY call as a random user
            await vlMarket.connect(user).buy(outcome, maxSharesAmount, maxAmountIn);

            if (detailsEnabled) {
                console.log(`\t|   Max buy executed!`);
            }

            // Sell all shares (not outcome 1) to even push harder outcome 1 to the limit (also testing selling at 0)
            await vlMarket.sell(2, fromNumberToInt128(50000), 0); localMarket.sell('B', 50000);  // SELL all shares
            await vlMarket.sell(3, fromNumberToInt128(50000), 0); localMarket.sell('C', 50000);  // SELL all shares
            await vlMarket.sell(4, fromNumberToInt128(50000), 0); localMarket.sell('D', 50000);  // SELL all shares

            // Get market state after the trade
            const marketPrices = await vlMarket.getPrices();
            const marketInfoAfter: any[] = await vlMarket.getMarketInfo();
            const sharesBalancesAfter: any[] = marketInfoAfter[1].map((value: bigint) => fromInt128toNumber(value));
            const collateralAfter: bigint = await usdc.balanceOf(vlMarketAddress);
            const marketCollateralAfter: number = Number(ethers.formatUnits(collateralAfter, 6));
            const marketMaxPayout: number = sharesBalancesAfter[outcome] - marketInitialShares;
            const marketCollateralLeft: number = marketCollateralAfter - marketMaxPayout;
            const marketMaxLoss = marketCollateralBefore - marketCollateralLeft;

            if (detailsEnabled) {
                console.log(`\t| Market (after max buy):`);
                console.log(`\t|   Buy Prices: ${marketPrices[0].slice(1).map(n => Number(n) / 10 ** 6)}`);
                console.log(`\t|   Sell Prices: ${marketPrices[1].slice(1).map(n => Number(n) / 10 ** 6)}`);
                console.log(`\t|   Shares Balances: ${sharesBalancesAfter.slice(1)}`);
                console.log(`\t|   Collateral: ${marketCollateralAfter} USDC [raw: ${collateralAfter}]`);
                console.log(`\t|   Max Payout: ${marketMaxPayout} USDC`);
                console.log(`\t|   Max Loss: ${marketMaxLoss.toFixed(6)} USDC`);
            }

            // Register trade on local market and get theoretical data
            localMarket.buy(firstOutcome, maxShares);
            const theoreticalMaxLoss = localMarket.maxLoss();
            const totalOutcomes = localMarket.outcomes.length;
            const overround = localMarket.alpha * (totalOutcomes * Math.log(totalOutcomes));
            const balances = localMarket.getBalances();
            if (detailsEnabled) {
                console.log(`\t| Theoretical local market:`);
                console.log(`\t|   Overround: ${overround}, Total Outcomes: ${totalOutcomes}`);
                console.log(`\t|   Balances: ${Object.values(balances)}`);
                console.log(`\t|   Max Loss: ${theoreticalMaxLoss}`);
            }

            // Calculate empirical delta against on chain market
            expect(marketMaxLoss).be.lessThanOrEqual(theoreticalMaxLoss);
        })

        it("| Report outcome=1 as result for VL Market", async function () {
            if (detailsEnabled) console.log("");
            const oracle: string = await vlMarket.oracle();
            const initialCloseTimestamp: bigint = await vlMarket.closeTimestamp();
            const initialResult: bigint = await vlMarket.result();
            const initialWithdrawableTokens: bigint = await vlMarket.getWithdrawableCollateral();

            if (detailsEnabled) {
                console.log(`\t| Oracle: ${oracle}`);
                console.log(`\t| Initial -> CloseTimestamp: ${initialCloseTimestamp}, Result=${initialResult}`);
                console.log(`\t|            Withdrawable: ${ethers.formatUnits(initialWithdrawableTokens, 6)} USDC`);
            }

            const marketId: number = 3;
            const resultOutcome: number = 1;
            if (detailsEnabled) console.log(`\t| Reporting result: outcome=${resultOutcome}, marketId=${marketId}`);
            await vlMarket.reportResult(marketId, resultOutcome);
            if (detailsEnabled) console.log(`\t|   Result Reported!`);

            const finalCloseTimestamp: bigint = await vlMarket.closeTimestamp();
            const finalResult: bigint = await vlMarket.result();
            const finalWithdrawableTokens: bigint = await vlMarket.getWithdrawableCollateral();
            if (detailsEnabled) {
                console.log(`\t| Final -> CloseTimestamp: ${finalCloseTimestamp}, Result=${finalResult}`);
                console.log(`\t|          Withdrawable: ${ethers.formatUnits(finalWithdrawableTokens, 6)} USDC`);
            }

            expect(initialResult).be.equal(0);
            expect(initialCloseTimestamp).be.equal(0);
            expect(initialWithdrawableTokens).be.equal(0);
            expect(finalResult).be.equal(resultOutcome);
            expect(finalCloseTimestamp).be.greaterThan(0);
            expect(finalWithdrawableTokens).be.equal(0);  // 0 USDC (after max-loss scenario)
        })

        it("| Redeem all wining shares from VL Market", async function () {
            if (detailsEnabled) console.log("");
            const initialCollateral: bigint = await usdc.balanceOf(user.address);
            const initialOwnerStats: bigint[] = await vlMarket.getAccountStats(user.address);
            const initialOutcomeBalances: bigint[] = await vlMarket.getAccountOutcomeBalances(user.address);
            const initialRedeemed: bigint = initialOwnerStats[4];
            const initialMarketInfo: any[] = await vlMarket.getMarketInfo();
            const initialTotalRedeemedShares: number = fromInt128toNumber(initialMarketInfo[2]);

            const marketResult: bigint = await vlMarket.result();
            const sharesToRedeem: bigint = initialOutcomeBalances[Number(marketResult)];

            if (detailsEnabled) {
                console.log(`\t| Market Result: ${marketResult} (total redeemed: ${initialTotalRedeemedShares})`);
                console.log(`\t| Initial -> Collateral: ${ethers.formatUnits(initialCollateral, 6)} USDC`);
                console.log(`\t|            Wining Shares: ${ethers.formatUnits(sharesToRedeem, 6)}`);
            }

            const redeemTx = vlMarket.connect(user).redeemShares();
            await expect(redeemTx).to.emit(vlMarket, "SharesRedeemed");

            const finalMarketInfo: any[] = await vlMarket.getMarketInfo();
            const finalTotalRedeemedShares: number = fromInt128toNumber(finalMarketInfo[2]);
            const finalOwnerStats: bigint[] = await vlMarket.getAccountStats(user.address);
            const finalCollateral: bigint = await usdc.balanceOf(user.address);
            const finalRedeemed: bigint = finalOwnerStats[4];
            const redeemedBalance: bigint = finalCollateral - initialCollateral;
            if (detailsEnabled) {
                console.log(`\t|   Final -> Collateral: ${ethers.formatUnits(finalCollateral, 6)} USDC`);
                console.log(`\t|            Redeemed Shares: ${ethers.formatUnits(finalRedeemed, 6)}`);
                console.log(`\t|            Redeemed Collateral: ${ethers.formatUnits(redeemedBalance, 6)}`);
                console.log(`\t| Market Total redeemed shares: ${finalTotalRedeemedShares}`);
            }

            expect(initialRedeemed).be.equal(0);
            expect(finalRedeemed).be.equal(sharesToRedeem);
            expect(redeemedBalance).be.equal(sharesToRedeem);
            const redeemedShares: number = Number(ethers.formatUnits(redeemedBalance, 6));
            expect(redeemedShares).be.equal(finalTotalRedeemedShares - initialTotalRedeemedShares);
        })

        it("| Withdraw all collateral left from VL Market", async function () {
            if (detailsEnabled) console.log("");
            const destination = owner.address;

            const initialDestinationCollateral: bigint = await usdc.balanceOf(destination);
            const initialMarketCollateral: bigint = await usdc.balanceOf(vlMarketAddress);

            const marketResult: bigint = await vlMarket.result();
            const initialMarketInfo: any[] = await vlMarket.getMarketInfo();
            const winningShares: number = fromInt128toNumber(initialMarketInfo[1][Number(marketResult)]);
            const redeemedShares: number = fromInt128toNumber(initialMarketInfo[2]);
            const initialMarketSetupInfo: any[] = await vlMarket.getMarketSetupInfo();
            const initialShares: number = fromInt128toNumber(initialMarketSetupInfo[0]);
            const withdrawableCollateral: bigint = await vlMarket.getWithdrawableCollateral();
            if (detailsEnabled) {
                console.log(`\t| Redeemable shares: ${winningShares - initialShares} (result=${marketResult})`);
                console.log(`\t| Total redeemed shares: ${redeemedShares}`);
                console.log(`\t| Total Withdrawable: ${ethers.formatUnits(withdrawableCollateral, 6)} USDC`);
                console.log(`\t| Collateral balance (before withdraw):`);
                console.log(`\t|   Destination: ${ethers.formatUnits(initialDestinationCollateral, 6)} USDC`);
                console.log(`\t|        Market: ${ethers.formatUnits(initialMarketCollateral, 6)} USDC`);
            }

            await vlMarket.withdrawAvailableCollateral(destination);

            const finalDestinationCollateral: bigint = await usdc.balanceOf(destination);
            const finalMarketCollateral: bigint = await usdc.balanceOf(vlMarketAddress);
            if (detailsEnabled) {
                console.log(`\t| Collateral balance (after withdraw):`);
                console.log(`\t|   Destination: ${ethers.formatUnits(finalDestinationCollateral, 6)} USDC`);
                console.log(`\t|        Market: ${ethers.formatUnits(finalMarketCollateral, 6)} USDC`);
            }

            expect(redeemedShares).be.equal(winningShares - initialShares);
            expect(finalDestinationCollateral).be.equal(initialDestinationCollateral + withdrawableCollateral);
            expect(finalMarketCollateral).be.equal(0);
        })
    })
})
