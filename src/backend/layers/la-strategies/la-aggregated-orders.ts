import { PortfolioItem } from "../la-portfolio/la-get-portfolio";
import { DefaultTradeConfig } from "../la-trade-execution/la-trade-executor";
import { TOKEN_LIST } from "../utils/la-token-list";
import {
  ADJUSTMENT_FACTOR,
  analyzePortfolio,
  formatDecimal,
  RebalanceStrategy,
  StrategyConfig,
  TradeInstruction,
} from "./la-instructions";

/* =========================
   Strategy 2: Aggregate Orders
   =========================
   Instead of pairing every sell with every buy, this strategy aggregates orders
   by computing net imbalances and uses a greedy matching algorithm to reduce the number
   of trades. This helps optimize fee efficiency.
*/

// Simple structure to hold an aggregated order (in USD)
export interface AggregatedOrder {
  token: string;
  amount: number; // USD amount to trade
}
export class AggregateOrdersRebalanceStrategy implements RebalanceStrategy {
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

    // Aggregate net imbalances (difference between current and target)
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

    // Convert percentage differences to USD amounts with the safety margin applied
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

    // Greedy matching of aggregated orders (minimizes number of trades)
    let i = 0,
      j = 0;
    while (i < aggregatedSells.length && j < aggregatedBuys.length) {
      const sellOrder = aggregatedSells[i];
      const buyOrder = aggregatedBuys[j];
      const tradeAmount = Math.min(sellOrder.amount, buyOrder.amount);

      // Find the portfolio item for the sell token
      const sellItem = params.portfolio.find(
        (item) => item.token === sellOrder.token
      );
      if (!sellItem) {
        i++;
        continue;
      }
      const chainConfig = TOKEN_LIST[sellItem.chain];
      const tokenConfig =
        chainConfig.tokens[sellOrder.token as keyof typeof chainConfig.tokens];

      const tokenAmountToSell =
        (tradeAmount / parseFloat(sellItem.usdValue)) *
        parseFloat(sellItem.balance);
      const formattedAmount = formatDecimal(
        tokenAmountToSell,
        tokenConfig.decimals
      );
      try {
        ethers.utils.parseUnits(formattedAmount, tokenConfig.decimals);
      } catch (error) {
        console.log(
          "Skipping aggregated trade due to invalid amount format:",
          formattedAmount,
          sellOrder.token
        );
        // Adjust orders and continue matching
        if (sellOrder.amount <= buyOrder.amount) {
          i++;
        } else {
          j++;
        }
        continue;
      }
      if (parseFloat(formattedAmount) <= 0) {
        console.log(
          "Skipping zero amount aggregated trade from",
          sellOrder.token,
          "to",
          buyOrder.token
        );
        if (sellOrder.amount <= buyOrder.amount) {
          i++;
        } else {
          j++;
        }
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
        fromToken: sellOrder.token,
        toToken: buyOrder.token,
        fromAmount: formattedAmount,
        minAmountOut: minAmountOut.toString(),
        // expectedToAmount: "to_be_calculated",
        reason:
          "Aggregated order: Matching " +
          tradeAmount.toFixed(2) +
          " USD from " +
          sellOrder.token +
          " to " +
          buyOrder.token,
      });

      // Deduct the matched amount and move to the next order if fully matched
      sellOrder.amount -= tradeAmount;
      buyOrder.amount -= tradeAmount;
      if (sellOrder.amount === 0) i++;
      if (buyOrder.amount === 0) j++;
    }
    return instructions;
  }
}
