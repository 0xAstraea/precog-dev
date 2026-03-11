/**
 * Prediction Market helpers libs for fast calculations.
 *
 * @author Marto (https://github.com/0xMarto)
 * @dev Feel free to leave any code improvements (DMs are open @0xMarto)
 */

export class LMSR {
  outcomes: string[];
  b: number;
  q: Record<string, number>;

  constructor(outcomes: string[], b: number) {
    this.outcomes = outcomes;
    this.b = b;
    this.q = {}; // share balances per outcome
    for (const o of outcomes) this.q[o] = 0;
  }

  cost(q: Record<string, number> = this.q): number {
    const sumExp = this.outcomes.reduce(
      (sum, o) => sum + Math.exp(q[o] / this.b),
      0
    );
    return this.b * Math.log(sumExp);
  }

  prices(): Record<string, number> {
    // Note: This function returns marginal prices to buy 1 share of all outcomes
    const result: Record<string, number> = {};
    for (const o of this.outcomes) {
      result[o] = this.tradeCost(o, 1);
    }
    return result;
  }

  buy(outcome: string, deltaQ: number): number {
    const oldCost = this.cost();
    this.q[outcome] += deltaQ;
    const newCost = this.cost();
    return newCost - oldCost;
  }

  tradeCost(outcome: string, deltaQ: number): number {
    const tempQ = { ...this.q };
    tempQ[outcome] += deltaQ;
    return this.cost(tempQ) - this.cost(this.q);
  }

  getBalances() {
    return { ...this.q };
  }

  pricesAfterTrade(outcome: string, deltaQ: number): Record<string, number> {
    // Clone current state
    const tempQ = { ...this.q };
    tempQ[outcome] += deltaQ;

    // Use tradeCost on updated q
    const result: Record<string, number> = {};
    for (const o of this.outcomes) {
      const qWith1More = { ...tempQ };
      qWith1More[o] += 1;
      result[o] = this.cost(qWith1More) - this.cost(tempQ);
    }

    return result;
  }

  maxSharesFromCost(outcome: string, budget: number, precision = 1e-9): number {
  let low = 0;
  let high = 1;

  // Expand high until cost exceeds budget
  while (this.tradeCost(outcome, high) < budget) {
    high *= 2;
  }

  // Binary search
  while (high - low > precision) {
    const mid = (low + high) / 2;
    const cost = this.tradeCost(outcome, mid);
    if (cost > budget) {
      high = mid;
    } else {
      low = mid;
    }
  }

  return low;
  }

  maxSharesFromPrice(outcome: string, targetPrice: number, precision = 1e-9): number {
    let low = 0;
    let high = 1;

    // Expand high until marginal price exceeds targetPrice
    while (true) {
      const price = this.pricesAfterTrade(outcome, high)[outcome];
      if (price >= targetPrice) break;
      high *= 2;
    }

    // Binary search to find number of shares for desired marginal price
    while (high - low > precision) {
      const mid = (low + high) / 2;
      const price = this.pricesAfterTrade(outcome, mid)[outcome];
      if (price > targetPrice) {
        high = mid;
      } else {
        low = mid;
      }
    }

    return low;
  }

  maxLoss(): number {
    return this.b * Math.log(this.outcomes.length);
  }
}

export class LSLMSR {
  outcomes: string[];  // Init parameter. e.g.: ["A","B","C"]
  alpha: number;  // Init parameter. e.g.: 0.0182
  initialShares: number;  // Init parameter. e.g.: 3000
  sellFee: number;   // Init parameter. e.g.: 0.01
  q: Record<string, number>;  // State variable. e.g.: {"A": 3000,"B":3000,"C":3000}
  initialCost: number;  //  State variable. e.g.: 3180
  collectedFees: number;  // Total collected fees. e.g: 10.1

  constructor(outcomes: string[], alpha: number, initialShares = 0, sellFee = 0) {
    this.outcomes = outcomes;
    this.alpha = alpha;
    this.initialShares = initialShares;
    this.sellFee = sellFee;
    this.q = {};
    for (const o of outcomes) this.q[o] = this.initialShares;
    this.initialCost = this.cost();
    this.collectedFees = 0;
  }

