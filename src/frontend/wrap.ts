/**
 * wrap.ts
 *
 * This script wraps a specified percentage of ETH balance to WETH using Lit Actions.
 */

import { litAction } from "../../dist/lit-action";
import { env } from "../_env";
import { LitService } from "../vendors/lit-service";

// Configuration Constants
const WRAP_PERCENTAGE = 98; // Percentage of ETH to wrap (0-100)

const litService = new LitService();

// Connect to Lit Service
await litService.connect();

const sharedParams = {
  pkpPubkey: env.PKP_PUBLIC_KEY,
  DEFAULT_TRADE_CONFIG: {
    SLIPPAGE_BPS: 50,
    MAX_SLIPPAGE_BPS: 500,
    MINIMUM_TRADE_USD: 0.01,
    UNISWAP_FEE: 0.003,
    MAXIMUM_PRICE_IMPACT: 0.5,
    GAS_COST_BUFFER: 1.5,
    GAS_ESTIMATE_BASE: 300000,
    GAS_ESTIMATE_APPROVE: 50000,
  },
  CONFIRMATION_CONFIG: {
    confirmAll: true,
  },
  wrapPercentage: WRAP_PERCENTAGE,
};

// Execute wrap operation
const wrapResult = await litService.run({
  code: litAction,
  params: {
    part: 5, // New part for wrap operation
    ...sharedParams,
  },
});

console.log("[wrap] wrapResult:", wrapResult.logs);
const wrapResponse = JSON.parse((wrapResult as any).response);
console.log("[wrap] wrapResponse:", wrapResponse);

if (wrapResponse.txHash) {
  console.log("Successfully wrapped ETH to WETH, txHash:", wrapResponse.txHash);
} else {
  console.error("Failed to wrap ETH:", wrapResponse);
  process.exit(1);
}
process.exit();
