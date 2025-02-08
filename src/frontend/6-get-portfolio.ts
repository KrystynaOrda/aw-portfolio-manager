/**
 * This script gets the portfolio of the user using Lit Actions.
 * The portfolio data will be written to a file for other scripts to consume.
 */
import { litAction } from "../../dist/lit-action";
import { env } from "../_env";
import { LitService } from "../vendors/lit-service";
import fs from "fs";
import path from "path";

enum PART {
  GET_PORTFOLIO = 6,
}

const litService = new LitService();

await litService.connect();

const sharedParams = {
  pkpPubkey: env.PKP_PUBLIC_KEY,
  DEFAULT_TRADE_CONFIG: {
    SLIPPAGE_BPS: 500,
    MAX_SLIPPAGE_BPS: 500,
    MINIMUM_TRADE_USD: 0.01,
    UNISWAP_FEE: 0.003,
    MAXIMUM_PRICE_IMPACT: 0.1,
    GAS_COST_BUFFER: 1.5,
    GAS_ESTIMATE_BASE: 300000,
    GAS_ESTIMATE_APPROVE: 50000,
  },
  CONFIRMATION_CONFIG: {
    confirmAll: true, // auto confirm all trades, as it requires memory to confirm each trade
  },
};

// ------------------------------------------------------------------------------------------------
// Get portfolio data
const getPortfolioResult = await litService.run({
  code: litAction,
  params: {
    part: PART.GET_PORTFOLIO,
    ...sharedParams,
  },
});

console.log("[get-portfolio] getPortfolioResult:", getPortfolioResult.logs);
const portfolioData = JSON.parse((getPortfolioResult as any).response);
console.log("[get-portfolio] Portfolio Data:", portfolioData);

// Write portfolio data to file
const outputPath = path.join(
  process.cwd(),
  "src",
  "config",
  "portfolio-data.json"
);
fs.writeFileSync(outputPath, JSON.stringify(portfolioData, null, 2));
console.log(`Portfolio data written to ${outputPath}`);

process.exit();
