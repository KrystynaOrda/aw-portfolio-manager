// portfolioManager.ts
// import { ethers } from "ethers";
// import { env } from "./_env";
import { getTokenPrice } from "../la-trade-execution/la-token-price";
import { TOKEN_LIST } from "../utils/la-token-list";

export type PortfolioItem = {
  chain: keyof typeof TOKEN_LIST;
  token: string;
  balance: string; // human readable balance (e.g. "1.234")
  usdValue: string; // human readable USD value (e.g. "123.45")
  percentage: number; // percentage of total USD value
};

export async function getPortfolio(address: string): Promise<PortfolioItem[]> {
  const portfolioItems: PortfolioItem[] = [];
  let totalUsdValue = 0;

  // Iterate over each chain in the token list
  for (const chainKey in TOKEN_LIST) {
    const chain = chainKey as keyof typeof TOKEN_LIST;
    const chainConfig = TOKEN_LIST[chain];
    const provider = new ethers.providers.JsonRpcProvider(chainConfig.rpcUrl);

    // Iterate over each token on the chain
    for (const tokenSymbol in chainConfig.tokens) {
      const tokenConfig =
        chainConfig.tokens[tokenSymbol as keyof typeof chainConfig.tokens];
      let balanceStr: string;

      // If tokenSymbol is "ETH", use the native balance API; otherwise, query the ERC20 contract
      if (tokenSymbol === "ETH") {
        const balanceBigNum = await provider.getBalance(address);
        balanceStr = ethers.utils.formatUnits(
          balanceBigNum,
          tokenConfig.decimals ?? 18
        );
      } else {
        const tokenContract = new ethers.Contract(
          tokenConfig.address,
          ["function balanceOf(address owner) view returns (uint256)"],
          provider
        );
        const balanceBigNum = await tokenContract.balanceOf(address);
        balanceStr = ethers.utils.formatUnits(
          balanceBigNum,
          tokenConfig.decimals ?? 18
        );
      }

      // Skip tokens with zero (or negligible) balance
      if (parseFloat(balanceStr) <= 0) continue;

      // Convert the token balance to USD by quoting against USDC
      let usdValueStr: string;
      try {
        usdValueStr = await getTokenPrice({
          chain,
          fromToken: tokenSymbol as keyof typeof chainConfig.tokens,
          toToken: "USDC" as keyof typeof chainConfig.tokens,
          amount: balanceStr,
        });
      } catch (error) {
        console.error(
          "Error fetching price for " + tokenSymbol + " on " + chain + ":",
          error
        );
        continue;
      }
      const usdValue = parseFloat(usdValueStr);

      if (usdValue <= 0) continue;

      totalUsdValue += usdValue;

      portfolioItems.push({
        chain,
        token: tokenSymbol,
        balance: balanceStr,
        usdValue: usdValueStr,
        percentage: 0, // placeholder to be computed next
      });
    }
  }

  // Compute each token's percentage of the total portfolio value
  const portfolioWithPercentages = portfolioItems.map((item) => ({
    ...item,
    percentage: totalUsdValue
      ? (parseFloat(item.usdValue) / totalUsdValue) * 100
      : 0,
  }));

  return portfolioWithPercentages;
}
