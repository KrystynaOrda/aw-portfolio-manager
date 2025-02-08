/* =========================
   Strategy 3: Optimized Pairing via Linear Programming
   =========================
   This strategy sets up an LP problem to optimize the pairing between sell and buy orders,
   minimizing the number of trades and thus the fees. For demonstration purposes, a placeholder
   LP solver (using a greedy algorithm) is provided. In production you would integrate a proper
   LP solver library.
*/

import { PortfolioItem } from "../la-portfolio/la-get-portfolio";
import { TOKEN_LIST } from "../utils/la-token-list";
import { DefaultTradeConfig } from "../la-trade-execution/la-trade-executor";
import { AggregatedOrder } from "./la-aggregated-orders";
import {
  ADJUSTMENT_FACTOR,
  analyzePortfolio,
  formatDecimal,
  RebalanceStrategy,
  StrategyConfig,
  TradeInstruction,
} from "./la-instructions";

// Placeholder LP solver function for optimal pairing.
export function solveOptimalPairing(
  sells: AggregatedOrder[],
  buys: AggregatedOrder[]
): { sellToken: string; buyToken: string; tradeAmount: number }[] {
  // In a real implementation, use an LP library (e.g. glpk.js) to minimize fees/trades.
  // Here we use a greedy approach as a stand-in.
  const pairings: {
    sellToken: string;
    buyToken: string;
    tradeAmount: number;
  }[] = [];
  let i = 0,
    j = 0;
  while (i < sells.length && j < buys.length) {
    const tradeAmount = Math.min(sells[i].amount, buys[j].amount);
    pairings.push({
      sellToken: sells[i].token,
      buyToken: buys[j].token,
      tradeAmount,
    });
    sells[i].amount -= tradeAmount;
    buys[j].amount -= tradeAmount;
    if (sells[i].amount === 0) i++;
    if (buys[j].amount === 0) j++;
  }
  return pairings;
}

export class OptimizedPairingRebalanceStrategy implements RebalanceStrategy {
  async generateInstructions(
    params: { address: string; portfolio: PortfolioItem[] },
    config: StrategyConfig,
    tradeConfig: DefaultTradeConfig
  ): Promise<TradeInstruction[]> {
    const instructions: TradeInstruction[] = [];
    const { totalValue, currentAllocations } = analyzePortfolio(
      params.portfolio,
      config.targetAllocations,
      config.thresholdPercentage
    );

    // Compute aggregated net imbalances as in the aggregated orders strategy
    const aggregatedSellOrders: Record<string, number> = {};
    const aggregatedBuyOrders: Record<string, number> = {};
    for (const token in config.targetAllocations) {
      const targetAllocation = config.targetAllocations[token];
      const currentAllocation = currentAllocations[token] || 0;
      const deviation = Math.abs(currentAllocation - targetAllocation) * 100;
      if (deviation > config.thresholdPercentage) {
        const diff = currentAllocation - targetAllocation;
        if (diff > 0) {
          aggregatedSellOrders[token] = diff;
        } else {
          aggregatedBuyOrders[token] = Math.abs(diff);
        }
      }
    }

    const aggregatedSells: AggregatedOrder[] = [];
    const aggregatedBuys: AggregatedOrder[] = [];
    for (const token in aggregatedSellOrders) {
      aggregatedSells.push({
        token,
        amount: aggregatedSellOrders[token] * totalValue * ADJUSTMENT_FACTOR,
      });
    }
    for (const token in aggregatedBuyOrders) {
      aggregatedBuys.push({
        token,
        amount: aggregatedBuyOrders[token] * totalValue * ADJUSTMENT_FACTOR,
      });
    }

    // Use the LP solver (placeholder) to get the optimal pairings
    const optimalPairings = solveOptimalPairing(
      aggregatedSells,
      aggregatedBuys
    );

    // Create trade instructions based on the optimal pairing results
    for (const pairing of optimalPairings) {
      const sellItem = params.portfolio.find(
        (item) => item.token === pairing.sellToken
      );
      if (!sellItem) continue;
      const chainConfig = TOKEN_LIST[sellItem.chain];
      const tokenConfig =
        chainConfig.tokens[
          pairing.sellToken as keyof typeof chainConfig.tokens
        ];
      const tokenAmountToSell =
        (pairing.tradeAmount / parseFloat(sellItem.usdValue)) *
        parseFloat(sellItem.balance);
      const formattedAmount = formatDecimal(
        tokenAmountToSell,
        tokenConfig.decimals
      );
      try {
        ethers.utils.parseUnits(formattedAmount, tokenConfig.decimals);
      } catch (error) {
        console.log(
          "Skipping optimized trade due to invalid amount format:",
          formattedAmount,
          pairing.sellToken
        );
        continue;
      }
      if (parseFloat(formattedAmount) <= 0) {
        console.log(
          "Skipping zero amount optimized trade from",
          pairing.sellToken,
          "to",
          pairing.buyToken
        );
        continue;
      }

      const quoteBN = ethers.utils.parseUnits(
        formattedAmount,
        tokenConfig.decimals
      );
      const slippageMultiplier = ethers.BigNumber.from(10000).sub(
        ethers.BigNumber.from(tradeConfig.SLIPPAGE_BPS)
      );
      const minAmountOut = quoteBN.mul(slippageMultiplier).div(10000);

      instructions.push({
        chain: sellItem.chain,
        fromToken: pairing.sellToken,
        toToken: pairing.buyToken,
        fromAmount: formattedAmount,
        minAmountOut: minAmountOut.toString(),
        // expectedToAmount: "to_be_calculated",
        reason:
          "Optimized pairing via LP: Trade " +
          pairing.tradeAmount.toFixed(2) +
          " USD from " +
          pairing.sellToken +
          " to " +
          pairing.buyToken,
      });
    }
    return instructions;
  }
}