  static fromState(outcomesBalances: Record<string, number>, alpha: number): LSLMSR {
    // Note: Using this function to create the market makes `maxLoss` & `collectedFees` not accurate
    const outcomes = Object.keys(outcomesBalances);
    const initialShares = Math.min(...Object.values(outcomesBalances)); // Using lower shares (could be wrong)
    const market = new LSLMSR(outcomes, alpha, initialShares);
    market.q = outcomesBalances;
    return market
  }

  b(q: Record<string, number> = this.q): number {
    return this.alpha * this.outcomes.reduce((sum, o) => sum + q[o], 0);
  }

  cost(q: Record<string, number> = this.q): number {
    const bq = this.b(q);
    if (bq === 0) return 0;
    const sumExp = this.outcomes.reduce((sum, o) => sum + Math.exp(q[o] / bq), 0);
    return bq * Math.log(sumExp);
  }

  prices(): Record<string, number> {
    // Note: This function returns marginal prices to buy 1 share of all outcomes
    const result: Record<string, number> = {};
    for (const o of this.outcomes) {
      result[o] = this.tradeCost(o, 1);
    }
    return result;
  }

  trade(outcome: string, deltaQ: number): number {
    const oldCost = this.cost();
    this.q[outcome] += deltaQ;
    const newCost = this.cost();
    return Math.abs(newCost - oldCost);
  }

  buy(outcome: string, shares: number): number {
    return this.trade(outcome, Math.abs(shares));
  }

  sell(outcome: string, shares: number): number {
    const tradeReturn = this.trade(outcome, -Math.abs(shares));
    const tradeFee = tradeReturn * this.sellFee;
    this.collectedFees += tradeFee;
    return tradeReturn - tradeFee
  }

  tradeCost(outcome: string, deltaQ: number): number {
    const tempQ = { ...this.q };
    tempQ[outcome] += deltaQ;
    const tradeCost = Math.abs(this.cost(tempQ) - this.cost(this.q));
    let tradeFee = 0
    if (deltaQ < 0) tradeFee = tradeCost * this.sellFee;
    return tradeCost - tradeFee;
  }

  getBalances(): Record<string, number> {
    return { ...this.q };
  }

  getOutcome(outcome_index: number): string {
    // The received index is expected to be starting from 1
    return this.outcomes[outcome_index - 1];
  }

  pricesAfterTrade(outcome: string, deltaQ: number): Record<string, number> {
    const tempQ = { ...this.q };
    tempQ[outcome] += deltaQ;

    const result: Record<string, number> = {};
    for (const o of this.outcomes) {
      const qWith1More = { ...tempQ };
      qWith1More[o] += 1;
      result[o] = this.cost(qWith1More) - this.cost(tempQ);
    }

    return result;
  }

  maxSharesFromCost(outcome: string, budget: number, precision = 1e-9): number {
    let low = 0;
    let high = 1;

    while (this.tradeCost(outcome, high) < budget) {
      high *= 2;
    }

    while (high - low > precision) {
      const mid = (low + high) / 2;
      const cost = this.tradeCost(outcome, mid);
      if (cost > budget) {
        high = mid;
      } else {
        low = mid;
      }
    }

    return low;
  }

  maxSharesFromPrice(outcome: string, targetPrice: number, precision = 1e-9): number {
    let low = 0;
    let high = 1;

    // Quickly search for a high bound amount
    while (true) {
      const price = this.pricesAfterTrade(outcome, high)[outcome];
      if (price >= targetPrice) break;
      high *= 2;
    }

    // Execute a binary search to find the number of shares that satisfy the price target
    while (high - low > precision) {
      const mid = (low + high) / 2;
      const price = this.pricesAfterTrade(outcome, mid)[outcome];
      if (price > targetPrice) {
        high = mid;
      } else {
        low = mid;
      }
    }

    return low;
  }

  maxLoss(): number {
    // Theoretical calculation based on LS-LMSR formula (maxLoss = overround * initialShares)
    const n = this.outcomes.length;
    const overround = this.alpha * (n * Math.log(n))
    return this.initialShares * overround;
  }

  addLiquidity(value: number) {
    // Theoretical calculation based on LS-LMSR formula
    const k = value / this.cost();  // Added liquidity ratio (k)
    for (const outcome in this.outcomes) {
      this.buy(outcome, this.q[outcome] * k); // Buy based on already minted balance times k
    }
  }
}
