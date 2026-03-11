import {expect} from "chai";
import {ethers} from "hardhat";
import {PrecogToken, PrecogMasterV8, PrecogMarketV8, FakeDai, FakeUSDC} from "../typechain-types";
import {HardhatEthersSigner} from "@nomicfoundation/hardhat-ethers/signers";
import {LSLMSR} from "../libs/markets";
import {PERMIT2_ADDRESS, PERMIT2_BYTECODE} from "../libs/permit2"
import {fromInt128toNumber, fromNumberToInt128, getCurrentBlockTimestamp} from "../libs/helpers"

describe("Precog Master V8", function () {
    const detailsEnabled: boolean = process.env.TEST_DETAILS === 'true';
    let pre: PrecogToken;
    let market: PrecogMarketV8;
    let master: PrecogMasterV8;
    let admin: HardhatEthersSigner;
    let user: HardhatEthersSigner;
    let caller: HardhatEthersSigner;
    let marketOperator: HardhatEthersSigner;
    let dai: FakeDai;
    let usdc: FakeUSDC;
    let localMarket: LSLMSR;

    beforeEach(async function () {
        [admin, user, caller, marketOperator] = await ethers.getSigners();
    })

    describe("Deployment & setup", function () {
        it("Deploy PrecogMasterV8 contract", async function () {
            const PrecogMaster = await ethers.getContractFactory("PrecogMasterV8");
            const initialAdmin = admin.address;
            master = await PrecogMaster.deploy(initialAdmin);

            // Verify master initialization
            const ADMIN_ROLE = await master.ADMIN_ROLE();
            const isAdmin = await master.hasRole(ADMIN_ROLE, initialAdmin);
            expect(isAdmin).to.be.true;
        })

        it("Deploy and Mint a test Token for users", async function () {
            const PRE = await ethers.getContractFactory("PrecogToken");
            const precogOwner = admin.address;
            pre = await PRE.deploy(precogOwner);

            const initialSupply = ethers.parseUnits("2000", 18);
            await pre.mint(admin.address, initialSupply);
            await pre.mint(marketOperator.address, initialSupply * BigInt(3));
            await pre.mint(caller.address, ethers.parseEther("1"));
            await pre.mint(user.address, initialSupply);

            // Verify token balances
            expect(await pre.balanceOf(admin.address)).to.equal(initialSupply);
            expect(await pre.balanceOf(marketOperator.address)).to.equal(initialSupply * BigInt(3));
            expect(await pre.balanceOf(caller.address)).to.equal(ethers.parseEther("1"));
            expect(await pre.balanceOf(user.address)).to.equal(initialSupply);
        })

        it("Deploy Base PrecogMarket contract", async function () {
            const collateralAddress = await pre.getAddress();
            const PrecogMarket = await ethers.getContractFactory("PrecogMarketV8");
            market = await PrecogMarket.deploy();
            await market.initialize(collateralAddress);

            // Verify market initialization
            const marketCollateral = await market.token();
            const marketOwner = await market.owner();
            expect(marketCollateral).to.equal(collateralAddress);
            expect(marketOwner).to.equal(admin.address);
        })

        it("Deploy Permit2 contract (only if needed)", async function () {
            let permit2Code = await ethers.provider.getCode(PERMIT2_ADDRESS);

            // Check if are executing on a local chain or a fork (deploy only if needed)
            if (permit2Code == '0x') {
                // Set Permit2 deployed bytecode into official deployed address
                await ethers.provider.send("hardhat_setCode", [PERMIT2_ADDRESS, PERMIT2_BYTECODE]);

                // Get code of selected address
                permit2Code = await ethers.provider.getCode(PERMIT2_ADDRESS);
            }

            // Compare against expected mainnet code
            expect(permit2Code.length).to.equal(PERMIT2_BYTECODE.length)
        })

        it("Set base market and config values on PrecogMaster", async function () {
            const marketAddress = await market.getAddress();
            const minOverround = 200;
            const minSellFeeFactor = 20;  // 5% Max Sell Fee (sellFee=1/sellFeeFactor)
            const protocolFee = 0;

            await master.setBaseMarket(marketAddress);
            await master.setMarketMinOverround(minOverround);
            await master.setMarketMinSellFeeFactor(minSellFeeFactor);
            await master.setProtocolFeeFactor(protocolFee);

            // Verify market initial configs
            const marketConfigs = await master.getMarketsConfigs();
            expect(marketConfigs[0]).to.equal(marketAddress);
            expect(marketConfigs[1]).to.equal(minOverround);
            expect(marketConfigs[2]).to.equal(minSellFeeFactor);
            expect(marketConfigs[3]).to.equal(protocolFee);
        })

        it("Add 'ADMIN' account to PrecogMaster access list", async function () {
            await master.addAdmin(admin.address);

            // Verify role on PrecogMaster
            const ADMIN_ROLE = await master.ADMIN_ROLE();
            const isAdmin = await master.hasRole(ADMIN_ROLE, admin.address);
            expect(isAdmin).to.be.true;
        })

        it("Add 'CALLER' account to PrecogMaster access list", async function () {
            await master.addCaller(caller.address);

            // Verify role on PrecogMaster
            const CALLER_ROLE = await master.CALLER_ROLE();
            const isCaller = await master.hasRole(CALLER_ROLE, caller.address);
            expect(isCaller).to.be.true;
        })

        it("Add 'MARKET_OPERATOR' account to PrecogMaster access list", async function () {
            await master.addMarketOperator(marketOperator.address);

            // Verify role on PrecogMaster
            const MARKET_OPERATOR_ROLE = await master.MARKET_OPERATOR_ROLE();
            const isMarketOperator = await master.hasRole(MARKET_OPERATOR_ROLE, marketOperator.address);
            expect(isMarketOperator).to.be.true;
        })

        it("Transfer ownership of test Token to PrecogMaster", async function () {
            const masterAddress = await master.getAddress();
            await pre.transferOwnership(masterAddress);

            // Verify ownership
            const preOwner = await pre.owner();
            expect(preOwner).to.equal(masterAddress);
        })

        it("Add test Token as ownedCollateral on PrecogMaster", async function () {
            const collateralAddress = await pre.getAddress();

            await master.addOwnedCollateral(collateralAddress);  // Test add function [should not revert]
            await master.removeOwnedCollateral(collateralAddress);  // Test remove function [should not revert]

            // Add test token as owned collateral for next tests
            await master.addOwnedCollateral(collateralAddress);

            // Verify whitelist inclusion
            const isOwnerCollateral = await master.ownedCollaterals(collateralAddress);
            expect(isOwnerCollateral).to.be.true;
        })

        it("Add valid oracle to PrecogMaster whitelist", async function () {
            const oracleAddress = admin.address;

            await master.addAllowedOracle(oracleAddress);  // Test add function [should not revert]
            await master.removeAllowedOracle(oracleAddress);  // Test remove function [should not revert]

            // Add oracle for next tests
            await master.addAllowedOracle(oracleAddress);

            // Verify whitelist inclusion
            const isOracleAllowed = await master.allowedOracles(oracleAddress);
            expect(isOracleAllowed).to.be.true;
        })

        it("Add valid receivers to PrecogMaster whitelist", async function () {
            const validReceiver = admin.address;

            await master.addAllowedReceiver(validReceiver);  // Test add function [should not revert]
            await master.removeAllowedReceiver(validReceiver);  // Test remove function [should not revert]

            // Add valid receiver for next tests
            await master.addAllowedReceiver(validReceiver);

            // Verify whitelist inclusion
            const isReceiverAllowed = await master.allowedReceivers(validReceiver);
            expect(isReceiverAllowed).to.be.true;
        })

        it("Deploy Fake DAI contract & send tokens to creator & user", async function () {
            const DAI = await ethers.getContractFactory("FakeDai");
            dai = await DAI.deploy(admin.address);
            await dai.mint(marketOperator.address, ethers.parseEther('2000'));
            await dai.mint(user.address, ethers.parseEther('100'));

            expect(await dai.balanceOf(marketOperator.address)).to.equal(ethers.parseEther('2000'));
            expect(await dai.balanceOf(user.address)).to.equal(ethers.parseEther('100'));
        })

        it("Deploy Fake USDC contract & send tokens to creator & user", async function () {
            const USDC = await ethers.getContractFactory("FakeUSDC");
            usdc = await USDC.deploy(admin.address);
            await usdc.mint(marketOperator.address, ethers.parseUnits('2000', 6));
            await usdc.mint(user.address, ethers.parseUnits('100', 6));

            expect(await usdc.balanceOf(marketOperator.address)).to.equal(ethers.parseUnits('2000', 6));
            expect(await usdc.balanceOf(user.address)).to.equal(ethers.parseUnits('100', 6));
        })

        it("Add valid collaterals to PrecogMaster whitelist", async function () {
            const preAddress = await pre.getAddress();
            const daiAddress = await dai.getAddress();
            const usdcAddress = await usdc.getAddress();

            await master.addAllowedCollateral(preAddress);  // Test add function [should not revert]
            await master.removeAllowedCollateral(preAddress);  // Test remove function [should not revert]

            // Add valid collaterals for next tests
            await master.addAllowedCollateral(preAddress);
            await master.addAllowedCollateral(daiAddress);
            await master.addAllowedCollateral(usdcAddress);

            // Verify whitelist inclusion
            const isPreAllowed = await master.allowedCollaterals(preAddress);
            const isDaiAllowed = await master.allowedCollaterals(daiAddress);
            const isUsdcAllowed = await master.allowedCollaterals(usdcAddress);
            expect(isPreAllowed).to.be.true;
            expect(isDaiAllowed).to.be.true;
            expect(isUsdcAllowed).to.be.true;
        })
    })

    describe("Access functions", function () {
        it("| Random accounts can't use 'onlyAdmin' functions", async function () {
            if (detailsEnabled) {
                console.log("");
                console.log(`\t| User: ${user.address}`);
            }
            const call = master.connect(user).addAdmin(user);
            await expect(call).to.be.revertedWith("Only Admin");
        })

        it("| Random accounts can't use 'onlyCaller' functions", async function () {
            if (detailsEnabled) {
                console.log("");
                console.log(`\t| User: ${user.address}`);
            }
            const call = master.connect(user).withdrawMarketCollateralTo(1, admin.address);
            await expect(call).to.be.revertedWith("Only Caller");
        })

        it("| Random accounts can't use 'onlyMarketOperator' functions", async function () {
            if (detailsEnabled) {
                console.log("");
                console.log(`\t| User: ${user.address}`);
            }
            const emptyAddress: string = "0x0000000000000000000000000000000000000000";
            const marketData = {
                question: "", resolutionCriteria: "", imageURL: "", category: "", outcomes: "",
                creator: emptyAddress, operator: emptyAddress, market: emptyAddress,
                startTimestamp: 0, endTimestamp: 0, collateral: emptyAddress,
            };
            const marketConfig = {
                oracle: emptyAddress, totalOutcomes: 0, liquidity: 0, overround: 0,
                sellFeeFactor: 100_000, collateralFunding: 0, collateralFunder: emptyAddress
            };
            const call: Promise<any> = master.connect(user).createMarket(marketData, marketConfig);
            await expect(call).to.be.revertedWith("Only Market Operator");
        })

        it("| Caller accounts can't use 'onlyAdmin' functions", async function () {
            if (detailsEnabled) {
                console.log("");
                console.log(`\t| User: ${user.address}`);
            }
            const call = master.connect(caller).addAdmin(user);
            await expect(call).to.be.revertedWith("Only Admin");
        })

        it("| Caller accounts can't use 'onlyMarketOperator' functions", async function () {
            if (detailsEnabled) {
                console.log("");
                console.log(`\t| Caller: ${caller.address}`);
            }
            const emptyAddress: string = "0x0000000000000000000000000000000000000000";
            const marketData = {
                question: "", resolutionCriteria: "", imageURL: "", category: "", outcomes: "",
                creator: emptyAddress, operator: emptyAddress, market: emptyAddress,
                startTimestamp: 0, endTimestamp: 0, collateral: emptyAddress,
            };
            const marketConfig = {
                oracle: emptyAddress, totalOutcomes: 0, liquidity: 0, overround: 0,
                sellFeeFactor: 100_000, collateralFunding: 0, collateralFunder: emptyAddress
            };

            const call: Promise<any> = master.connect(user).createMarket(marketData, marketConfig);
            await expect(call).to.be.revertedWith("Only Market Operator");
        })

        it("| Caller accounts can't withdraw collateral to not allowed receiver", async function () {
            if (detailsEnabled) {
                console.log("");
                console.log(`\t| Caller: ${caller.address}`);
            }
            const marketId = 0;
            const invalidReceiver = user.address;
            const call: Promise<any> = master.connect(caller).withdrawMarketCollateralTo(marketId, invalidReceiver);
            await expect(call).to.be.revertedWith("Not allowed receiver");
        })

        it("| Market operator accounts can't use 'onlyAdmin' functions", async function () {
            if (detailsEnabled) {
                console.log("");
                console.log(`\t| User: ${user.address}`);
                console.log(`\t| marketOperator: ${marketOperator.address}`);
            }
            const call = master.connect(marketOperator).addAdmin(user);
            await expect(call).to.be.revertedWith("Only Admin");
        })

        it("| Market operator accounts can't use 'onlyCaller' functions", async function () {
            if (detailsEnabled) {
                console.log("");
                console.log(`\t| MarketOperator: ${marketOperator.address}`);
            }
            const call = master.connect(user).withdrawMarketCollateralTo(1, admin.address);
            await expect(call).to.be.revertedWith("Only Caller");
        })

        it("| Admin accounts can't use 'onlyCaller' functions", async function () {
            if (detailsEnabled) {
                console.log("");
                console.log(`\t| Admin: ${admin.address}`);
            }
            const call = master.connect(admin).withdrawMarketCollateralTo(1, admin.address);
            await expect(call).to.be.revertedWith("Only Caller");
        })

        it("| Admin accounts can't use 'onlyMarketOperator' functions", async function () {
            if (detailsEnabled) {
                console.log("");
                console.log(`\t| Admin: ${admin.address}`);
            }
            const emptyAddress: string = "0x0000000000000000000000000000000000000000";
            const marketData = {
                question: "", resolutionCriteria: "", imageURL: "", category: "", outcomes: "",
                creator: emptyAddress, operator: emptyAddress, market: emptyAddress,
                startTimestamp: 0, endTimestamp: 0, collateral: emptyAddress,
            };
            const marketConfig = {
                oracle: emptyAddress, totalOutcomes: 0, liquidity: 0, overround: 0,
                sellFeeFactor: 100_000, collateralFunding: 0, collateralFunder: emptyAddress
            };

            const call: Promise<any> = master.connect(admin).createMarket(marketData, marketConfig);
            await expect(call).to.be.revertedWith("Only Market Operator");
        })
    })

    describe("Owned Market functions (with test token)", function () {
        it("| Market Operator accounts can create a new prediction market", async function () {
            if (detailsEnabled) console.log("");
            const question: string = 'Initial market';
            const resolutionCriteria: string = 'Initial resolution criteria';
            const imageURL: string = 'https://ipfs.io/ipfs/test123';
            const category: string = 'CRYPTO';
            const outcomes: string[] = ['YES', 'NO'];
            const startTimestamp: number = await getCurrentBlockTimestamp();
            const endTimestamp: number = startTimestamp + 300;  // 5 min market
            const funding = ethers.parseEther('1000');
            const overround: number = 200;  // 200 bps (aka market maker margin)
            const creator: string = admin.address;
            const collateralToken: string = await pre.getAddress();
            const collateralFunder: string = marketOperator.address;
            const marketOracle: string = admin.address;
            const marketSellFeeFactor: number = 100_000; // 0.001% (sellFee=1/sellFeeFactor)

            // Approve PrecogMaster to use MarketOperator PRE
            await pre.connect(marketOperator).approve(
                await master.getAddress(),
                await pre.balanceOf(marketOperator.address)
            );

            // Send custom market creator tx
            const emptyAddress: string = "0x0000000000000000000000000000000000000000";
            const marketData = {
                question: question, resolutionCriteria: resolutionCriteria, imageURL: imageURL, category: category,
                outcomes: outcomes.join(','), creator: creator, operator: emptyAddress, market: emptyAddress,
                startTimestamp: startTimestamp, endTimestamp: endTimestamp, collateral: collateralToken,
            };
            const marketConfig = {
                oracle: marketOracle, totalOutcomes: outcomes.length, liquidity: funding, overround: overround,
                sellFeeFactor: marketSellFeeFactor, collateralFunding: funding, collateralFunder: collateralFunder
            };
            await master.connect(marketOperator).createMarket(marketData, marketConfig);

            const createdMarkets: bigint = await master.createdMarkets();
            const createdMarketId = Number(createdMarkets) - 1;
            const createdMarket: any[] = await master.markets(createdMarketId);
            const marketQuestion = createdMarket[0];
            const marketResolutionCriteria = createdMarket[1];
            const marketImageURL = createdMarket[2];
            const marketCategory = createdMarket[3];
            const marketOutcomes = createdMarket[4];
            const marketCreatorAddress = createdMarket[5];
            const marketOperatorAddress = createdMarket[6];
            const marketAddress = createdMarket[7];
            const marketStart = createdMarket[8];
            const marketEnd = createdMarket[9];
            const marketCollateral = createdMarket[10];

            const createdMarketCollateralInfo = await master.marketCollateralInfo(createdMarketId);
            const marketCollateralAddress = createdMarketCollateralInfo[0];
            const marketCollateralName = createdMarketCollateralInfo[1];
            const marketCollateralSymbol = createdMarketCollateralInfo[2];
            const marketCollateralDecimals = createdMarketCollateralInfo[3];

            const createdMarketSharesInfo: any[] = await master.marketSharesInfo(createdMarketId);
            const marketTotalShares = fromInt128toNumber(createdMarketSharesInfo[0]);
            const marketTotalRedeemedShares = fromInt128toNumber(createdMarketSharesInfo[2]);
            const marketCost = fromInt128toNumber(createdMarketSharesInfo[3]);
            const marketBuys = fromInt128toNumber(createdMarketSharesInfo[4]);
            const marketSells = fromInt128toNumber(createdMarketSharesInfo[5]);

            if (detailsEnabled) {
                console.log(`\t| Market Address: ${marketAddress}`);
                console.log(`\t| Market -> name: ${marketQuestion}, creator: ${marketCreatorAddress}`);
                console.log(`\t| Start: ${marketStart}, End: ${marketEnd}`);
                console.log(`\t| Collateral Address: ${marketCollateralAddress}`);
                console.log(`\t| Collateral -> name: ${marketCollateralName}, decimals: ${marketCollateralDecimals}`);
            }

            expect(createdMarkets).to.equal(1);
            expect(marketQuestion).to.equal(question);
            expect(marketResolutionCriteria).to.equal(resolutionCriteria);
            expect(imageURL).to.equal(marketImageURL);
            expect(marketCategory).to.equal(category);
            expect(marketOutcomes).to.equal(outcomes.toString());
            expect(marketCreatorAddress).to.equal(creator);
            expect(marketOperatorAddress).to.equal(marketOperator.address);
            expect(marketStart).to.equal(startTimestamp);
            expect(marketEnd).to.equal(endTimestamp);
            expect(marketCollateral).to.equal(marketCollateralAddress);
            expect(marketCollateralAddress).to.equal(await pre.getAddress());
            expect(marketCollateralSymbol).to.equal(await pre.symbol());
            expect(marketAddress).to.not.equal(emptyAddress);
            expect(marketTotalShares).to.equal(outcomes.length * Number(ethers.formatEther(funding)));
            expect(marketTotalRedeemedShares).to.equal(0);
            expect(marketCost).to.equal(Number(ethers.formatEther(funding)) * (1 + overround/10_000));
            expect(marketBuys).to.equal(0);
            expect(marketSells).to.equal(0);
        })

        it("| Admin accounts can update a created market (with oracle pre authorization)", async function () {
            if (detailsEnabled) console.log("");
            const marketId: number = 0;
            const createdMarketInfo: any[] = await master.markets(marketId);
            const oldCreator: string = createdMarketInfo[6];

            const createdMarketResultInfo: any[] = await master.marketResultInfo(marketId);
            const oldOracle: string = createdMarketResultInfo[2];

            const createdMarketSetupInfo: any[] = await master.marketSetupInfo(marketId);
            const oldSellFeeFactor: number = createdMarketSetupInfo[3];

            const nowTimestamp = await getCurrentBlockTimestamp();
            const question: string = 'Market 1';
            const resolutionCriteria: string = 'Resolution criteria 1';
            const imageURL: string = 'https://test.com/image.png';
            const category: string = 'CRYPTO';
            const outcomes: string = 'YES,NO';
            const startTimestamp: number = nowTimestamp;
            const endTimestamp: number = nowTimestamp + 300;
            const emptyCreator: string = "0x0000000000000000000000000000000000000000";  // Field not updated
            const emptyOracle: string = "0x0000000000000000000000000000000000000000";  // Field not updated
            const emptySellFeeFactor: number = -1;  // Field not updated

            // Enable market dates update (with oracle account)
            const createdMarket: PrecogMarketV8 = await ethers.getContractAt('PrecogMarketV8', createdMarketInfo[7]);
            await createdMarket.connect(admin).enableDatesUpdate(marketId);

            // Try to update market info
            await master.connect(admin).updateMarket(
                marketId, question, resolutionCriteria, imageURL, category, outcomes,
                emptyCreator, startTimestamp, endTimestamp, emptyOracle, emptySellFeeFactor
            );

            const marketData: any[] = await master.markets(marketId);
            const marketQuestion = marketData[0];
            const marketResolutionCriteria = marketData[1];
            const marketImageURL = marketData[2];
            const marketCreator = marketData[6];
            const marketAddress = marketData[7];

            const marketResultInfo: any[] = await master.marketResultInfo(marketId);
            const marketOracle: string = marketResultInfo[2];

            const marketSetupInfo: any[] = await master.marketSetupInfo(marketId);
            const marketSellFeeFactor: bigint = marketSetupInfo[3];

            if (detailsEnabled) {
                console.log(`\t| Market: ${marketAddress}`);
                console.log(`\t|   question: ${marketQuestion}, creator: ${marketCreator}`);
                console.log(`\t|   oracle: ${marketOracle}, sellFeeFactor: ${fromInt128toNumber(marketSellFeeFactor)}`);
            }

            expect(marketQuestion).to.equal(question);
            expect(marketResolutionCriteria).to.equal(resolutionCriteria);
            expect(marketImageURL).to.equal(imageURL);
            expect(marketCreator).to.equal(oldCreator);
            expect(marketOracle).to.equal(oldOracle);
            expect(marketSellFeeFactor).to.equal(oldSellFeeFactor);
        })

        it("| Accounts can BUY 10 YES shares [outcome=1] on a market", async function () {
            if (detailsEnabled) console.log("");
            const shares: number = 10
            const marketId: number = 0;
            const outcome: number = 1;
            const sharesAmount: bigint = fromNumberToInt128(shares);

            // Get the current market price and calculate max token in
            const buyPriceInt128: bigint = await master.marketBuyPrice(marketId, outcome, sharesAmount);
            const buyCost: number = fromInt128toNumber(buyPriceInt128);
            const maxTokenIn: number = buyCost * 1.001  // Add 0.1% of slippage
            const maxAmountIn: bigint = ethers.parseEther(maxTokenIn.toString());

            // Calculate expected costs (to be compared after)
            const buyCostPerShare: number = buyCost / shares;
            const balanceBefore: bigint = await pre.balanceOf(user.address);
            if (detailsEnabled) {
                console.log(`\t| User Balance: ${ethers.formatEther(balanceBefore)} PRE`);
                console.log(`\t| Buying: outcome=${outcome}, amount=${shares}, maxIn=${maxTokenIn} PRE`);
                console.log(`\t| Expected -> buyPrice: ${buyCostPerShare}, buyCost: ${buyCost} PRE`);
            }

            // Send BUY call as a random user
            await master.connect(user).ownedMarketBuy(marketId, outcome, sharesAmount, maxAmountIn);

            const marketSharesInfo: any[] = await master.marketSharesInfo(marketId);
            const totalShares: number = fromInt128toNumber(marketSharesInfo[0]);
            const totalBuys: number = marketSharesInfo[4];
            const totalSells: number = marketSharesInfo[5];
            const balanceAfter: bigint = await pre.balanceOf(user.address);
            const preTokenCost: bigint = balanceBefore - balanceAfter;
            const costPerShare: string = ethers.formatEther(preTokenCost / BigInt(shares));
            const tokenCost: string = ethers.formatEther(preTokenCost);
            if (detailsEnabled) {
                console.log(`\t|   Traded -> buyPrice: ${costPerShare}, buyCost: ${tokenCost} PRE`);
                console.log(`\t| Market -> TotalShares: ${totalShares}, Sells: ${totalSells}, Buys: ${totalBuys}`);
            }

            expect(totalBuys).be.equal(1);
            expect(totalShares).be.equal(2010);
        })

        it("| Accounts can BUY 10 NO shares [outcome=2] on a market", async function () {
            if (detailsEnabled) console.log("");
            const shares: number = 10
            const marketId: number = 0;
            const outcome: number = 2;
            const sharesAmount: bigint = fromNumberToInt128(shares);

            // Get the current market price and calculate max token in
            const buyPriceInt128: bigint = await master.marketBuyPrice(marketId, outcome, sharesAmount);
            const buyCost: number = fromInt128toNumber(buyPriceInt128);
            const maxTokenIn: number = buyCost * 1.001  // Add 0.1% of slippage
            const maxAmountIn: bigint = ethers.parseEther(maxTokenIn.toString());

            // Calculate expected costs (to be compared after)
            const buyCostPerShare: number = buyCost / shares;
            const balanceBefore: bigint = await pre.balanceOf(user.address);
            if (detailsEnabled) {
                console.log(`\t| Buying: outcome=${outcome}, amount=${shares}, maxIn=${maxTokenIn} PRE`);
                console.log(`\t| Expected -> buyPrice: ${buyCostPerShare}, buyCost: ${buyCost} PRE`);
            }

            // Send BUY call as a random user
            await master.connect(user).ownedMarketBuy(marketId, outcome, sharesAmount, maxAmountIn);

            const marketSharesInfo: any[] = await master.marketSharesInfo(marketId);
            const totalShares: number = fromInt128toNumber(marketSharesInfo[0]);
            const totalBuys: number = marketSharesInfo[4];
            const totalSells: number = marketSharesInfo[5];
            const balanceAfter: bigint = await pre.balanceOf(user.address);
            const preTokenCost: bigint = balanceBefore - balanceAfter;
            const costPerShare = ethers.formatEther(preTokenCost / BigInt(shares));
            const tokenCost: string = ethers.formatEther(preTokenCost);
            if (detailsEnabled) {
                console.log(`\t|   Traded -> buyPrice: ${costPerShare}, buyCost: ${tokenCost} PRE`);
                console.log(`\t| Market -> TotalShares: ${totalShares}, Sells: ${totalSells}, Buys: ${totalBuys}`);
            }

            expect(totalBuys).be.equal(2);
            expect(totalShares).be.equal(2020);
        })

        it("| Accounts can SELL 5 YES shares [outcome=1] on a market", async function () {
            if (detailsEnabled) console.log("");
            const shares: number = 5
            const marketId: number = 0;
            const outcome: number = 1;
            const sharesAmount: bigint = fromNumberToInt128(shares);

            // Get the current market price and calculate min token return
            const sellPriceInt128: bigint = await master.marketSellPrice(marketId, outcome, sharesAmount);
            const sellReturn: number = fromInt128toNumber(sellPriceInt128);
            const minTokenOut: number = sellReturn * 0.999  // Add 0.1% of slippage
            const minAmountOut: bigint = ethers.parseEther(minTokenOut.toString());

            // Calculate expected returns (to be compared after)
            const returnPerShare: number = sellReturn / shares;
            const balanceBefore: bigint = await pre.balanceOf(user.address);
            if (detailsEnabled) {
                console.log(`\t| Selling: outcome=${outcome}, amount=${shares}, minOut=${minTokenOut} PRE`);
                console.log(`\t| Expected -> sellPrice: ${returnPerShare}, sellReturn: ${sellReturn} PRE`);
            }

            // Send SELL call as a random user
            await master.connect(user).marketSell(marketId, outcome, sharesAmount, minAmountOut);

            const marketSharesInfo: any[] = await master.marketSharesInfo(marketId);
            const totalShares: number = fromInt128toNumber(marketSharesInfo[0]);
            const totalBuys: number = marketSharesInfo[4];
            const totalSells: number = marketSharesInfo[5];
            const balanceAfter: bigint = await pre.balanceOf(user.address);
            const preTokenReturn: bigint = balanceAfter - balanceBefore;
            const costPerShare: string = ethers.formatEther(preTokenReturn / BigInt(shares));
            const tokenReturn: string = ethers.formatEther(preTokenReturn);
            if (detailsEnabled) {
                console.log(`\t|   Traded -> sellPrice: ${costPerShare}, sellReturn: ${tokenReturn} PRE`);
                console.log(`\t| Market -> TotalShares: ${totalShares}, Sells: ${totalSells}, Buys: ${totalBuys}`);
            }

            expect(totalSells).be.equal(1);
            expect(totalShares).be.equal(2015);
        })

        it("| Accounts can SELL 10 NO shares [outcome=2] on a market", async function () {
            if (detailsEnabled) console.log("");
            const shares: number = 10
            const marketId: number = 0;
            const outcome: number = 2;
            const sharesAmount: bigint = fromNumberToInt128(shares);

            // Get the current market price/token cost
            const sellPriceInt128: bigint = await master.marketSellPrice(marketId, outcome, sharesAmount);
            const sellReturn: number = fromInt128toNumber(sellPriceInt128);
            const minTokenOut: number = sellReturn * 0.999  // Add 0.1% of slippage
            const minAmountOut: bigint = ethers.parseEther(minTokenOut.toString());

            const buyCostPerShare: number = sellReturn / shares;
            const balanceBefore: bigint = await pre.balanceOf(user.address);
            if (detailsEnabled) {
                console.log(`\t| Selling: outcome=${outcome}, amount=${shares}, minOut=${minTokenOut} PRE`);
                console.log(`\t| Expected -> sellPrice: ${buyCostPerShare}, sellReturn: ${sellReturn} PRE`);
            }

            await master.connect(user).marketSell(marketId, outcome, sharesAmount, minAmountOut);

            const marketSharesInfo: any[] = await master.marketSharesInfo(marketId);
            const totalShares: number = fromInt128toNumber(marketSharesInfo[0]);
            const totalBuys: number = marketSharesInfo[4];
            const totalSells: number = marketSharesInfo[5];
            const balanceAfter: bigint = await pre.balanceOf(user.address);
            const preTokenReturn: bigint = balanceAfter - balanceBefore;
            const costPerShare: string = ethers.formatEther(preTokenReturn / BigInt(shares));
            const tokenReturn: string = ethers.formatEther(preTokenReturn);
            if (detailsEnabled) {
                console.log(`\t|   Traded -> sellPrice: ${costPerShare}, sellReturn: ${tokenReturn} PRE`);
                console.log(`\t| Market -> TotalShares: ${totalShares}, Sells: ${totalSells}, Buys: ${totalBuys}`);
            }

            expect(totalSells).be.equal(2);
            expect(totalShares).be.equal(2005);
        })

        it("| Caller accounts can BUY YES shares [outcome=1] on a market", async function () {
            if (detailsEnabled) console.log("");
            const shares: number = 1
            const marketId: number = 0;
            const outcome: number = 1;
            const sharesAmount: bigint = fromNumberToInt128(shares);

            // Get the current market price/token cost
            const buyPriceInt128: bigint = await master.marketBuyPrice(marketId, outcome, sharesAmount);
            const buyCost: number = fromInt128toNumber(buyPriceInt128);
            const maxTokenIn: number = buyCost * 1.001  // Add 0.1% of slippage
            const maxAmountIn: bigint = ethers.parseEther(maxTokenIn.toString());

            const buyCostPerShare: number = buyCost / shares;
            const balanceBefore: bigint = await pre.balanceOf(user.address);
            if (detailsEnabled) {
                console.log(`\t| Buying: outcome=${outcome}, amount=${shares}, maxIn=${maxTokenIn} PRE`);
                console.log(`\t| Expected -> buyPrice: ${buyCostPerShare}, buyCost: ${buyCost} PRE`);
            }

            await master.connect(caller).ownedMarketBuy(marketId, outcome, sharesAmount, maxAmountIn);

            const marketSharesInfo: any[] = await master.marketSharesInfo(marketId);
            const totalShares: number = fromInt128toNumber(marketSharesInfo[0]);
            const totalBuys: number = marketSharesInfo[4];
            const totalSells: number = marketSharesInfo[5];
            const balanceAfter: bigint = await pre.balanceOf(caller.address);
            const preTokenCost: bigint = balanceBefore - balanceAfter;
            const costPerShare = ethers.formatEther(preTokenCost / BigInt(shares));
            const tokenCost: string = ethers.formatEther(preTokenCost);
            if (detailsEnabled) {
                console.log(`\t|   Traded -> buyPrice: ${costPerShare}, buyCost: ${tokenCost} PRE`);
                console.log(`\t| Market -> TotalShares: ${totalShares}, Sells: ${totalSells}, Buys: ${totalBuys}`);
            }

            expect(totalBuys).be.equal(3);
        })

        it("| Accounts can't redeem shares before results are reported", async function () {
            if (detailsEnabled) console.log("");
            const marketId: number = 0;
            const tx: Promise<any> = master.connect(user).marketRedeemShares(marketId);

            await expect(tx).to.be.revertedWith("Market not closed");
        })

        it("| Random accounts can't report results on a market", async function () {
            if (detailsEnabled) console.log("");
            const marketId: number = 0;
            const resultOutcome: number = 1;
            const marketInfo: any[] = await master.markets(marketId);
            const createdMarket: PrecogMarketV8 = await ethers.getContractAt('PrecogMarketV8', marketInfo[7]);
            const tx: Promise<any> = createdMarket.connect(user).reportResult(marketId, resultOutcome);

            await expect(tx).to.be.revertedWith("Only oracle");
        })

        it("| Oracle account can report result YES[outcome=1] on a market", async function () {
            if (detailsEnabled) console.log("");
            const marketId: number = 0;
            const resultOutcome: number = 1;

            const marketInfo: any[] = await master.markets(marketId);
            const marketAddress: string = marketInfo[7];
            const startTimestamp: bigint = marketInfo[8];
            const endTimestamp: bigint = marketInfo[9];

            const createdMarket: PrecogMarketV8 = await ethers.getContractAt('PrecogMarketV8', marketAddress);
            const oracle: string = await createdMarket.oracle();

            const initialMarketResultInfo: any[] = await master.marketResultInfo(marketId);
            const initialResult: bigint = initialMarketResultInfo[0];
            const initialCloseTimestamp: bigint = initialMarketResultInfo[1];
            const initialReporter: string = initialMarketResultInfo[2];

            if (detailsEnabled) {
                console.log(`\t| MarketId: ${marketId}`);
                console.log(`\t| Created Market: ${await createdMarket.getAddress()}`);
                console.log(`\t| Oracle: ${oracle}`);
                console.log(`\t| StartTimestamp: ${startTimestamp}, EndTimestamp=${endTimestamp}`);
                console.log(`\t| Initial -> CloseTimestamp: ${initialCloseTimestamp}, Result=${initialResult}`);
            }

            // Move local chain next block timestamp to be higher than endTimestamp of the market
            await ethers.provider.send("evm_setNextBlockTimestamp", [Number(endTimestamp) + 1]);

            // Try to report the result from a random user (this subtest could be independent)
            const reportTx = createdMarket.connect(user).reportResult(marketId, resultOutcome);
            expect(reportTx).to.be.revertedWith("Only oracle");

            // Report result with market register oracle account
            await createdMarket.connect(admin).reportResult(marketId, resultOutcome);

            // Get final result information
            const finalMarketResultInfo: any[] = await master.marketResultInfo(marketId);
            const finalResult: bigint = finalMarketResultInfo[0];
            const finalCloseTimestamp: bigint = finalMarketResultInfo[1];
            const finalReporter: string = finalMarketResultInfo[2];

            if (detailsEnabled) {
                console.log(`\t|   Final -> CloseTimestamp: ${finalCloseTimestamp}, Result=${finalResult}`);
                console.log(`\t| Reporter: ${finalReporter}`);
            }

            expect(initialResult).be.equal(0);
            expect(initialCloseTimestamp).be.equal(0);
            expect(initialReporter).be.equal(oracle);
            expect(finalResult).be.equal(resultOutcome);
            expect(finalCloseTimestamp).be.greaterThan(endTimestamp);
            expect(finalReporter).be.equal(oracle);
        })

        it("| Accounts can redeem shares after results are reported", async function () {
            if (detailsEnabled) console.log("");
            const marketId: number = 0;
            const balanceBefore: bigint = await pre.balanceOf(user.address);
            const userAccountInfoBefore: any[] = await master.marketAccountInfo(marketId, user.address);
            const sharesToRedeem = userAccountInfoBefore[5][1];  // balance of YES[outcome=1] shares
            if (detailsEnabled) {
                console.log(`\t| MarketId: ${marketId}, Account: ${user.address}`);
                console.log(`\t| SharesToRedeem: ${ethers.formatEther(sharesToRedeem)} YES [outcome=1]`);
            }

            await master.connect(user).marketRedeemShares(marketId);

            const accountAccountInfoAfter: any[] = await master.marketAccountInfo(marketId, user.address);
            const redeemedShares: number = accountAccountInfoAfter[4];
            const balanceAfter: bigint = await pre.balanceOf(user.address);
            const balanceRedeemed: bigint = balanceAfter - balanceBefore;
            if (detailsEnabled) {
                console.log(`\t| BalanceRedeemed: ${ethers.formatEther(balanceRedeemed)} PRE`);
                console.log(`\t| RedeemedShares: ${ethers.formatEther(redeemedShares)} shares`);
            }

            expect(sharesToRedeem).be.equal(balanceRedeemed);
            expect(redeemedShares).be.equal(sharesToRedeem);
        })

        it("| Oracle account can redeemShares for a list of accounts", async function () {
            if (detailsEnabled) console.log("");
            const marketId: number = 0;
            const marketInfo: any[] = await master.markets(marketId);
            const createdMarket: PrecogMarketV8 = await ethers.getContractAt('PrecogMarketV8', marketInfo[7]);
            const oracle: string = await createdMarket.oracle();
            const userAccountInfoBefore: any[] = await master.marketAccountInfo(marketId, caller.address);
            const sharesToRedeem = userAccountInfoBefore[5][1];  // balance of YES[outcome=1] shares

            if (detailsEnabled) {
                console.log(`\t| MarketId: ${marketId}, Oracle: ${oracle}`);
                console.log(`\t| Caller SharesToRedeem: ${ethers.formatEther(sharesToRedeem)} (YES, outcome=1)`);
            }

            // Note: do not matter if the 'user' already redeemed. This should work with NO revert
            const accounts: string[] = [user.address, caller.address];
            await createdMarket.connect(admin).redeemBatch(accounts);

            // Get shares info about `user` and `caller`
            const userAccountInfoAfter: any[] = await master.marketAccountInfo(marketId, user.address);
            const userHasRedeemed: boolean = Boolean(userAccountInfoAfter[4] > 0);
            const callerAccountInfoAfter: any[] = await master.marketAccountInfo(marketId, caller.address);
            const callerHasRedeemed: boolean = Boolean(callerAccountInfoAfter[4] > 0);
            const callerRedeemedShares = callerAccountInfoAfter[4]
            if (detailsEnabled) {
                console.log(`\t| userHasRedeemed: ${userHasRedeemed}`);
                console.log(`\t| callerHasRedeemed: ${callerHasRedeemed}`);
                console.log(`\t| Caller Redeemed Shares: ${ethers.formatEther(callerRedeemedShares)}`);
            }

            expect(userHasRedeemed).to.be.true;
            expect(callerHasRedeemed).to.be.true;
            expect(callerRedeemedShares).to.equal(sharesToRedeem);
        })
    })

    describe("Custom Token Market functions (with DAI)", function () {
        it("| Market Operator accounts can create a custom market with DAI", async function () {
            // Approve PrecogMaster to use MarketOperator DAIs
            await dai.connect(marketOperator).approve(
                await master.getAddress(),
                await dai.balanceOf(marketOperator.address)
            );

            if (detailsEnabled) console.log("");
            const question: string = 'Initial custom DAI market';
            const resolutionCriteria: string = 'Initial custom description';
            const imageURL: string = 'https://ipfs.io/ipfs/test123';
            const category: string = 'CRYPTO';
            const outcomes: string[] = ['YES', 'NO', 'UNFINISHED'];
            const startTimestamp: number = await getCurrentBlockTimestamp();
            const endTimestamp: number = startTimestamp + 300;  // 5 min market
            const funding: bigint = ethers.parseEther('1000');
            const overround: number = 300;  // 300 bps or 3% (aka market margin and max loss)
            const creator: string = admin.address;
            const collateralToken: string = await dai.getAddress();
            const collateralFunder: string = marketOperator.address;
            const marketOracle: string = admin.address;
            const marketSellFeeFactor: number = 20; // 0.05 -> 5% (sellFee=1/sellFeeFactor)

            // Initialize local market to verify solidity calculations
            const alpha = (overround / 10000) / (outcomes.length * Math.log(outcomes.length));
            const sellFee = 1 / marketSellFeeFactor;
            localMarket = new LSLMSR(outcomes, alpha, 1000, sellFee);

            const emptyAddress: string = "0x0000000000000000000000000000000000000000";
            const marketData = {
                question: question, resolutionCriteria: resolutionCriteria, imageURL: imageURL, category: category,
                outcomes: outcomes.join(','), creator: creator, operator: emptyAddress, market: emptyAddress,
                startTimestamp: startTimestamp, endTimestamp: endTimestamp, collateral: collateralToken,
            };
            const marketConfig = {
                oracle: marketOracle, totalOutcomes: outcomes.length, liquidity: funding, overround: overround,
                sellFeeFactor: marketSellFeeFactor, collateralFunding: funding, collateralFunder: collateralFunder
            };
            await master.connect(marketOperator).createMarket(marketData, marketConfig);

            const createdMarkets: bigint = await master.createdMarkets();
            const createdMarketId = Number(createdMarkets) - 1;
            const createdMarket: any[] = await master.markets(createdMarketId);
            const marketQuestion = createdMarket[0];
            const marketCriteria = createdMarket[1];
            const marketImageURL = createdMarket[2];
            const marketCategory = createdMarket[3];
            const marketOutcomes = createdMarket[4];
            const marketCreatorAddress = createdMarket[5];
            const marketOperatorAddress = createdMarket[6];
            const marketAddress = createdMarket[7];
            const marketStart = createdMarket[8];
            const marketEnd = createdMarket[9];
            const marketCollateralTokenAddress = createdMarket[10];

            const createdMarketCollateralInfo = await master.marketCollateralInfo(createdMarketId);
            const marketCollateralAddress = createdMarketCollateralInfo[0];
            const marketCollateralName = createdMarketCollateralInfo[1];
            const marketCollateralSymbol = createdMarketCollateralInfo[2];
            const marketCollateralDecimals = createdMarketCollateralInfo[3];

            // Get Buy and Sell prices indexed by outcome (outcome index zero is not valid)
            const createdMarketPrices = await master.marketPrices(createdMarketId);

            if (detailsEnabled) {
                console.log(`\t| Market Address: ${marketAddress}`);
                console.log(`\t| Market -> question: ${marketQuestion}, creator: ${marketCreatorAddress}`);
                console.log(`\t| Start: ${marketStart}, End: ${marketEnd}`);
                console.log(`\t| Collateral Address: ${marketCollateralAddress}`);
                console.log(`\t| Collateral -> name: ${marketCollateralName}, decimals: ${marketCollateralDecimals}`);
            }

            expect(createdMarkets).to.equal(2);
            expect(marketQuestion).to.equal(question);
            expect(marketCriteria).to.equal(resolutionCriteria);
            expect(marketImageURL).to.equal(imageURL);
            expect(marketCategory).to.equal(category);
            expect(marketOutcomes).to.equal(outcomes.join(','));
            expect(marketCreatorAddress).to.equal(creator);
            expect(marketOperatorAddress).to.equal(marketOperator.address);
            expect(marketCollateralTokenAddress).to.equal(collateralToken);
            expect(marketStart).to.equal(startTimestamp);
            expect(marketEnd).to.equal(endTimestamp);
            expect(marketCollateralAddress).to.equal(collateralToken);
            expect(marketCollateralSymbol).to.equal(await dai.symbol());

            // Verify initial prices against local calculations
            const localPrices = localMarket.prices();
            const tolerance = 0.000000001;
            const buyPrices = createdMarketPrices[0];
            for (let i = 1; i < buyPrices.length; i++) {
                const outcomePrice = Number(ethers.formatEther(buyPrices[1]));
                const localOutcomePrice = localPrices[Object.keys(localPrices)[i - 1]];
                expect(outcomePrice).to.closeTo(localOutcomePrice, tolerance);
            }
        })

        it("| Accounts can BUY shares with DAI on a custom market", async function () {
            if (detailsEnabled) console.log("");
            const shares: number = 1
            const marketId: number = 1;
            const outcome: number = 1;
            const sharesAmount: bigint = fromNumberToInt128(shares);
            const masterAddress: string = await master.getAddress();

            // Get fast buy prices
            const prices: bigint[][] = await master.marketPrices(marketId);  // prices helper
            const buyPrices = prices[0].map(value => Number(ethers.formatEther(value)));

            // Get the current market price and calculate max token in
            const buyPriceInt128: bigint = await master.marketBuyPrice(marketId, outcome, sharesAmount);
            const buyCost: number = fromInt128toNumber(buyPriceInt128);
            const maxTokenIn: number = buyCost * 1.001  // Add 0.1% of slippage
            const maxAmountIn: bigint = ethers.parseEther(maxTokenIn.toString());

            // Give allowance of DAI to PrecogMaster
            await dai.connect(user).approve(masterAddress, maxAmountIn);

            // Calculate expected costs (to be compared after)
            const buyCostPerShare: number = buyCost / shares;
            const balanceBefore: bigint = await dai.balanceOf(user.address);
            const allowanceBefore: bigint = await dai.allowance(user.address, masterAddress);
            if (detailsEnabled) {
                console.log(`\t| Buying: outcome=${outcome}, amount=${shares}, maxIn=${maxTokenIn} DAI`);
                console.log(`\t| Allowance to Master (before): ${ethers.formatEther(allowanceBefore)} DAI`);
                console.log(`\t| Expected -> buyPrice: ${buyCostPerShare}, buyCost: ${buyCost} DAI`);
            }

            // Send BUY call as a random user
            await master.connect(user).marketBuy(marketId, outcome, sharesAmount, maxAmountIn);

            // Register trade on local market
            const localOutcome = localMarket.outcomes[0];
            localMarket.buy(localOutcome, shares);

            const marketSharesInfo: any[] = await master.marketSharesInfo(marketId);
            const totalShares: number = fromInt128toNumber(marketSharesInfo[0]);
            const totalBuys: number = marketSharesInfo[4];
            const totalSells: number = marketSharesInfo[5];
            const balanceAfter: bigint = await dai.balanceOf(user.address);
            const allowanceAfter: bigint = await dai.allowance(user.address, masterAddress);
            const preTokenCost: bigint = balanceBefore - balanceAfter;
            const costPerShare: string = ethers.formatEther(preTokenCost / BigInt(shares));
            const tokenCost: string = ethers.formatEther(preTokenCost);
            if (detailsEnabled) {
                console.log(`\t|   Traded -> buyPrice: ${costPerShare}, buyCost: ${tokenCost} DAI`);
                console.log(`\t| Fast Buy Price: ${buyPrices[outcome]} DAI`);
                console.log(`\t| Allowance to Master (after): ${ethers.formatEther(allowanceAfter)} DAI`);
                console.log(`\t| Market -> TotalShares: ${totalShares}, Sells: ${totalSells}, Buys: ${totalBuys}`);
            }

            expect(Number(tokenCost)).be.lessThanOrEqual(buyCost);
            expect(totalBuys).be.equal(1);
            expect(totalShares).be.equal(3001);
            expect(allowanceAfter).be.equal(0);
        })

        it("| Accounts can SELL shares on a custom market with DAI", async function () {
            if (detailsEnabled) console.log("");
            const shares: number = 1
            const marketId: number = 1;
            const outcome: number = 1;
            const sharesAmount: bigint = fromNumberToInt128(shares);

            // Get fast sell prices
            const prices: bigint[][] = await master.marketPrices(marketId);  // prices helper
            const sellPrices = prices[1].map(value => Number(ethers.formatEther(value)));

            // Get the current market price and calculate min token return
            const sellPriceInt128: bigint = await master.marketSellPrice(marketId, outcome, sharesAmount);
            const sellReturn: number = fromInt128toNumber(sellPriceInt128);
            const minTokenOut: number = sellReturn * 0.999  // Add 0.1% of slippage
            const minAmountOut: bigint = ethers.parseEther(minTokenOut.toString());

            // Calculate expected returns (to be compared after)
            const returnPerShare: number = sellReturn / shares;
            const balanceBefore: bigint = await dai.balanceOf(user.address);
            if (detailsEnabled) {
                console.log(`\t| Selling: outcome=${outcome}, amount=${shares}, minOut=${minTokenOut} DAI`);
                console.log(`\t| Expected -> sellPrice: ${returnPerShare}, sellReturn: ${sellReturn} DAI`);
            }

            // Send SELL call as a random user
            await master.connect(user).marketSell(marketId, outcome, sharesAmount, minAmountOut);

            // Register trade on local market
            const localOutcome = localMarket.outcomes[0];
            localMarket.sell(localOutcome, shares);

            const marketSharesInfo: any[] = await master.marketSharesInfo(marketId);
            const totalShares: number = fromInt128toNumber(marketSharesInfo[0]);
            const totalBuys: number = marketSharesInfo[4];
            const totalSells: number = marketSharesInfo[5];
            const balanceAfter: bigint = await dai.balanceOf(user.address);
            const daiTokenReturn: bigint = balanceAfter - balanceBefore;
            const costPerShare: string = ethers.formatEther(daiTokenReturn / BigInt(shares));
            const tokenReturn: string = ethers.formatEther(daiTokenReturn);
            if (detailsEnabled) {
                console.log(`\t|   Traded -> sellPrice: ${costPerShare}, sellReturn: ${tokenReturn} DAI`);
                console.log(`\t| Fast Sell Price: ${sellPrices[outcome]} DAI`);
                console.log(`\t| Market -> TotalShares: ${totalShares}, Sells: ${totalSells}, Buys: ${totalBuys}`);
            }

            expect(Number(tokenReturn)).be.greaterThanOrEqual(sellReturn);
            expect(totalSells).be.equal(1);
            expect(totalShares).be.equal(3000);
        })

        it("| Verify DAI max-loss calculations on a custom market", async function () {
            // To reach theoretical max loss on the chain, we simulate the worst scenario (an obvious market).
            if (detailsEnabled) console.log("");
            const outcome: number = 1;
            const marketId: number = 1;
            const targetPrice = 1.0;

            // Calculate the number of shares to be bought to reach close to 1 (marginal share price)
            const firstOutcome = localMarket.outcomes[outcome - 1];
            const maxShares = Math.ceil(localMarket.maxSharesFromPrice(firstOutcome, targetPrice));

            // Get the current market price and calculate max token in
            const maxSharesAmount: bigint = fromNumberToInt128(maxShares);
            const buyPriceInt128: bigint = await master.marketBuyPrice(marketId, outcome, maxSharesAmount);
            const buyCost: number = fromInt128toNumber(buyPriceInt128);
            const maxTokenIn: number = buyCost * 1.001  // Add 0.1% of slippage
            const maxAmountIn: bigint = ethers.parseEther(maxTokenIn.toString());

            // Mint needed DAI to user address
            await dai.mint(user.address, maxAmountIn);

            // Give allowance of DAI to PrecogMaster
            const masterAddress: string = await master.getAddress();
            await dai.connect(user).approve(masterAddress, maxAmountIn);

            const customMarket: any[] = await master.markets(marketId);
            const marketAddress = customMarket[7];
            const marketCollateralBefore: bigint = await dai.balanceOf(marketAddress);
            const sharesInfoBefore: any[] = await master.marketSharesInfo(marketId);
            const sharesBalancesBefore: any[] = sharesInfoBefore[1].map((value: bigint) => fromInt128toNumber(value));

            if (detailsEnabled) {
                console.log(`\t| Buying: outcome=${outcome}, amount=${maxShares}, maxIn=${maxTokenIn} DAI`);
                console.log(`\t| Expected buy cost: ${buyCost} DAI`);
                console.log(`\t| Market (before max buy):`);
                console.log(`\t|   Shares Balances: ${sharesBalancesBefore}`);
                console.log(`\t|   Collateral: ${ethers.formatEther(marketCollateralBefore)} DAI`);
            }

            // Send BUY call as a random user
            await master.connect(user).marketBuy(marketId, outcome, maxSharesAmount, maxAmountIn);
            if (detailsEnabled) {
                console.log(`\t| > Max buy executed!`);
            }

            // Get market state after the trade
            const sharesInfoAfter: any[] = await master.marketSharesInfo(marketId);
            const sharesBalancesAfter: any[] = sharesInfoAfter[1].map((value: bigint) => fromInt128toNumber(value));
            const collateralAfter: bigint = await dai.balanceOf(marketAddress);
            const marketCollateralAfter: number = Number(ethers.formatEther(collateralAfter));
            const marketMaxPayout: number = sharesBalancesAfter[outcome];
            const marketMaxLoss = Math.abs(marketCollateralAfter - marketMaxPayout);

            if (detailsEnabled) {
                console.log(`\t| Market (after max buy):`);
                console.log(`\t|   Shares Balances: ${sharesBalancesAfter}`);
                console.log(`\t|   Collateral: ${marketCollateralAfter} DAI`);
                console.log(`\t|   Outcome Max Payout: ${marketMaxPayout} DAI`);
                console.log(`\t|   Max Loss: ${marketMaxLoss} DAI`);
            }

            // Register trade on local market
            localMarket.buy(firstOutcome, maxShares);

            const maxLoss = localMarket.maxLoss();
            const collectedFees = localMarket.collectedFees;
            const balances = localMarket.getBalances();
            if (detailsEnabled) {
                console.log(`\t| Theoretical local market:`);
                console.log(`\t|   Balances: ${Object.values(balances)}`);
                console.log(`\t|   Max Loss: ${maxLoss} DAI, Collected Fees: ${collectedFees}`);
                console.log(`\t|   Max Loss (with fees): ${maxLoss - collectedFees} DAI`);
            }

            // Calculate empirical delta against on chain market
            const tolerance: number = 0.0000000001;
            expect(marketMaxLoss).to.be.closeTo(maxLoss - collectedFees, tolerance);
        })

        it("| Only the register oracle can report results on the market", async function () {
            if (detailsEnabled) console.log("");
            const marketId: number = 1;
            const resultOutcome: number = 1;

            const marketInfo: any[] = await master.markets(marketId);
            const marketAddress: string = marketInfo[7];
            const startTimestamp: bigint = marketInfo[8];
            const endTimestamp: bigint = marketInfo[9];

            const createdMarket: PrecogMarketV8 = await ethers.getContractAt('PrecogMarketV8', marketAddress);
            const oracle: string = await createdMarket.oracle();

            const initialMarketResultInfo: any[] = await master.marketResultInfo(marketId);
            const initialResult: bigint = initialMarketResultInfo[0];
            const initialCloseTimestamp: bigint = initialMarketResultInfo[1];
            const initialReporter: string = initialMarketResultInfo[2];

            if (detailsEnabled) {
                console.log(`\t| MarketId: ${marketId}`);
                console.log(`\t| Created Market: ${await createdMarket.getAddress()}`);
                console.log(`\t| Oracle: ${oracle}`);
                console.log(`\t| StartTimestamp: ${startTimestamp}, EndTimestamp=${endTimestamp}`);
                console.log(`\t| Initial -> CloseTimestamp: ${initialCloseTimestamp}, Result=${initialResult}`);
            }

            // Move local chain next block timestamp to be higher than endTimestamp of the market
            await ethers.provider.send("evm_setNextBlockTimestamp", [Number(endTimestamp) + 1]);

            // Try to report the result from a random user (this subtest could be independent)
            const reportTx = createdMarket.connect(user).reportResult(marketId, resultOutcome);
            expect(reportTx).to.be.revertedWith("Only oracle");

            // Report result with market register oracle account
            await createdMarket.connect(admin).reportResult(marketId, resultOutcome);

            // Get final result information
            const finalMarketResultInfo: any[] = await master.marketResultInfo(marketId);
            const finalResult: bigint = finalMarketResultInfo[0];
            const finalCloseTimestamp: bigint = finalMarketResultInfo[1];
            const finalReporter: string = finalMarketResultInfo[2];

            if (detailsEnabled) {
                console.log(`\t|   Final -> CloseTimestamp: ${finalCloseTimestamp}, Result=${finalResult}`);
                console.log(`\t| Reporter: ${finalReporter}`);
            }

            expect(initialResult).be.equal(0);
            expect(initialCloseTimestamp).be.equal(0);
            expect(initialReporter).be.equal(oracle);
            expect(finalResult).be.equal(resultOutcome);
            expect(finalCloseTimestamp).be.greaterThan(endTimestamp);
            expect(finalReporter).be.equal(oracle);
        })

        it("| The market operator can withdraw all collateral from the market", async function () {
            if (detailsEnabled) console.log("");
            const marketId: number = 1;

            // Get all market needed info from chain
            const marketInfo: any[] = await master.markets(marketId);
            const marketAddress: string = marketInfo[7];

            const marketsConfigs: any[] = await master.getMarketsConfigs();
            const protocolFeeFactor: bigint = marketsConfigs[3];

            const marketSetupInfo: any[] = await master.marketSetupInfo(marketId);
            const initialShares: number = fromInt128toNumber(marketSetupInfo[0]);

            const marketResultInfo: any[] = await master.marketResultInfo(marketId);
            const result: number = Number(marketResultInfo[0]);
            const closeTimestamp: bigint = marketResultInfo[1];

            const marketSharesInfo: any[] = await master.marketSharesInfo(marketId);
            const sharesBalances: any[] = marketSharesInfo[1].map((value: bigint) => fromInt128toNumber(value));
            const redeemableShares = sharesBalances[result] - initialShares;

            // Get collateral balance of Market instance and Operator
            const initialMarketCollateral: bigint = await dai.balanceOf(marketAddress);
            const initialOperatorCollateral: bigint = await dai.balanceOf(marketOperator.address);

            if (detailsEnabled) {
                console.log(`\t| MarketId: ${marketId}, Address: ${marketAddress}, Fee Factor: ${protocolFeeFactor}`);
                console.log(`\t| Reported Result: ${result} (closed: ${closeTimestamp})`);
                console.log(`\t| RedeemableShares: ${redeemableShares} shares`);
                console.log(`\t| Initial -> market collateral: ${ethers.formatEther(initialMarketCollateral)} DAI`);
                console.log(`\t|          operator collateral: ${ethers.formatEther(initialOperatorCollateral)} DAI`);
            }

            // Send call to get all available collateral of the Market (from the market operator account)
            await master.connect(marketOperator).withdrawMarketCollateral(marketId);

            const finalMarketCollateral: bigint = await dai.balanceOf(marketAddress);
            const finalOperatorCollateral: bigint = await dai.balanceOf(marketOperator.address);
            const withdrawnCollateral = finalOperatorCollateral - initialOperatorCollateral;

            if (detailsEnabled) {
                console.log(`\t| final -> market collateral: ${ethers.formatEther(finalMarketCollateral)} DAI`);
                console.log(`\t|        operator collateral: ${ethers.formatEther(finalOperatorCollateral)} DAI`);
                console.log(`\t| Withdrawn Collateral: ${ethers.formatEther(withdrawnCollateral)} DAI`);
            }

            expect(finalMarketCollateral).to.equal(ethers.parseEther(`${redeemableShares}`));
            expect(withdrawnCollateral).to.equal(initialMarketCollateral - finalMarketCollateral);
        })

        it("| All winning shares can be redeemed ok (after collateral withdraw)", async function () {
            if (detailsEnabled) console.log("");
            const marketId: number = 1;

            // Get all market needed info from chain
            const marketInfo: any[] = await master.markets(marketId);
            const marketAddress: string = marketInfo[7];

            const marketSetupInfo: any[] = await master.marketSetupInfo(marketId);
            const sharesMintedOnCreation: number = fromInt128toNumber(marketSetupInfo[0]);

            const marketResultInfo: any[] = await master.marketResultInfo(marketId);
            const result: number = Number(marketResultInfo[0]);

            const initialMarketSharesInfo: any[] = await master.marketSharesInfo(marketId);
            const sharesBalances: any[] = initialMarketSharesInfo[1].map((value: bigint) => fromInt128toNumber(value));
            const redeemableShares: number = sharesBalances[result] - sharesMintedOnCreation;
            const initialRedeemedShares: number = fromInt128toNumber(initialMarketSharesInfo[2])

            const initialMarketCollateral: bigint = await dai.balanceOf(marketAddress);

            if (detailsEnabled) {
                console.log(`\t| MarketId: ${marketId}, Address: ${marketAddress}`);
                console.log(`\t| Reported Result: ${result}, Total Redeemable Shares: ${redeemableShares} shares`);
                console.log(`\t| Initial -> market collateral: ${ethers.formatEther(initialMarketCollateral)} DAI`);
                console.log(`\t|            redeemed Shares: ${initialRedeemedShares} shares`);
            }

            // Send REDEEM batch for accounts (should not revert no mather individual account state)
            const createdMarket: PrecogMarketV8 = await ethers.getContractAt('PrecogMarketV8', marketAddress);
            const accounts: string[] = [user.address, caller.address, marketOperator.address];
            await createdMarket.connect(admin).redeemBatch(accounts);

            // Get market info after all users had redeemed
            const finalMarketSharesInfo: any[] = await master.marketSharesInfo(marketId);
            const finalRedeemedShares: number = fromInt128toNumber(finalMarketSharesInfo[2])
            const finalMarketCollateral: bigint = await dai.balanceOf(marketAddress);

            if (detailsEnabled) {
                console.log(`\t| Final -> market collateral: ${ethers.formatEther(finalMarketCollateral)} DAI`);
                console.log(`\t|            redeemed Shares: ${finalRedeemedShares} shares`);
            }

            expect(finalRedeemedShares).to.equal(redeemableShares);
            expect(finalMarketCollateral).to.equal(0);
        })
    })

    describe("Virtual Liquidity Market functions (with USDC)", function () {
        it("| Market Operator accounts can create a virtual liquidity market with USDC", async function () {
            // Set protocol fee for all next markets to 5% (protocolFee = 1/protocolFactor)
            await master.connect(admin).setProtocolFeeFactor(20);

            // Approve PrecogMaster to use MarketOperator USDCs
            await usdc.connect(marketOperator).approve(
                await master.getAddress(),
                await usdc.balanceOf(marketOperator.address)
            );

            if (detailsEnabled) console.log("");
            const question: string = 'Initial custom USDC market';
            const resolutionCriteria: string = 'Initial custom description';
            const imageURL: string = 'https://ipfs.io/ipfs/test123';
            const category: string = 'CRYPTO';
            const outcomes: string[] = ['YES', 'NO', 'UNFINISHED'];
            const startTimestamp: number = await getCurrentBlockTimestamp();
            const endTimestamp: number = startTimestamp + 300;  // 5 min market
            const fundingUnits: number = 1000;
            const funding: bigint = ethers.parseUnits(`${fundingUnits}`, 6);
            const overround: number = 500;  // 500 bps or 5% (aka market margin and max loss)
            const creator: string = admin.address;
            const collateralToken: string = await usdc.getAddress();
            const collateralFunder: string = marketOperator.address;
            const marketOracle: string = admin.address;
            const marketSellFeeFactor: number = 20; // 0.05 -> 5% (sellFee=1/sellFeeFactor)
            const virtualLiquidityUnits: number = fundingUnits / (overround / 10_000);
            const virtualLiquidity: bigint = ethers.parseUnits(virtualLiquidityUnits.toFixed(6), 6);

            if (detailsEnabled) {
                console.log(`\t| Funding -> ${fundingUnits} USDC, Liquidity: ${virtualLiquidityUnits.toFixed(6)} USDC`);
            }

            // Initialize local market to verify solidity calculations
            const alpha = (overround / 10000) / (outcomes.length * Math.log(outcomes.length));
            const sellFee = 1 / marketSellFeeFactor;
            localMarket = new LSLMSR(outcomes, alpha, virtualLiquidityUnits, sellFee);

            const emptyAddress: string = "0x0000000000000000000000000000000000000000";
            const marketData = {
                question: question, resolutionCriteria: resolutionCriteria, imageURL: imageURL, category: category,
                outcomes: outcomes.join(','), creator: creator, operator: emptyAddress, market: emptyAddress,
                startTimestamp: startTimestamp, endTimestamp: endTimestamp, collateral: collateralToken,
            };
            const marketConfig = {
                oracle: marketOracle, totalOutcomes: outcomes.length, liquidity: virtualLiquidity, overround: overround,
                sellFeeFactor: marketSellFeeFactor, collateralFunding: funding, collateralFunder: collateralFunder
            };
            await master.connect(marketOperator).createMarket(marketData, marketConfig);

            const createdMarkets: bigint = await master.createdMarkets();
            const createdMarketId = Number(createdMarkets) - 1;
            const createdMarket: any[] = await master.markets(createdMarketId);
            const marketQuestion = createdMarket[0];
            const marketCriteria = createdMarket[1];
            const marketImageURL = createdMarket[2];
            const marketCategory = createdMarket[3];
            const marketOutcomes = createdMarket[4];
            const marketCreatorAddress = createdMarket[5];
            const marketOperatorAddress = createdMarket[6];
            const marketAddress = createdMarket[7];
            const marketStart = createdMarket[8];
            const marketEnd = createdMarket[9];
            const marketCollateralTokenAddress = createdMarket[10];

            const createdMarketCollateralInfo = await master.marketCollateralInfo(createdMarketId);
            const marketCollateralAddress = createdMarketCollateralInfo[0];
            const marketCollateralName = createdMarketCollateralInfo[1];
            const marketCollateralSymbol = createdMarketCollateralInfo[2];
            const marketCollateralDecimals = createdMarketCollateralInfo[3];

            // Get Buy and Sell prices indexed by outcome (outcome index zero is not valid)
            const createdMarketPrices = await master.marketPrices(createdMarketId);

            if (detailsEnabled) {
                console.log(`\t| Market Address: ${marketAddress}`);
                console.log(`\t| Market -> question: ${marketQuestion}, creator: ${marketCreatorAddress}`);
                console.log(`\t| Start: ${marketStart}, End: ${marketEnd}`);
                console.log(`\t| Collateral Address: ${marketCollateralAddress}`);
                console.log(`\t| Collateral -> name: ${marketCollateralName}, decimals: ${marketCollateralDecimals}`);
                console.log(`\t| Funding -> ${funding}, Liquidity: ${virtualLiquidity}`);
            }

            expect(createdMarkets).to.equal(3);
            expect(marketQuestion).to.equal(question);
            expect(marketCriteria).to.equal(resolutionCriteria);
            expect(marketImageURL).to.equal(imageURL);
            expect(marketCategory).to.equal(category);
            expect(marketOutcomes).to.equal(outcomes.join(','));
            expect(marketCreatorAddress).to.equal(creator);
            expect(marketOperatorAddress).to.equal(marketOperator.address);
            expect(marketCollateralTokenAddress).to.equal(collateralToken);
            expect(marketStart).to.equal(startTimestamp);
            expect(marketEnd).to.equal(endTimestamp);
            expect(marketCollateralAddress).to.equal(collateralToken);
            expect(marketCollateralSymbol).to.equal(await usdc.symbol());

            // Verify initial prices against local calculations
            const localPrices = localMarket.prices();
            const tolerance = 0.000001;
            const buyPrices = createdMarketPrices[0];
            for (let i = 1; i < buyPrices.length; i++) {
                const outcomePrice = Number(ethers.formatUnits(buyPrices[1], 6));
                const localOutcomePrice = localPrices[Object.keys(localPrices)[i - 1]];
                expect(outcomePrice).to.closeTo(localOutcomePrice, tolerance);
                // const priceDelta = Math.abs(outcomePrice - localOutcomePrice);
                // expect(priceDelta).be.lessThanOrEqual(tolerance);
            }
        })

        it("| Accounts can BUY shares with USDC on a custom market", async function () {
            if (detailsEnabled) console.log("");
            const shares: number = 1
            const marketId: number = 2;
            const outcome: number = 1;
            const sharesAmount: bigint = fromNumberToInt128(shares);
            const masterAddress: string = await master.getAddress();

            // Get fast buy prices
            const prices: bigint[][] = await master.marketPrices(marketId);  // prices helper
            const buyPrices = prices[0].map(value => Number(ethers.formatUnits(value, 6)));

            // Get the current market price and calculate max token in
            const buyPriceInt128: bigint = await master.marketBuyPrice(marketId, outcome, sharesAmount);
            const buyCost: number = Number(fromInt128toNumber(buyPriceInt128).toFixed(6));
            const maxTokenIn: number = buyCost * 1.001  // Add 0.1% of slippage
            const maxAmountIn: bigint = ethers.parseUnits(maxTokenIn.toFixed(6), 6);

            // Get market shares info before the trade
            const marketSharesInfoBefore: any[] = await master.marketSharesInfo(marketId);
            const totalSharesBefore: number = fromInt128toNumber(marketSharesInfoBefore[0]);

            // Give allowance of USDC to PrecogMaster
            await usdc.connect(user).approve(masterAddress, maxAmountIn);

            // Calculate expected costs (to be compared after)
            const buyCostPerShare: number = buyCost / shares;
            const balanceBefore: bigint = await usdc.balanceOf(user.address);
            const allowanceBefore: bigint = await usdc.allowance(user.address, masterAddress);
            if (detailsEnabled) {
                console.log(`\t| Buying: outcome=${outcome}, amount=${shares}, maxIn=${maxTokenIn.toFixed(6)} USDC`);
                console.log(`\t| Allowance to Master (before): ${ethers.formatUnits(allowanceBefore, 6)} USDC`);
                console.log(`\t| Expected -> buyPrice: ${buyCostPerShare}, buyCost: ${buyCost} USDC`);
            }

            // Send BUY call as a random user
            await master.connect(user).marketBuy(marketId, outcome, sharesAmount, maxAmountIn);

            // Register trade on local market
            const localOutcome = localMarket.outcomes[0];
            localMarket.buy(localOutcome, shares);

            const marketSharesInfo: any[] = await master.marketSharesInfo(marketId);
            const totalShares: number = fromInt128toNumber(marketSharesInfo[0]);
            const totalBuys: number = marketSharesInfo[4];
            const totalSells: number = marketSharesInfo[5];
            const balanceAfter: bigint = await usdc.balanceOf(user.address);
            const allowanceAfter: bigint = await usdc.allowance(user.address, masterAddress);
            const preTokenCost: bigint = balanceBefore - balanceAfter;
            const costPerShare: string = ethers.formatUnits(preTokenCost / BigInt(shares), 6);
            const tokenCost: string = ethers.formatUnits(preTokenCost, 6);

            if (detailsEnabled) {
                console.log(`\t|   Traded -> buyPrice: ${costPerShare}, buyCost: ${tokenCost} USDC`);
                console.log(`\t| Fast Buy Price: ${buyPrices[outcome]} USDC`);
                console.log(`\t| Allowance to Master (after): ${ethers.formatUnits(allowanceAfter, 6)} USDC`);
                console.log(`\t| Market -> TotalShares: ${totalShares}, Sells: ${totalSells}, Buys: ${totalBuys}`);
            }

            expect(Number(tokenCost)).be.lessThanOrEqual(buyCost);
            expect(totalBuys).be.equal(shares);
            expect(totalShares).be.equal(totalSharesBefore + shares);
            expect(allowanceAfter).be.equal(0);
        })

        it("| Accounts can SELL shares on a custom market with USDC", async function () {
            if (detailsEnabled) console.log("");
            const shares: number = 1
            const marketId: number = 2;
            const outcome: number = 1;
            const sharesAmount: bigint = fromNumberToInt128(shares);

            // Get fast sell prices
            const prices: bigint[][] = await master.marketPrices(marketId);  // prices helper
            const sellPrices = prices[1].map(value => Number(ethers.formatUnits(value, 6)));

            // Get the current market price and calculate min token return
            const sellPriceInt128: bigint = await master.marketSellPrice(marketId, outcome, sharesAmount);
            const sellReturn: number = Number(fromInt128toNumber(sellPriceInt128).toFixed(6));
            const minTokenOut: number = sellReturn * 0.999  // Add 0.1% of slippage
            const minAmountOut: bigint = ethers.parseUnits(minTokenOut.toFixed(6), 6);

            // Get market shares info before the trade
            const marketSharesInfoBefore: any[] = await master.marketSharesInfo(marketId);
            const totalSharesBefore: number = fromInt128toNumber(marketSharesInfoBefore[0]);

            // Calculate expected returns (to be compared after)
            const returnPerShare: number = sellReturn / shares;
            const balanceBefore: bigint = await usdc.balanceOf(user.address);
            if (detailsEnabled) {
                console.log(`\t| Selling: outcome=${outcome}, amount=${shares}, minOut=${minTokenOut} USDC`);
                console.log(`\t| Expected -> sellPrice: ${returnPerShare}, sellReturn: ${sellReturn} USDC`);
            }

            // Send SELL call as a random user
            await master.connect(user).marketSell(marketId, outcome, sharesAmount, minAmountOut);

            // Register trade on local market
            const localOutcome = localMarket.outcomes[0];
            localMarket.sell(localOutcome, shares);

            const marketSharesInfo: any[] = await master.marketSharesInfo(marketId);
            const totalShares: number = fromInt128toNumber(marketSharesInfo[0]);
            const totalBuys: number = marketSharesInfo[4];
            const totalSells: number = marketSharesInfo[5];
            const balanceAfter: bigint = await usdc.balanceOf(user.address);
            const preTokenReturn: bigint = balanceAfter - balanceBefore;
            const costPerShare: string = ethers.formatUnits(preTokenReturn / BigInt(shares), 6);
            const tokenReturn: string = ethers.formatUnits(preTokenReturn, 6);
            if (detailsEnabled) {
                console.log(`\t|   Traded -> sellPrice: ${costPerShare}, sellReturn: ${tokenReturn} USDC`);
                console.log(`\t| Fast Sell Price: ${sellPrices[outcome]} USDC`);
                console.log(`\t| Market -> TotalShares: ${totalShares}, Sells: ${totalSells}, Buys: ${totalBuys}`);
            }

            expect(Number(tokenReturn)).be.greaterThanOrEqual(sellReturn);
            expect(totalSells).be.equal(shares);
            expect(totalShares).be.equal(totalSharesBefore - shares);
        })

        it("| Accounts can BUY shares with USDC with Permit [EIP-2612]", async function () {
            if (detailsEnabled) console.log("");
            const shares: number = 10
            const marketId: number = 2;
            const outcome: number = 1;
            const sharesAmount: bigint = fromNumberToInt128(shares);

            // Get the current market price and calculate max token in
            const buyPriceInt128: bigint = await master.marketBuyPrice(marketId, outcome, sharesAmount);
            const buyCost: number = Number(fromInt128toNumber(buyPriceInt128).toFixed(6));
            const maxTokenIn: number = buyCost * 1.001  // Add 0.1% of slippage
            const maxAmountIn: bigint = ethers.parseUnits(maxTokenIn.toFixed(6), 6);

            const marketData = await master.markets(marketId);
            const marketAddress = marketData[7];

            // Sign permit [EIP-2612] approval to Market and get `v`, `r`, `s` values
            const chainId = 31337;
            const tokenName = await usdc.name();
            const tokenAddress = await usdc.getAddress();
            const userAddress = user.address;
            const nonce = await usdc.nonces(userAddress);
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const domain = {name: tokenName, version: "1", chainId: chainId, verifyingContract: tokenAddress};
            const types = {
                Permit: [
                    {name: "owner", type: "address"},
                    {name: "spender", type: "address"},
                    {name: "value", type: "uint256"},
                    {name: "nonce", type: "uint256"},
                    {name: "deadline", type: "uint256"}
                ]
            };
            const values = {
                owner: userAddress,
                spender: marketAddress,
                value: maxAmountIn,
                nonce: nonce,
                deadline: deadline
            }
            const signature = await user.signTypedData(domain, types, values);
            const {v, r, s} = ethers.Signature.from(signature);

            // Calculate expected costs (to be compared after)
            const buyCostPerShare: number = buyCost / shares;
            const balanceBefore: bigint = await usdc.balanceOf(user.address);
            const allowanceBefore: bigint = await usdc.allowance(user.address, marketAddress);
            const userAccountInfoBefore: any[] = await master.marketAccountInfo(marketId, user.address);
            const userOutcomeSharesBefore = parseInt(ethers.formatUnits(userAccountInfoBefore[5][outcome], 6));
            if (detailsEnabled) {
                console.log(`\t| Buying: outcome=${outcome}, amount=${shares}, maxIn=${maxTokenIn.toFixed(6)} USDC`);
                console.log(`\t| Allowance to Market (before): ${ethers.formatUnits(allowanceBefore, 6)} USDC`);
                console.log(`\t| User shares (before): ${userOutcomeSharesBefore} shares (outcome: ${outcome})`);
                console.log(`\t| Expected -> buyPrice: ${buyCostPerShare.toFixed(6)}, buyCost: ${buyCost} USDC`);
            }

            // Send BUY call as a random user
            await master.connect(user).marketBuyWithPermit(
                marketId, outcome, sharesAmount, maxAmountIn,
                deadline, v, r, s
            );

            // Register trade on local market
            const localOutcome = localMarket.outcomes[0];
            localMarket.buy(localOutcome, shares);

            const balanceAfter: bigint = await usdc.balanceOf(user.address);
            const allowanceAfter: bigint = await usdc.allowance(user.address, marketAddress);
            const userAccountInfoAfter: any[] = await master.marketAccountInfo(marketId, user.address);
            const userOutcomeSharesAfter = parseInt(ethers.formatUnits(userAccountInfoAfter[5][outcome], 6));
            const usdcTokenCost: bigint = balanceBefore - balanceAfter;
            const costPerShare: string = ethers.formatUnits(usdcTokenCost / BigInt(shares), 6);

            const tokenCost: string = ethers.formatUnits(usdcTokenCost, 6);

            if (detailsEnabled) {
                console.log(`\t|   Traded -> buyPrice: ${costPerShare}, buyCost: ${tokenCost} USDC`);
                console.log(`\t| Allowance to Market (after): ${ethers.formatUnits(allowanceAfter, 6)} USDC`);
                console.log(`\t| User shares (before): ${userOutcomeSharesAfter} shares (outcome: ${outcome})`);
            }

            expect(Number(tokenCost)).be.lessThanOrEqual(buyCost);
            expect(maxAmountIn - usdcTokenCost).be.equal(allowanceAfter);
            expect(userOutcomeSharesAfter - userOutcomeSharesBefore).be.equal(shares);
        })

        it("| Accounts can BUY shares with USDC with Permit2", async function () {
            if (detailsEnabled) console.log("");
            const shares: number = 10
            const marketId: number = 2;
            const outcome: number = 1;
            const sharesAmount: bigint = fromNumberToInt128(shares);

            // Get the current market price and calculate max token in
            const buyPriceInt128: bigint = await master.marketBuyPrice(marketId, outcome, sharesAmount);
            const buyCost: number = Number(fromInt128toNumber(buyPriceInt128).toFixed(6));
            const maxTokenIn: number = buyCost * 1.001  // Add 0.1% of slippage
            const maxAmountIn: bigint = ethers.parseUnits(maxTokenIn.toFixed(6), 6);

            // Give allowance of USDC to Permit2
            await usdc.connect(user).approve(PERMIT2_ADDRESS, maxAmountIn);

            // Sign Permit2 transfer to Master
            const masterAddress = await master.getAddress();
            const chainId = await ethers.provider.send("eth_chainId", []);
            const tokenAddress = await usdc.getAddress();
            const nonce = 0n;
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const domain = {name: "Permit2", chainId: chainId, verifyingContract: PERMIT2_ADDRESS};
            const types = {
                PermitTransferFrom: [
                    {name: "permitted", type: "TokenPermissions"},
                    {name: "spender", type: "address"},
                    {name: "nonce", type: "uint256"},
                    {name: "deadline", type: "uint256"},
                ],
                TokenPermissions: [
                    {name: "token", type: "address"},
                    {name: "amount", type: "uint256"}
                ]
            };
            const values = {
                permitted: {token: tokenAddress, amount: maxAmountIn},
                spender: masterAddress,
                nonce: nonce,
                deadline: deadline
            };
            const signature = await user.signTypedData(domain, types, values);

            // Calculate expected costs (to be compared after)
            const buyCostPerShare: number = buyCost / shares;
            const balanceBefore: bigint = await usdc.balanceOf(user.address);
            const allowanceBefore: bigint = await usdc.allowance(user.address, masterAddress);
            if (detailsEnabled) {
                console.log(`\t| Buying: outcome=${outcome}, amount=${shares}, maxIn=${maxTokenIn.toFixed(6)} USDC`);
                console.log(`\t| Allowance to Market (before): ${ethers.formatUnits(allowanceBefore, 6)} USDC`);
                console.log(`\t| Expected -> buyPrice: ${buyCostPerShare.toFixed(6)}, buyCost: ${buyCost} USDC`);
            }

            // Send BUY call as a random user
            await master.connect(user).marketBuyWithPermit2(
                marketId, outcome, sharesAmount, maxAmountIn,
                nonce, deadline, signature
            );

            // Register trade on local market
            const localOutcome = localMarket.outcomes[0];
            localMarket.buy(localOutcome, shares);

            const balanceAfter: bigint = await usdc.balanceOf(user.address);
            const allowanceAfter: bigint = await usdc.allowance(user.address, masterAddress);
            const usdcTokenCost: bigint = balanceBefore - balanceAfter;
            const costPerShare: string = ethers.formatUnits(usdcTokenCost / BigInt(shares), 6);
            const tokenCost: string = ethers.formatUnits(usdcTokenCost, 6);
            if (detailsEnabled) {
                console.log(`\t|   Traded -> buyPrice: ${costPerShare}, buyCost: ${tokenCost} USDC`);
                console.log(`\t| Allowance to Market (after): ${ethers.formatUnits(allowanceAfter, 6)} USDC`);
            }

            expect(Number(tokenCost)).be.lessThanOrEqual(buyCost);
        })

        it("| The market Operator can BUY shares for any Account with Permit2 on USDC", async function () {
            if (detailsEnabled) console.log("");
            const shares: number = 10
            const marketId: number = 2;
            const outcome: number = 1;
            const sharesAmount: bigint = fromNumberToInt128(shares);
            const account = user.address;

            // Get the current market price and calculate max token in
            const buyPriceInt128: bigint = await master.marketBuyPrice(marketId, outcome, sharesAmount);
            const buyCost: number = Number(fromInt128toNumber(buyPriceInt128).toFixed(6));
            const maxTokenIn: number = buyCost * 1.001  // Add 0.1% of slippage
            const maxAmountIn: bigint = ethers.parseUnits(maxTokenIn.toFixed(6), 6);

            const accountInfoBefore: any[] = await master.marketAccountInfo(marketId, account);
            const accountShareBalanceBefore: number = Number(ethers.formatUnits(accountInfoBefore[5][outcome], 6))

            // Give allowance of USDC to Permit2
            await usdc.connect(user).approve(PERMIT2_ADDRESS, maxAmountIn);

            // Sign Permit2 transfer to Master
            const masterAddress = await master.getAddress();
            const chainId = await ethers.provider.send("eth_chainId", []);
            const tokenAddress = await usdc.getAddress();
            const nonce = 1n;
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const domain = {name: "Permit2", chainId: chainId, verifyingContract: PERMIT2_ADDRESS};
            const types = {
                PermitTransferFrom: [
                    {name: "permitted", type: "TokenPermissions"},
                    {name: "spender", type: "address"},
                    {name: "nonce", type: "uint256"},
                    {name: "deadline", type: "uint256"},
                ],
                TokenPermissions: [
                    {name: "token", type: "address"},
                    {name: "amount", type: "uint256"}
                ]
            };
            const values = {
                permitted: {token: tokenAddress, amount: maxAmountIn},
                spender: masterAddress,
                nonce: nonce,
                deadline: deadline
            };
            const signature = await user.signTypedData(domain, types, values);

            // Calculate expected costs (to be compared after)
            const buyCostPerShare: number = buyCost / shares;
            const balanceBefore: bigint = await usdc.balanceOf(account);
            const allowanceBefore: bigint = await usdc.allowance(account, masterAddress);
            if (detailsEnabled) {
                console.log(`\t| Account (signer): ${account}, Signature: ${(signature.length - 2) / 2} bytes`);
                console.log(`\t| Operator (sender): ${marketOperator.address}`);
                console.log(`\t| Buying: outcome=${outcome}, amount=${shares}, maxIn=${maxTokenIn.toFixed(6)} USDC`);
                console.log(`\t| Allowance to Market (before): ${ethers.formatUnits(allowanceBefore, 6)} USDC`);
                console.log(`\t| Expected -> buyPrice: ${buyCostPerShare.toFixed(6)}, buyCost: ${buyCost} USDC`);
            }

            // Try to send `buyMarketSharesFor` from other MARKET_CREATOR (this subtest could be independent)
            await master.addMarketOperator(admin.address); // Add ADMIN as a MARKET_CREATOR (just for this test)
            const buyForTx = master.connect(admin).buyMarketSharesFor(
                account, marketId, outcome, sharesAmount, maxAmountIn,
                nonce, deadline, signature
            );
            expect(buyForTx).to.be.revertedWith('Not allowed operator');
            await master.addMarketOperator(admin.address); // Remove ADMIN as a MARKET_CREATOR

            // Send BUY call from the market operator to buy for account
            await master.connect(marketOperator).buyMarketSharesFor(
                account, marketId, outcome, sharesAmount, maxAmountIn,
                nonce, deadline, signature
            );

            // Register trade on local market
            const localOutcome = localMarket.outcomes[0];
            localMarket.buy(localOutcome, shares);

            const balanceAfter: bigint = await usdc.balanceOf(account);
            const allowanceAfter: bigint = await usdc.allowance(account, masterAddress);
            const usdcTokenCost: bigint = balanceBefore - balanceAfter;
            const costPerShare: string = ethers.formatUnits(usdcTokenCost / BigInt(shares), 6);
            const tokenCost: string = ethers.formatUnits(usdcTokenCost, 6);

            const accountInfo: any[] = await master.marketAccountInfo(marketId, user.address);
            const accountShareBalance: number = Number(ethers.formatUnits(accountInfo[5][outcome], 6))

            if (detailsEnabled) {
                console.log(`\t|   Traded -> buyPrice: ${costPerShare}, buyCost: ${tokenCost} USDC`);
                console.log(`\t| Allowance to Market (after): ${ethers.formatUnits(allowanceAfter, 6)} USDC`);
                console.log(`\t| User share balance (outcome=${outcome}): ${accountShareBalance} shares`);
            }

            expect(allowanceAfter).be.equal(allowanceBefore);
            expect(Number(tokenCost)).be.lessThanOrEqual(buyCost);
            expect(accountShareBalance).be.lessThanOrEqual(accountShareBalanceBefore + shares);
        })

        it("| Caller accounts can BUY shares for any Account with Permit2 on USDC", async function () {
            if (detailsEnabled) console.log("");
            const shares: number = 200
            const marketId: number = 2;
            const outcome: number = 2;
            const sharesAmount: bigint = fromNumberToInt128(shares);
            const account = user.address;
            const payer = user.address;

            // Get the current market price and calculate max token in
            const buyPriceInt128: bigint = await master.marketBuyPrice(marketId, outcome, sharesAmount);
            const buyCost: number = Number(fromInt128toNumber(buyPriceInt128).toFixed(6));
            const maxTokenIn: number = buyCost * 1.001  // Add 0.1% of slippage
            const maxAmountIn: bigint = ethers.parseUnits(maxTokenIn.toFixed(6), 6);

            const accountInfoBefore: any[] = await master.marketAccountInfo(marketId, account);
            const accountShareBalanceBefore: number = Number(ethers.formatUnits(accountInfoBefore[5][outcome], 6))

            // Give allowance of USDC to Permit2
            await usdc.connect(user).approve(PERMIT2_ADDRESS, maxAmountIn);

            // Sign Permit2 transfer to Master
            const masterAddress = await master.getAddress();
            const chainId = await ethers.provider.send("eth_chainId", []);
            const tokenAddress = await usdc.getAddress();
            const nonce = 2n;
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const domain = {name: "Permit2", chainId: chainId, verifyingContract: PERMIT2_ADDRESS};
            const types = {
                PermitTransferFrom: [
                    {name: "permitted", type: "TokenPermissions"},
                    {name: "spender", type: "address"},
                    {name: "nonce", type: "uint256"},
                    {name: "deadline", type: "uint256"},
                ],
                TokenPermissions: [
                    {name: "token", type: "address"},
                    {name: "amount", type: "uint256"}
                ]
            };
            const values = {
                permitted: {token: tokenAddress, amount: maxAmountIn},
                spender: masterAddress,
                nonce: nonce,
                deadline: deadline
            };
            const signature = await user.signTypedData(domain, types, values);  // In this test, user -> `payer`

            // Calculate expected costs (to be compared after)
            const buyCostPerShare: number = buyCost / shares;
            const balanceBefore: bigint = await usdc.balanceOf(account);
            const allowanceBefore: bigint = await usdc.allowance(account, masterAddress);
            if (detailsEnabled) {
                console.log(`\t| Account: ${account} (balance: ${ethers.formatUnits(balanceBefore, 6)} USDC)`);
                console.log(`\t| Payer (signer): ${payer}, Signature: ${(signature.length - 2) / 2} bytes`);
                console.log(`\t| Caller (sender): ${caller.address}`);
                console.log(`\t| Buying: outcome=${outcome}, amount=${shares}, maxIn=${maxTokenIn.toFixed(6)} USDC`);
                console.log(`\t| Allowance to Market (before): ${ethers.formatUnits(allowanceBefore, 6)} USDC`);
                console.log(`\t| Expected -> buyPrice: ${buyCostPerShare.toFixed(6)}, buyCost: ${buyCost} USDC`);
            }

            // Send BUY call from the market operator to buy for account
            await master.connect(caller).buyMarketSharesForWithPayer(
                account, payer, marketId, outcome, sharesAmount, maxAmountIn,
                nonce, deadline, signature
            );

            // Register trade on local market
            const localOutcome = localMarket.outcomes[0];
            localMarket.buy(localOutcome, shares);

            const balanceAfter: bigint = await usdc.balanceOf(user.address);
            const allowanceAfter: bigint = await usdc.allowance(user.address, masterAddress);
            const usdcTokenCost: bigint = balanceBefore - balanceAfter;
            const costPerShare: string = ethers.formatUnits(usdcTokenCost / BigInt(shares), 6);
            const tokenCost: string = ethers.formatUnits(usdcTokenCost, 6);

            const accountInfo: any[] = await master.marketAccountInfo(marketId, user.address);
            const accountShareBalance: number = Number(ethers.formatUnits(accountInfo[5][outcome], 6))

            if (detailsEnabled) {
                console.log(`\t|   Traded -> buyPrice: ${costPerShare}, buyCost: ${tokenCost} USDC`);
                console.log(`\t| Allowance to Market (after): ${ethers.formatUnits(allowanceAfter, 6)} USDC`);
                console.log(`\t| User share balance (outcome=${outcome}): ${accountShareBalance} shares`);
            }

            expect(allowanceAfter).be.equal(allowanceBefore);
            expect(Number(tokenCost)).be.lessThanOrEqual(buyCost);
            expect(accountShareBalance).be.lessThanOrEqual(accountShareBalanceBefore + shares);
        })

        it("| Only the register oracle can report results on the market", async function () {
            if (detailsEnabled) console.log("");
            const marketId: number = 2;
            const resultOutcome: number = 1;

            const marketInfo: any[] = await master.markets(marketId);
            const marketAddress: string = marketInfo[7];
            const startTimestamp: bigint = marketInfo[8];
            const endTimestamp: bigint = marketInfo[9];

            const createdMarket: PrecogMarketV8 = await ethers.getContractAt('PrecogMarketV8', marketAddress);
            const oracle: string = await createdMarket.oracle();

            const initialMarketResultInfo: any[] = await master.marketResultInfo(marketId);
            const initialResult: bigint = initialMarketResultInfo[0];
            const initialCloseTimestamp: bigint = initialMarketResultInfo[1];
            const initialReporter: string = initialMarketResultInfo[2];

            if (detailsEnabled) {
                console.log(`\t| MarketId: ${marketId}`);
                console.log(`\t| Created Market: ${await createdMarket.getAddress()}`);
                console.log(`\t| Oracle: ${oracle}`);
                console.log(`\t| StartTimestamp: ${startTimestamp}, EndTimestamp=${endTimestamp}`);
                console.log(`\t| Initial -> CloseTimestamp: ${initialCloseTimestamp}, Result=${initialResult}`);
            }

            // Move local chain next block timestamp to be higher than endTimestamp of the market
            await ethers.provider.send("evm_setNextBlockTimestamp", [Number(endTimestamp) + 1]);

            // Try to report the result from a random user (this subtest could be independent)
            const reportTx = createdMarket.connect(user).reportResult(marketId, resultOutcome);
            expect(reportTx).to.be.revertedWith("Only oracle");

            // Report result with market register oracle account
            await createdMarket.connect(admin).reportResult(marketId, resultOutcome);

            // Get final result information
            const finalMarketResultInfo: any[] = await master.marketResultInfo(marketId);
            const finalResult: bigint = finalMarketResultInfo[0];
            const finalCloseTimestamp: bigint = finalMarketResultInfo[1];
            const finalReporter: string = finalMarketResultInfo[2];

            if (detailsEnabled) {
                console.log(`\t|   Final -> CloseTimestamp: ${finalCloseTimestamp}, Result=${finalResult}`);
                console.log(`\t| Reporter: ${finalReporter}`);
            }

            expect(initialResult).be.equal(0);
            expect(initialCloseTimestamp).be.equal(0);
            expect(initialReporter).be.equal(oracle);
            expect(finalResult).be.equal(resultOutcome);
            expect(finalCloseTimestamp).be.greaterThan(endTimestamp);
            expect(finalReporter).be.equal(oracle);
        })

        it("| The market operator can withdraw all collateral from the market", async function () {
            if (detailsEnabled) console.log("");
            const marketId: number = 2;

            // Get all market needed info from chain
            const marketInfo: any[] = await master.markets(marketId);
            const marketAddress: string = marketInfo[7];

            const marketsConfigs: any[] = await master.getMarketsConfigs();
            const protocolFeeFactor: bigint = marketsConfigs[3];
            const protocolFee = 1 / Number(protocolFeeFactor);

            const marketSetupInfo: any[] = await master.marketSetupInfo(marketId);
            const initialShares: number = fromInt128toNumber(marketSetupInfo[0]);
            const fundingCollateral: bigint = marketSetupInfo[4];

            const marketResultInfo: any[] = await master.marketResultInfo(marketId);
            const result: number = Number(marketResultInfo[0]);
            const closeTimestamp: bigint = marketResultInfo[1];

            const marketSharesInfo: any[] = await master.marketSharesInfo(marketId);
            const sharesBalances: any[] = marketSharesInfo[1].map((value: bigint) => fromInt128toNumber(value));
            const redeemableShares: number = sharesBalances[result] - initialShares;
            const redeemableCollateral: bigint = ethers.parseUnits(`${redeemableShares}`, 6);

            // Get collateral balance of Master, Market instance and Operator
            const initialMasterCollateral: bigint = await usdc.balanceOf(await master.getAddress());
            const initialMarketCollateral: bigint = await usdc.balanceOf(marketAddress);
            const initialOperatorCollateral: bigint = await usdc.balanceOf(marketOperator.address);

            const marketProfit: bigint = initialMarketCollateral - redeemableCollateral - fundingCollateral;
            const feeAmount: bigint = marketProfit / protocolFeeFactor;

            if (detailsEnabled) {
                console.log(`\t| Protocol Fee: ${protocolFee * 100}% (factor: ${protocolFeeFactor})`);
                console.log(`\t| MarketId: ${marketId}, Address: ${marketAddress}`);
                console.log(`\t| Funding Collateral: ${ethers.formatUnits(fundingCollateral, 6)} USDC`);
                console.log(`\t| Reported Result: ${result} (closed: ${closeTimestamp})`);
                console.log(`\t| Profit: ${ethers.formatUnits(`${marketProfit}`, 6)} USDC`);
                console.log(`\t| Profit Fee: ${ethers.formatUnits(`${feeAmount}`, 6)} USDC`);
                console.log(`\t| RedeemableShares: ${redeemableShares} shares`);
                console.log(`\t| Initial -> master balance: ${ethers.formatUnits(initialMasterCollateral, 6)} USDC`);
                console.log(`\t|            market balance: ${ethers.formatUnits(initialMarketCollateral, 6)} USDC`);
                console.log(`\t|          operator balance: ${ethers.formatUnits(initialOperatorCollateral, 6)} USDC`);
            }

            // Send call to get all available collateral of the Market (from the market operator account)
            await master.connect(marketOperator).withdrawMarketCollateral(marketId);

            const finalMasterCollateral: bigint = await usdc.balanceOf(await master.getAddress());
            const finalMarketCollateral: bigint = await usdc.balanceOf(marketAddress);
            const finalOperatorCollateral: bigint = await usdc.balanceOf(marketOperator.address);
            const withdrawnCollateral: bigint = initialMarketCollateral - finalMarketCollateral;
            const operatorWithdrawn = finalOperatorCollateral - initialOperatorCollateral;

            if (detailsEnabled) {
                console.log(`\t| final -> master balance: ${ethers.formatUnits(finalMasterCollateral, 6)} USDC`);
                console.log(`\t|          market balance: ${ethers.formatUnits(finalMarketCollateral, 6)} USDC`);
                console.log(`\t|        operator balance: ${ethers.formatUnits(finalOperatorCollateral, 6)} USDC`);
                console.log(`\t| Market Withdrawn Collateral: ${ethers.formatUnits(withdrawnCollateral, 6)} USDC`);
                console.log(`\t| Operator Withdrawn Collateral: ${ethers.formatUnits(operatorWithdrawn, 6)} USDC`);
            }

            expect(finalMarketCollateral).to.equal(redeemableCollateral);
            expect(withdrawnCollateral).to.equal(initialMarketCollateral - redeemableCollateral);
            expect(operatorWithdrawn).to.equal(fundingCollateral + marketProfit - feeAmount);
        })

        it("| All winning shares can be redeemed ok (after collateral withdraw)", async function () {
            if (detailsEnabled) console.log("");
            const marketId: number = 2;

            // Get all market needed info from chain
            const marketInfo: any[] = await master.markets(marketId);
            const marketAddress: string = marketInfo[7];

            const marketSetupInfo: any[] = await master.marketSetupInfo(marketId);
            const sharesMintedOnCreation: number = fromInt128toNumber(marketSetupInfo[0]);

            const marketResultInfo: any[] = await master.marketResultInfo(marketId);
            const result: number = Number(marketResultInfo[0]);

            const initialMarketSharesInfo: any[] = await master.marketSharesInfo(marketId);
            const sharesBalances: any[] = initialMarketSharesInfo[1].map((value: bigint) => fromInt128toNumber(value));
            const redeemableShares: number = sharesBalances[result] - sharesMintedOnCreation;
            const initialRedeemedShares: number = fromInt128toNumber(initialMarketSharesInfo[2])

            const initialMarketCollateral: bigint = await usdc.balanceOf(marketAddress);

            if (detailsEnabled) {
                console.log(`\t| MarketId: ${marketId}, Address: ${marketAddress}`);
                console.log(`\t| Reported Result: ${result}, Total Redeemable Shares: ${redeemableShares} shares`);
                console.log(`\t| Initial -> market collateral: ${ethers.formatUnits(initialMarketCollateral, 6)} USDC`);
                console.log(`\t|            redeemed Shares: ${initialRedeemedShares} shares`);
            }

            // Send REDEEM batch for accounts (should not revert no mather individual account state)
            const createdMarket: PrecogMarketV8 = await ethers.getContractAt('PrecogMarketV8', marketAddress);
            const accounts: string[] = [user.address, caller.address, marketOperator.address];
            await createdMarket.connect(admin).redeemBatch(accounts);

            // Get market info after all users had redeemed
            const finalMarketSharesInfo: any[] = await master.marketSharesInfo(marketId);
            const finalRedeemedShares: number = fromInt128toNumber(finalMarketSharesInfo[2])
            const finalMarketCollateral: bigint = await usdc.balanceOf(marketAddress);

            if (detailsEnabled) {
                console.log(`\t| Final -> market collateral: ${ethers.formatUnits(finalMarketCollateral, 6)} USDC`);
                console.log(`\t|            redeemed Shares: ${finalRedeemedShares} shares`);
            }

            expect(finalRedeemedShares).to.equal(redeemableShares);
            expect(finalMarketCollateral).to.equal(0);
        })
    })
})


// Helper to check contract size>
// node -e "a=require('./packages/hardhat/artifacts/contracts/PrecogMasterV8.sol/PrecogMasterV8.json');s=(a.deployedBytecode.length-2)/2;console.log('Contract Size:',s,'bytes [', (s/1024).toFixed(2),'KB ]');"
