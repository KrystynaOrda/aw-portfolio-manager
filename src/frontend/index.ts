import "../utils/silent";
import { litAction } from "../../dist/lit-action";
import { env } from "../_env";
import { StrategyConfig } from "../backend/layers/la-strategies/la-instructions";
import { LitService } from "../vendors/lit-service";
import fs from "fs";
import path from "path";

const litService = new LitService();
await litService.connect();

enum PART {
  GENERATE_INSTRUCTIONS = 1,
  GENERATE_GAS_DATA = 2,
  EXECUTE_TXS = 3,
}

// Load strategy config from preferences.json
let STRATEGY_CONFIG: StrategyConfig;
try {
  const preferencesPath = path.join(
    process.cwd(),
    "src",
    "config",
    "preferences.json"
  );
  STRATEGY_CONFIG = JSON.parse(fs.readFileSync(preferencesPath, "utf-8"));
  console.log("Loaded strategy configuration:", STRATEGY_CONFIG);
} catch (error) {
  console.log("No preferences found, using default configuration");
  // Default settings (need to be adjusted by the AI agent)
  STRATEGY_CONFIG = {
    targetAllocations: {
      ETH: 0.5,
      OP: 0.2,
    },
    thresholdPercentage: 1,
  };
}

const sharedParams = {
  pkpPubkey: env.PKP_PUBLIC_KEY,
  DEFAULT_TRADE_CONFIG: {
    SLIPPAGE_BPS: 500,
    MAX_SLIPPAGE_BPS: 500,
    MINIMUM_TRADE_USD: 0.1,
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
const part1Result = await litService.run({
  code: litAction,
  params: {
    part: PART.GENERATE_INSTRUCTIONS,
    STRATEGY_CONFIG: STRATEGY_CONFIG,
    ...sharedParams,
  },
});

// console.log("[part 1] part1Result:", part1Result.logs);

const instructions = JSON.parse((part1Result as any).response).instructions;

// console.log("[part 1] part1Result.response:", instructions);

console.log(
  `<response>🔄 ${instructions.map((i: any) => i.reason).join("\n")}</response>`
);
// ------------------------------------------------------------------------------------------------
const part2Result = await litService.run({
  code: litAction,
  params: {
    part: PART.GENERATE_GAS_DATA,
    instructions: instructions,
    ...sharedParams,
  },
});

console.log("[part 2] part2Result:", part2Result.logs);

const gasDataObjs = JSON.parse((part2Result as any).response).gasDataObjs;
console.log("-----");
// console.log("[part 2] part2Result.response:", gasDataObjs);
console.log(
  `<response>🔄 ${gasDataObjs
    .map(
      (g: any) =>
        `Gas is currently ${Number(JSON.parse(g).gasPrice)} for chain: ${
          JSON.parse(g).chainId
        }`
    )
    .join("\n")}</response>`
);
// ------------------------------------------------------------------------------------------------
const part3Result = await litService.run({
  code: litAction,
  params: {
    part: PART.EXECUTE_TXS,
    instructions: instructions,
    gasDataObjs: gasDataObjs,
    ...sharedParams,
  },
});

// console.log("[part 3] part3Result.logs:", part3Result.logs);
const signedTxs = (JSON.parse((part3Result as any).response) as any).signedTxs;

// Output completion message
console.log(
  "<response>🔄 ✅ Trading execution completed. You can run me again anytime to adjust your strategy.</response>"
);

// Output transaction list
console.log("<response>🔄 📝 Transactions executed:</response>");

// Output each transaction separately
signedTxs.forEach((x: any) => {
  const chain = x.instruction.chain;
  const explorerUrl =
    chain === "optimism"
      ? "optimistic.etherscan.io"
      : chain === "polygon"
      ? "polygonscan.com"
      : chain === "arbitrum"
      ? "arbiscan.io"
      : "etherscan.io";

  x.txs.forEach((tx: any) => {
    console.log(`<response>https://${explorerUrl}/tx/${tx}</response>`);
  });
});

process.exit();
