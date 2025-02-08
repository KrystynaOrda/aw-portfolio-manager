import { PortfolioItem } from "../la-portfolio/la-get-portfolio";
import { DefaultTradeConfig } from "../la-trade-execution/la-trade-executor";
import { AggregateOrdersRebalanceStrategy } from "./la-aggregated-orders";
import { FullMatrixRebalanceStrategy } from "./la-full-matrix";
import { OptimizedPairingRebalanceStrategy } from "./la-optimized-paring";

// Safety adjustment factor (1% fee/slippage margin applied)
export const ADJUSTMENT_FACTOR = 0.99;

export interface StrategyConfig {
  targetAllocations: Record<string, number>;
  thresholdPercentage: number;
}

export interface TradeInstruction {
  chain: string;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  // expectedToAmount: string;
  reason: string;
  minAmountOut: string;
}

export enum RebalanceStrategyType {
  FullMatrix = "FULL_MATRIX",
  AggregateOrders = "AGGREGATE_ORDERS",
  OptimizedPairing = "OPTIMIZED_PAIRING",
}

// Base interface for all rebalancing strategies
export interface RebalanceStrategy {
  generateInstructions(
    params: { address: string; portfolio: PortfolioItem[] },
    config: StrategyConfig,
    tradeConfig: DefaultTradeConfig
  ): Promise<TradeInstruction[]>;
}

// Helper: Analyzes the portfolio and returns total value, current allocations, and lists of tokens to sell/buy
export function analyzePortfolio(
  portfolio: PortfolioItem[],
  targetAllocations: Record<string, number>,
  thresholdPercentage: number
) {
  const totalValue = portfolio.reduce(
    (sum, item) => sum + parseFloat(item.usdValue),
    0
  );
  const currentAllocations: Record<string, number> = {};
  portfolio.forEach((item) => {
    currentAllocations[item.token] = parseFloat(item.usdValue) / totalValue;
  });
  const tokensToSell: string[] = [];
  const tokensToBuy: string[] = [];
  for (const token in targetAllocations) {
    const targetAllocation = targetAllocations[token];
    const currentAllocation = currentAllocations[token] || 0;
    const deviation = Math.abs(currentAllocation - targetAllocation) * 100;
    if (deviation > thresholdPercentage) {
      if (currentAllocation > targetAllocation) {
        tokensToSell.push(token);
      } else {
        tokensToBuy.push(token);
      }
    }
  }
  return { totalValue, currentAllocations, tokensToSell, tokensToBuy };
}

// Helper: Formats a number to a fixed decimal count without scientific notation
export function formatDecimal(num: number, decimals: number): string {
  const fixed = num.toFixed(decimals);
  if (parseFloat(fixed) === 0 && num > 0) {
    return num.toFixed(20).replace(/\.?0+$/, "");
  }
  return fixed;
}

/* =========================
   Dispatcher Function
   =========================
   This exported function accepts a strategy type parameter and dispatches the
   call to the corresponding strategy implementation.
*/
export async function generateRebalanceInstructions(params: {
  address: string;
  portfolio: PortfolioItem[];
  config: StrategyConfig;
  tradeConfig: DefaultTradeConfig;
  strategyType: RebalanceStrategyType;
}): Promise<TradeInstruction[]> {
  let strategy: RebalanceStrategy;
  switch (params.strategyType) {
    case RebalanceStrategyType.FullMatrix:
      strategy = new FullMatrixRebalanceStrategy();
      break;
    case RebalanceStrategyType.AggregateOrders:
      strategy = new AggregateOrdersRebalanceStrategy();
      break;
    case RebalanceStrategyType.OptimizedPairing:
      strategy = new OptimizedPairingRebalanceStrategy();
      break;
    default:
      throw new Error("Unsupported strategy type");
  }
  return await strategy.generateInstructions(
    params,
    params.config,
    params.tradeConfig
  );
}
