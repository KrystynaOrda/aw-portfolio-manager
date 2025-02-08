// this is a lit action
import { getPortfolio } from "./layers/la-portfolio/la-get-portfolio";
import {
  generateRebalanceInstructions,
  RebalanceStrategyType,
  StrategyConfig,
  TradeInstruction,
} from "./layers/la-strategies/la-instructions";
import { TOKEN_LIST } from "./layers/utils/la-token-list";
import { LitSigner, pubkeyToEthAddress } from "./layers/utils/la-utils";

import {
  DefaultTradeConfig,
  executeTradeInstructions,
  ConfirmationConfig,
  generateGasDataObjects,
  GasDataObject,
} from "./layers/la-trade-execution/la-trade-executor";

declare global {
  var pkpPubkey: string;
  var ethers: typeof import("ethers");
  var DEFAULT_TRADE_CONFIG: DefaultTradeConfig;
  var CONFIRMATION_CONFIG: ConfirmationConfig;
  var part: number;
  var instructions: TradeInstruction[];
  var gasDataObjs: GasDataObject[];
  var signedTxs: string[];
  var wrapPercentage: number;
  var unwrapPercentage: number;
  var STRATEGY_CONFIG: StrategyConfig;
}

enum PART {
  GENERATE_INSTRUCTIONS = 1,
  GENERATE_GAS_DATA = 2,
  EXECUTE_TXS = 3,
  UNWRAP_WETH = 4,
  WRAP_ETH = 5,
  GET_PORTFOLIO = 6,
}

