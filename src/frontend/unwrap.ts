/**
 * unwrap.ts
 *
 * This script unwraps a specified percentage of WETH balance to ETH using Lit Actions.
 */

import { litAction } from "../../dist/lit-action";
import { env } from "../_env";
import { LitService } from "../vendors/lit-service";

// Configuration Constants
const UNWRAP_PERCENTAGE = 10; // Percentage of WETH to unwrap (0-100)

if (UNWRAP_PERCENTAGE < 0 || UNWRAP_PERCENTAGE > 100) {
  console.error("UNWRAP_PERCENTAGE must be between 0 and 100");
  process.exit(1);
}

const litService = new LitService();

await litService.connect();

enum PART {
  GENERATE_INSTRUCTIONS = 1,
  GENERATE_GAS_DATA = 2,
  EXECUTE_TXS = 3,
  UNWRAP_WETH = 4,
}

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
  unwrapPercentage: UNWRAP_PERCENTAGE,
};

console.log(
  `Attempting to unwrap ${UNWRAP_PERCENTAGE}% of WETH balance to ETH...`
);

// ------------------------------------------------------------------------------------------------
// Unwrap WETH to ETH
const unwrapResult = await litService.run({
  code: litAction,
  params: {
    part: PART.UNWRAP_WETH,
    ...sharedParams,
  },
});

console.log("[unwrap] unwrapResult:", unwrapResult.logs);
const unwrapResponse = JSON.parse((unwrapResult as any).response);
console.log("[unwrap] unwrapResponse:", unwrapResponse);

if (unwrapResponse.message === "No WETH balance to unwrap") {
  console.log("No WETH to unwrap, proceeding with rebalancing...");
} else if (unwrapResponse.txHash) {
  console.log(
    `Successfully unwrapped ${UNWRAP_PERCENTAGE}% of WETH to ETH, txHash:`,
    unwrapResponse.txHash
  );
} else {
  console.error("Failed to unwrap WETH:", unwrapResponse);
  process.exit(1);
}
process.exit();
