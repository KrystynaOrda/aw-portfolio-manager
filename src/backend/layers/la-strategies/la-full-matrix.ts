import { PortfolioItem } from "../la-portfolio/la-get-portfolio";
import { TOKEN_LIST } from "../utils/la-token-list";
import { DefaultTradeConfig } from "../la-trade-execution/la-trade-executor";
import {
  ADJUSTMENT_FACTOR,
  analyzePortfolio,
  formatDecimal,
  RebalanceStrategy,
  StrategyConfig,
  TradeInstruction,
} from "./la-instructions";

/* =========================
   Strategy 1: Full Matrix
   =========================
   This is the original approach which generates instructions for all possible
   sell-buy pairs.
*/
export class FullMatrixRebalanceStrategy implements RebalanceStrategy {
  async generateInstructions(
    params: { address: string; portfolio: PortfolioItem[] },
    config: StrategyConfig,
    tradeConfig: DefaultTradeConfig
  ): Promise<TradeInstruction[]> {
    const instructions: TradeInstruction[] = [];
    const { totalValue, currentAllocations, tokensToSell, tokensToBuy } =
      analyzePortfolio(
        params.portfolio,
        config.targetAllocations,
        config.thresholdPercentage
      );

    // Log portfolio analysis
    console.log("\\nPortfolio Analysis:");
    console.log("Total Portfolio Value:", totalValue.toFixed(2), "USDC");
    console.log("\\nCurrent Allocations:");
    for (const token in currentAllocations) {
      const currentPct = (currentAllocations[token] * 100).toFixed(2);
      const targetPct = ((config.targetAllocations[token] || 0) * 100).toFixed(
        2
      );
      const deviation = (
        Math.abs(
          currentAllocations[token] - (config.targetAllocations[token] || 0)
        ) * 100
      ).toFixed(2);
      console.log(
        token +
          ": " +
          currentPct +
          "% (Target: " +
          targetPct +
          "%, Deviation: " +
          deviation +
          "%)"
      );
    }
    console.log("\\nThreshold:", config.thresholdPercentage, "%");

    // Generate full matrix: for every sell token, pair with every buy token
    for (const sellToken of tokensToSell) {
      for (const buyToken of tokensToBuy) {
        const sellItem = params.portfolio.find(
          (item) => item.token === sellToken
        );
        if (!sellItem) continue;

        const currentSellAlloc = currentAllocations[sellToken];
        const targetSellAlloc = config.targetAllocations[sellToken];
        const currentBuyAlloc = currentAllocations[buyToken] || 0;
        const targetBuyAlloc = config.targetAllocations[buyToken];

        // Calculate excess allocation and derive the trade size (in USD)
        const excessPercentage = currentSellAlloc - targetSellAlloc;
        const tradeSize = excessPercentage * totalValue * ADJUSTMENT_FACTOR;
        const tokenAmountToSell =
          (tradeSize / parseFloat(sellItem.usdValue)) *
          parseFloat(sellItem.balance);

        const chainConfig = TOKEN_LIST[sellItem.chain];
        const tokenConfig =
          chainConfig.tokens[sellToken as keyof typeof chainConfig.tokens];

        // Format and validate the token amount
        const formattedAmount = formatDecimal(
          tokenAmountToSell,
          tokenConfig.decimals
        );
        try {
          ethers.utils.parseUnits(formattedAmount, tokenConfig.decimals);
        } catch (error) {
          console.log(
            "Skipping trade due to invalid amount format:",
            formattedAmount,
            sellToken
          );
          continue;
        }
        if (parseFloat(formattedAmount) <= 0) {
          console.log(
            "Skipping zero amount trade from",
            sellToken,
            "to",
            buyToken
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
          fromToken: sellToken,
          toToken: buyToken,
          fromAmount: formattedAmount,
          minAmountOut: minAmountOut.toString(),
          // expectedToAmount: "to_be_calculated",
          reason:
            "Rebalancing: " +
            sellToken +
            " is " +
            (excessPercentage * 100).toFixed(2) +
            "% over target, " +
            buyToken +
            " is " +
            ((currentBuyAlloc - targetBuyAlloc) * 100).toFixed(2) +
            "% under target",
        });
      }
    }
    return instructions;
  }
}