(async () => {
  const ethAddress = pubkeyToEthAddress(pkpPubkey);

  const provider = new ethers.providers.JsonRpcProvider(
    TOKEN_LIST.optimism.rpcUrl
  );

  const nativeBalance = await provider.getBalance(ethAddress);
  const balance = ethers.utils.formatEther(nativeBalance);
  console.log("ETH Native Balance:", balance);

  const portfolio = await getPortfolio(ethAddress);

  // Combine ETH and WETH balances if both exist
  const processedPortfolio = portfolio.reduce((acc, item) => {
    if (item.token === "WETH") {
      // Find existing ETH entry
      const ethEntry = acc.find(
        (p) => p.token === "ETH" && p.chain === item.chain
      );
      if (ethEntry) {
        // Combine the values
        ethEntry.balance = (
          parseFloat(ethEntry.balance) + parseFloat(item.balance)
        ).toString();
        ethEntry.usdValue = (
          parseFloat(ethEntry.usdValue) + parseFloat(item.usdValue)
        ).toString();
        return acc;
      }
      // If no ETH entry exists, treat WETH as ETH
      return [...acc, { ...item, token: "ETH" }];
    }
    return [...acc, item];
  }, [] as typeof portfolio);

  // Recalculate percentages
  const totalValue = processedPortfolio.reduce(
    (sum, item) => sum + parseFloat(item.usdValue),
    0
  );
  processedPortfolio.forEach((item) => {
    item.percentage = (parseFloat(item.usdValue) / totalValue) * 100;
  });

  console.log("portfolio:", processedPortfolio);

  if (part === PART.GET_PORTFOLIO) {
    Lit.Actions.setResponse({
      response: JSON.stringify({
        portfolio: processedPortfolio,
      }),
    });
    return;
  }

  // example portfolio
  // portfolio: [
  //   {
  //     chain: "optimism",
  //     token: "OP",
  //     balance: "0.953765343377110319",
  //     usdValue: "1.015481",
  //     percentage: 29.892972032253812
  //   },
  //   {
  //     chain: "optimism",
  //     token: "ETH",
  //     balance: "0.0005",
  //     usdValue: "1.359279",
  //     percentage: 40.01344105013282
  //   },
  //   {
  //     chain: "optimism",
  //     token: "WBTC",
  //     balance: "0.00001053",
  //     usdValue: "1.022296",
  //     percentage: 30.09358691761337
  //   }
  // ]

  // get strategy/rebalance instructions
  // example instructions
  // instructions: [
  //   {
  //     chain: "optimism",
  //     fromToken: "WBTC",
  //     toToken: "ETH",
  //     fromAmount: "0.00000346",
  //     reason: "Optimized pairing via LP: Trade 0.34 USD from WBTC to ETH"
  //   },
  //   {
  //     chain: "optimism",
  //     fromToken: "WBTC",
  //     toToken: "OP",
  //     fromAmount: "0.00000697",
  //     reason: "Optimized pairing via LP: Trade 0.68 USD from WBTC to OP"
  //   }
  // ]
  if (part === PART.GENERATE_INSTRUCTIONS) {
    const instructions = await generateRebalanceInstructions({
      address: ethAddress,
      portfolio: processedPortfolio,
      config: STRATEGY_CONFIG,
      tradeConfig: DEFAULT_TRADE_CONFIG,
      strategyType: RebalanceStrategyType.OptimizedPairing,
    });
    console.log("instructions:", instructions);
    Lit.Actions.setResponse({
      response: JSON.stringify({
        instructions: instructions,
      }),
    });
    return;
  }

  if (part === PART.GENERATE_GAS_DATA) {
    const gasDataObjs = await generateGasDataObjects({
      instructions: instructions,
      signerInfo: {
        address: ethAddress,
        pkpPubkey: pkpPubkey,
      },
      tradeConfig: DEFAULT_TRADE_CONFIG,
      confirmationConfig: CONFIRMATION_CONFIG,
    });
    Lit.Actions.setResponse({
      response: JSON.stringify({
        gasDataObjs: gasDataObjs,
      }),
    });
    return;
  }

  if (part === PART.EXECUTE_TXS) {
    // execute instructions
    const signedTxs = await executeTradeInstructions({
      instructions: instructions,
      gasDataObjs: gasDataObjs,
      signerInfo: {
        address: ethAddress,
        pkpPubkey: pkpPubkey,
      },
      tradeConfig: DEFAULT_TRADE_CONFIG,
      confirmationConfig: CONFIRMATION_CONFIG,
    });

    console.log("signedTxs:", signedTxs);

    Lit.Actions.setResponse({
      response: JSON.stringify({
        signedTxs: signedTxs,
      }),
    });
    return;
  }

  if (part === PART.UNWRAP_WETH) {
    // Unwrap WETH to ETH
    const WETH_ABI = [
      "function withdraw(uint256 amount) external",
      "function balanceOf(address account) external view returns (uint256)",
    ];

    const chainConfig = TOKEN_LIST.optimism;
    const wethContract = new ethers.Contract(
      chainConfig.tokens.ETH.address,
      WETH_ABI,
      provider
    );

    // Get WETH balance
    const wethBalance = await wethContract.balanceOf(ethAddress);
    if (wethBalance.eq(0)) {
      console.log("No WETH balance to unwrap");
      Lit.Actions.setResponse({
        response: JSON.stringify({
          message: "No WETH balance to unwrap",
        }),
      });
      return;
    }

    // Calculate unwrap amount based on percentage
    const unwrapPercentage = globalThis.unwrapPercentage || 100; // Default to 100% if not specified
    const unwrapAmount = wethBalance.mul(unwrapPercentage).div(100);

    // Get gas data
    const gasData = await LitSigner.getGasData(ethAddress, provider);

    // Create unwrap transaction
    const unwrapTx = {
      to: chainConfig.tokens.ETH.address,
      data: wethContract.interface.encodeFunctionData("withdraw", [
        unwrapAmount,
      ]),
      value: "0x0",
      gasLimit: ethers.BigNumber.from("100000"), // Standard gas limit for unwrap
      maxFeePerGas: ethers.BigNumber.from(gasData.maxFeePerGas),
      maxPriorityFeePerGas: ethers.BigNumber.from(gasData.maxPriorityFeePerGas),
      nonce: gasData.nonce,
      chainId: chainConfig.chainId,
      type: 2,
    };

    // Sign and send transaction
    const signedTx = await LitSigner.signTx({
      tx: unwrapTx,
      sigName: "unwrapSig",
      pkpPubkey: pkpPubkey,
    });

    const txHash = await LitSigner.sendTx(signedTx, provider);

    Lit.Actions.setResponse({
      response: JSON.stringify({
        txHash: txHash,
      }),
    });
    return;
  }

  if (part === PART.WRAP_ETH) {
    // Wrap ETH to WETH
    const WETH_ABI = [
      "function deposit() external payable",
      "function balanceOf(address account) external view returns (uint256)",
    ];

    const chainConfig = TOKEN_LIST.optimism;
    const wethContract = new ethers.Contract(
      chainConfig.tokens.ETH.address,
      WETH_ABI,
      provider
    );

    // Get ETH balance
    const ethBalance = await provider.getBalance(ethAddress);
    if (ethBalance.eq(0)) {
      console.log("No ETH balance to wrap");
      Lit.Actions.setResponse({
        response: JSON.stringify({
          message: "No ETH balance to wrap",
        }),
      });
      return;
    }

    // Calculate wrap amount based on percentage
    const wrapPercentage = globalThis.wrapPercentage || 50; // Default to 50% if not specified
    const wrapAmount = ethBalance.mul(wrapPercentage).div(100);

    // Get gas data
    const gasData = await LitSigner.getGasData(ethAddress, provider);
    const gasLimit = ethers.BigNumber.from("100000"); // Standard gas limit for wrap

    // Ensure we leave enough ETH for gas
    const gasPrice = ethers.BigNumber.from(gasData.maxFeePerGas);
    const gasCost = gasLimit.mul(gasPrice);
    const finalWrapAmount = wrapAmount.sub(gasCost);

    if (finalWrapAmount.lte(0)) {
      console.log("Insufficient ETH balance for wrapping after gas costs");
      Lit.Actions.setResponse({
        response: JSON.stringify({
          message: "Insufficient ETH balance for wrapping after gas costs",
        }),
      });
      return;
    }

    // Create wrap transaction
    const wrapTx = {
      to: chainConfig.tokens.ETH.address,
      data: wethContract.interface.encodeFunctionData("deposit", []),
      value: finalWrapAmount.toHexString(),
      gasLimit: gasLimit,
      maxFeePerGas: gasPrice,
      maxPriorityFeePerGas: ethers.BigNumber.from(gasData.maxPriorityFeePerGas),
      nonce: gasData.nonce,
      chainId: chainConfig.chainId,
      type: 2,
    };

    // Sign and send transaction
    const signedTx = await LitSigner.signTx({
      tx: wrapTx,
      sigName: "wrapSig",
      pkpPubkey: pkpPubkey,
    });

    const txHash = await LitSigner.sendTx(signedTx, provider);

    Lit.Actions.setResponse({
      response: JSON.stringify({
        txHash: txHash,
      }),
    });
    return;
  }
})();
