export const litAction = `(() => {
  // src/layers/utils/la-token-list.ts
  var TOKEN_LIST = {
    optimism: {
      chainId: 10,
      rpcUrl: "https://mainnet.optimism.io",
      explorer: "https://optimistic.etherscan.io",
      tokens: {
        OP: {
          address: "0x4200000000000000000000000000000000000042",
          name: "Optimism",
          decimals: 18
        },
        ETH: {
          address: "0x4200000000000000000000000000000000000006",
          name: "Ether",
          decimals: 18
        },
        WETH: {
          address: "0x4200000000000000000000000000000000000006",
          name: "Wrapped Ether",
          decimals: 18
        },
        USDC: {
          address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
          name: "USD Coin",
          decimals: 6
        },
        DAI: {
          address: "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1",
          name: "Dai Stablecoin",
          decimals: 18
        },
        WBTC: {
          address: "0x68f180fcce6836688e9084f035309e29bf0a2095",
          name: "Wrapped BTC",
          decimals: 8
        }
      },
      uniswap: {
        quoter: "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6",
        swapRouter02: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
        fee: 3000
      }
    },
    arbitrum: {
      chainId: 42161,
      rpcUrl: "https://arbitrum.llamarpc.com",
      explorer: "https://arbiscan.io",
      tokens: {
        ETH: {
          address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
          name: "Ether",
          decimals: 18
        },
        USDC: {
          address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
          name: "USD Coin",
          decimals: 6
        },
        DAI: {
          address: "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1",
          name: "Dai Stablecoin",
          decimals: 18
        },
        WBTC: {
          address: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
          name: "Wrapped BTC",
          decimals: 8
        }
      },
      uniswap: {
        quoter: "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6",
        swapRouter02: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
        fee: 3000
      }
    }
  };

  // src/layers/la-trade-execution/la-token-price.ts
  async function getTokenPrice(params) {
    const { fromToken, toToken, amount, chain } = params;
    const chainConfig = TOKEN_LIST[chain];
    const provider = new ethers.providers.JsonRpcProvider(chainConfig.rpcUrl);
    const quoterContract = new ethers.Contract(chainConfig.uniswap.quoter, [
      "function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)"
    ], provider);
    const amountIn = ethers.utils.parseUnits(amount, chainConfig.tokens[fromToken].decimals ?? 18);
    const amountOut = await quoterContract.callStatic.quoteExactInputSingle(chainConfig.tokens[fromToken].address, chainConfig.tokens[toToken].address, chainConfig.uniswap.fee, amountIn, 0);
    const quote = ethers.utils.formatUnits(amountOut, chainConfig.tokens[toToken].decimals ?? 18);
    console.log("\uD83D\uDCB2 Quote: " + quote + " " + toToken + " for " + amount + " " + fromToken + " on " + chain);
    return quote;
  }

  // src/layers/la-portfolio/la-get-portfolio.ts
  async function getPortfolio(address) {
    const portfolioItems = [];
    let totalUsdValue = 0;
    for (const chainKey in TOKEN_LIST) {
      const chain = chainKey;
      const chainConfig = TOKEN_LIST[chain];
      const provider = new ethers.providers.JsonRpcProvider(chainConfig.rpcUrl);
      for (const tokenSymbol in chainConfig.tokens) {
        const tokenConfig = chainConfig.tokens[tokenSymbol];
        let balanceStr;
        if (tokenSymbol === "ETH") {
          const balanceBigNum = await provider.getBalance(address);
          balanceStr = ethers.utils.formatUnits(balanceBigNum, tokenConfig.decimals ?? 18);
        } else {
          const tokenContract = new ethers.Contract(tokenConfig.address, ["function balanceOf(address owner) view returns (uint256)"], provider);
          const balanceBigNum = await tokenContract.balanceOf(address);
          balanceStr = ethers.utils.formatUnits(balanceBigNum, tokenConfig.decimals ?? 18);
        }
        if (parseFloat(balanceStr) <= 0)
          continue;
        let usdValueStr;
        try {
          usdValueStr = await getTokenPrice({
            chain,
            fromToken: tokenSymbol,
            toToken: "USDC",
            amount: balanceStr
          });
        } catch (error) {
          console.error("Error fetching price for " + tokenSymbol + " on " + chain + ":", error);
          continue;
        }
        const usdValue = parseFloat(usdValueStr);
        if (usdValue <= 0)
          continue;
        totalUsdValue += usdValue;
        portfolioItems.push({
          chain,
          token: tokenSymbol,
          balance: balanceStr,
          usdValue: usdValueStr,
          percentage: 0
        });
      }
    }
    const portfolioWithPercentages = portfolioItems.map((item) => ({
      ...item,
      percentage: totalUsdValue ? parseFloat(item.usdValue) / totalUsdValue * 100 : 0
    }));
    return portfolioWithPercentages;
  }

  // src/layers/la-strategies/la-aggregated-orders.ts
  class AggregateOrdersRebalanceStrategy {
    async generateInstructions(params, config, tradeConfig) {
      const instructions2 = [];
      const { totalValue, currentAllocations } = analyzePortfolio(params.portfolio, config.targetAllocations, config.thresholdPercentage);
      const aggregatedSellOrders = {};
      const aggregatedBuyOrders = {};
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
      const aggregatedSells = [];
      const aggregatedBuys = [];
      for (const token in aggregatedSellOrders) {
        aggregatedSells.push({
          token,
          amount: aggregatedSellOrders[token] * totalValue * ADJUSTMENT_FACTOR
        });
      }
      for (const token in aggregatedBuyOrders) {
        aggregatedBuys.push({
          token,
          amount: aggregatedBuyOrders[token] * totalValue * ADJUSTMENT_FACTOR
        });
      }
      let i = 0, j = 0;
      while (i < aggregatedSells.length && j < aggregatedBuys.length) {
        const sellOrder = aggregatedSells[i];
        const buyOrder = aggregatedBuys[j];
        const tradeAmount = Math.min(sellOrder.amount, buyOrder.amount);
        const sellItem = params.portfolio.find((item) => item.token === sellOrder.token);
        if (!sellItem) {
          i++;
          continue;
        }
        const chainConfig = TOKEN_LIST[sellItem.chain];
        const tokenConfig = chainConfig.tokens[sellOrder.token];
        const tokenAmountToSell = tradeAmount / parseFloat(sellItem.usdValue) * parseFloat(sellItem.balance);
        const formattedAmount = formatDecimal(tokenAmountToSell, tokenConfig.decimals);
        try {
          ethers.utils.parseUnits(formattedAmount, tokenConfig.decimals);
        } catch (error) {
          console.log("Skipping aggregated trade due to invalid amount format:", formattedAmount, sellOrder.token);
          if (sellOrder.amount <= buyOrder.amount) {
            i++;
          } else {
            j++;
          }
          continue;
        }
        if (parseFloat(formattedAmount) <= 0) {
          console.log("Skipping zero amount aggregated trade from", sellOrder.token, "to", buyOrder.token);
          if (sellOrder.amount <= buyOrder.amount) {
            i++;
          } else {
            j++;
          }
          continue;
        }
        const quoteBN = ethers.utils.parseUnits(formattedAmount, tokenConfig.decimals);
        const slippageMultiplier = ethers.BigNumber.from(1e4).sub(ethers.BigNumber.from(tradeConfig.SLIPPAGE_BPS));
        const minAmountOut = quoteBN.mul(slippageMultiplier).div(1e4);
        instructions2.push({
          chain: sellItem.chain,
          fromToken: sellOrder.token,
          toToken: buyOrder.token,
          fromAmount: formattedAmount,
          minAmountOut: minAmountOut.toString(),
          reason: "Aggregated order: Matching " + tradeAmount.toFixed(2) + " USD from " + sellOrder.token + " to " + buyOrder.token
        });
        sellOrder.amount -= tradeAmount;
        buyOrder.amount -= tradeAmount;
        if (sellOrder.amount === 0)
          i++;
        if (buyOrder.amount === 0)
          j++;
      }
      return instructions2;
    }
  }

  // src/layers/la-strategies/la-full-matrix.ts
  class FullMatrixRebalanceStrategy {
    async generateInstructions(params, config, tradeConfig) {
      const instructions2 = [];
      const { totalValue, currentAllocations, tokensToSell, tokensToBuy } = analyzePortfolio(params.portfolio, config.targetAllocations, config.thresholdPercentage);
      console.log("\\nPortfolio Analysis:");
      console.log("Total Portfolio Value:", totalValue.toFixed(2), "USDC");
      console.log("\\nCurrent Allocations:");
      for (const token in currentAllocations) {
        const currentPct = (currentAllocations[token] * 100).toFixed(2);
        const targetPct = ((config.targetAllocations[token] || 0) * 100).toFixed(2);
        const deviation = (Math.abs(currentAllocations[token] - (config.targetAllocations[token] || 0)) * 100).toFixed(2);
        console.log(token + ": " + currentPct + "% (Target: " + targetPct + "%, Deviation: " + deviation + "%)");
      }
      console.log("\\nThreshold:", config.thresholdPercentage, "%");
      for (const sellToken of tokensToSell) {
        for (const buyToken of tokensToBuy) {
          const sellItem = params.portfolio.find((item) => item.token === sellToken);
          if (!sellItem)
            continue;
          const currentSellAlloc = currentAllocations[sellToken];
          const targetSellAlloc = config.targetAllocations[sellToken];
          const currentBuyAlloc = currentAllocations[buyToken] || 0;
          const targetBuyAlloc = config.targetAllocations[buyToken];
          const excessPercentage = currentSellAlloc - targetSellAlloc;
          const tradeSize = excessPercentage * totalValue * ADJUSTMENT_FACTOR;
          const tokenAmountToSell = tradeSize / parseFloat(sellItem.usdValue) * parseFloat(sellItem.balance);
          const chainConfig = TOKEN_LIST[sellItem.chain];
          const tokenConfig = chainConfig.tokens[sellToken];
          const formattedAmount = formatDecimal(tokenAmountToSell, tokenConfig.decimals);
          try {
            ethers.utils.parseUnits(formattedAmount, tokenConfig.decimals);
          } catch (error) {
            console.log("Skipping trade due to invalid amount format:", formattedAmount, sellToken);
            continue;
          }
          if (parseFloat(formattedAmount) <= 0) {
            console.log("Skipping zero amount trade from", sellToken, "to", buyToken);
            continue;
          }
          const quoteBN = ethers.utils.parseUnits(formattedAmount, tokenConfig.decimals);
          const slippageMultiplier = ethers.BigNumber.from(1e4).sub(ethers.BigNumber.from(tradeConfig.SLIPPAGE_BPS));
          const minAmountOut = quoteBN.mul(slippageMultiplier).div(1e4);
          instructions2.push({
            chain: sellItem.chain,
            fromToken: sellToken,
            toToken: buyToken,
            fromAmount: formattedAmount,
            minAmountOut: minAmountOut.toString(),
            reason: "Rebalancing: " + sellToken + " is " + (excessPercentage * 100).toFixed(2) + "% over target, " + buyToken + " is " + ((currentBuyAlloc - targetBuyAlloc) * 100).toFixed(2) + "% under target"
          });
        }
      }
      return instructions2;
    }
  }

  // src/layers/la-strategies/la-optimized-paring.ts
  function solveOptimalPairing(sells, buys) {
    const pairings = [];
    let i = 0, j = 0;
    while (i < sells.length && j < buys.length) {
      const tradeAmount = Math.min(sells[i].amount, buys[j].amount);
      pairings.push({
        sellToken: sells[i].token,
        buyToken: buys[j].token,
        tradeAmount
      });
      sells[i].amount -= tradeAmount;
      buys[j].amount -= tradeAmount;
      if (sells[i].amount === 0)
        i++;
      if (buys[j].amount === 0)
        j++;
    }
    return pairings;
  }

  class OptimizedPairingRebalanceStrategy {
    async generateInstructions(params, config, tradeConfig) {
      const instructions2 = [];
      const { totalValue, currentAllocations } = analyzePortfolio(params.portfolio, config.targetAllocations, config.thresholdPercentage);
      const aggregatedSellOrders = {};
      const aggregatedBuyOrders = {};
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
      const aggregatedSells = [];
      const aggregatedBuys = [];
      for (const token in aggregatedSellOrders) {
        aggregatedSells.push({
          token,
          amount: aggregatedSellOrders[token] * totalValue * ADJUSTMENT_FACTOR
        });
      }
      for (const token in aggregatedBuyOrders) {
        aggregatedBuys.push({
          token,
          amount: aggregatedBuyOrders[token] * totalValue * ADJUSTMENT_FACTOR
        });
      }
      const optimalPairings = solveOptimalPairing(aggregatedSells, aggregatedBuys);
      for (const pairing of optimalPairings) {
        const sellItem = params.portfolio.find((item) => item.token === pairing.sellToken);
        if (!sellItem)
          continue;
        const chainConfig = TOKEN_LIST[sellItem.chain];
        const tokenConfig = chainConfig.tokens[pairing.sellToken];
        const tokenAmountToSell = pairing.tradeAmount / parseFloat(sellItem.usdValue) * parseFloat(sellItem.balance);
        const formattedAmount = formatDecimal(tokenAmountToSell, tokenConfig.decimals);
        try {
          ethers.utils.parseUnits(formattedAmount, tokenConfig.decimals);
        } catch (error) {
          console.log("Skipping optimized trade due to invalid amount format:", formattedAmount, pairing.sellToken);
          continue;
        }
        if (parseFloat(formattedAmount) <= 0) {
          console.log("Skipping zero amount optimized trade from", pairing.sellToken, "to", pairing.buyToken);
          continue;
        }
        const quoteBN = ethers.utils.parseUnits(formattedAmount, tokenConfig.decimals);
        const slippageMultiplier = ethers.BigNumber.from(1e4).sub(ethers.BigNumber.from(tradeConfig.SLIPPAGE_BPS));
        const minAmountOut = quoteBN.mul(slippageMultiplier).div(1e4);
        instructions2.push({
          chain: sellItem.chain,
          fromToken: pairing.sellToken,
          toToken: pairing.buyToken,
          fromAmount: formattedAmount,
          minAmountOut: minAmountOut.toString(),
          reason: "Optimized pairing via LP: Trade " + pairing.tradeAmount.toFixed(2) + " USD from " + pairing.sellToken + " to " + pairing.buyToken
        });
      }
      return instructions2;
    }
  }

  // src/layers/la-strategies/la-instructions.ts
  var ADJUSTMENT_FACTOR = 0.99;
  function analyzePortfolio(portfolio, targetAllocations, thresholdPercentage) {
    const totalValue = portfolio.reduce((sum, item) => sum + parseFloat(item.usdValue), 0);
    const currentAllocations = {};
    portfolio.forEach((item) => {
      currentAllocations[item.token] = parseFloat(item.usdValue) / totalValue;
    });
    const tokensToSell = [];
    const tokensToBuy = [];
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
  function formatDecimal(num, decimals) {
    const fixed = num.toFixed(decimals);
    if (parseFloat(fixed) === 0 && num > 0) {
      return num.toFixed(20).replace(/\.?0+$/, "");
    }
    return fixed;
  }
  async function generateRebalanceInstructions(params) {
    let strategy;
    switch (params.strategyType) {
      case "FULL_MATRIX" /* FullMatrix */:
        strategy = new FullMatrixRebalanceStrategy;
        break;
      case "AGGREGATE_ORDERS" /* AggregateOrders */:
        strategy = new AggregateOrdersRebalanceStrategy;
        break;
      case "OPTIMIZED_PAIRING" /* OptimizedPairing */:
        strategy = new OptimizedPairingRebalanceStrategy;
        break;
      default:
        throw new Error("Unsupported strategy type");
    }
    return await strategy.generateInstructions(params, params.config, params.tradeConfig);
  }

  // src/layers/utils/la-utils.ts
  function pubkeyToEthAddress(pkpPubkey2) {
    return ethers.utils.computeAddress(new Uint8Array(pkpPubkey2.replace("0x", "").match(/.{1,2}/g).map((byte) => parseInt(byte, 16))));
  }
  var LitSigner;
  ((LitSigner) => {
    async function signTx({
      tx,
      sigName,
      pkpPubkey: pkpPubkey2
    }) {
      console.log("signing tx: ", sigName);
      const pkForLit = pkpPubkey2.startsWith("0x") ? pkpPubkey2.slice(2) : pkpPubkey2;
      const sig = await Lit.Actions.signAndCombineEcdsa({
        toSign: ethers.utils.arrayify(ethers.utils.keccak256(ethers.utils.serializeTransaction(tx))),
        publicKey: pkForLit,
        sigName
      });
      return ethers.utils.serializeTransaction(tx, ethers.utils.joinSignature({
        r: "0x" + JSON.parse(sig).r.substring(2),
        s: "0x" + JSON.parse(sig).s,
        v: JSON.parse(sig).v
      }));
    }
    LitSigner.signTx = signTx;
    async function getGasData(ethAddress, provider) {
      console.log("Getting gas data...");
      const gasData = await Lit.Actions.runOnce({ waitForResponse: true, name: "gasPriceGetter" }, async () => {
        const baseFeeHistory = await provider.send("eth_feeHistory", [
          "0x1",
          "latest",
          []
        ]);
        const baseFee = ethers.BigNumber.from(baseFeeHistory.baseFeePerGas[0]);
        const nonce = await provider.getTransactionCount(ethAddress);
        const priorityFee = baseFee.div(4);
        const maxFee = baseFee.mul(2);
        return JSON.stringify({
          maxFeePerGas: maxFee.toHexString(),
          maxPriorityFeePerGas: priorityFee.toHexString(),
          nonce
        });
      });
      console.log("Gas data:", JSON.parse(gasData));
      return JSON.parse(gasData);
    }
    LitSigner.getGasData = getGasData;
    async function estimateGasLimit(provider, swapRouterAddress, ethAddress, tokenInContract, amount, isApproval, params, swapParams) {
      console.log("Estimating gas limit...");
      try {
        let estimatedGas;
        if (isApproval) {
          estimatedGas = await tokenInContract.estimateGas.approve(swapRouterAddress, amount, { from: ethAddress });
        } else if (swapParams) {
          const routerInterface = new ethers.utils.Interface([
            "function exactInputSingle((address,address,uint24,address,uint256,uint256,uint160)) external payable returns (uint256)"
          ]);
          const routerContract = new ethers.Contract(swapRouterAddress, routerInterface, provider);
          estimatedGas = await routerContract.estimateGas.exactInputSingle([
            params.tokenIn,
            params.tokenOut,
            swapParams.fee,
            ethAddress,
            amount,
            swapParams.amountOutMin,
            0
          ], { from: ethAddress });
        } else {
          throw new Error("Missing swap parameters for gas estimation");
        }
        const gasLimit = estimatedGas.mul(120).div(100);
        console.log("Estimated gas limit:", gasLimit.toString());
        return gasLimit;
      } catch (error) {
        console.error("Error estimating gas:", error);
        const fallbackGas = isApproval ? "300000" : "500000";
        console.log("Using fallback gas limit:", fallbackGas);
        return ethers.BigNumber.from(fallbackGas);
      }
    }
    LitSigner.estimateGasLimit = estimateGasLimit;
    async function getApproveTx(params) {
      const { instruction, ethAddress, provider, swapRouterAddress, amountIn } = params;
      const chainId = TOKEN_LIST[instruction.chain].chainId;
      const gasLimit = await LitSigner.estimateGasLimit(provider, swapRouterAddress, ethAddress, instruction.fromToken, amountIn, true, {
        chainId,
        tokenIn: instruction.fromToken,
        tokenOut: instruction.toToken
      });
      const APPROVE_ABI = [
        "function approve(address spender, uint256 amount) external returns (bool)"
      ];
      const tokenInterface = new ethers.utils.Interface(APPROVE_ABI);
      const txData = tokenInterface.encodeFunctionData("approve", [
        swapRouterAddress,
        amountIn
      ]);
      const tx = {
        to: swapRouterAddress,
        data: txData,
        value: "0x0",
        gasLimit: gasLimit.toHexString(),
        maxFeePerGas: params.gasData.maxFeePerGas,
        maxPriorityFeePerGas: params.gasData.maxPriorityFeePerGas,
        nonce: params.gasData.nonce,
        chainId,
        type: 2
      };
      return tx;
    }
    LitSigner.getApproveTx = getApproveTx;
    async function getSwapTx(params) {
      const { instruction, ethAddress, provider, swapRouterAddress, amountIn } = params;
      const chainId = TOKEN_LIST[instruction.chain].chainId;
      const chainConfig = TOKEN_LIST[instruction.chain];
      const gasLimit = await LitSigner.estimateGasLimit(provider, swapRouterAddress, ethAddress, instruction.fromToken, amountIn, false, {
        chainId,
        tokenIn: instruction.fromToken,
        tokenOut: instruction.toToken
      }, {
        fee: chainConfig.uniswap.fee,
        amountOutMin: params.amountOutMinimum
      });
      const SWAP_ROUTER_ABI = [
        "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)"
      ];
      const routerInterface = new ethers.utils.Interface(SWAP_ROUTER_ABI);
      const fromTokenConfig = chainConfig.tokens[instruction.fromToken];
      const toTokenConfig = chainConfig.tokens[instruction.toToken];
      const txData = routerInterface.encodeFunctionData("exactInputSingle", [
        [
          fromTokenConfig.address,
          toTokenConfig.address,
          chainConfig.uniswap.fee,
          ethAddress,
          Math.floor(Date.now() / 1000) + 300,
          amountIn,
          params.amountOutMinimum,
          0
        ]
      ]);
      const tx = {
        to: swapRouterAddress,
        data: txData,
        value: params.isEthTrade ? amountIn : "0x0",
        gasLimit: gasLimit.toHexString(),
        maxFeePerGas: params.gasData.maxFeePerGas.mul(2),
        maxPriorityFeePerGas: params.gasData.maxPriorityFeePerGas.mul(2),
        nonce: params.gasData.nonce,
        chainId,
        type: 2
      };
      return tx;
    }
    LitSigner.getSwapTx = getSwapTx;
    async function sendTx(signedTx, provider) {
      try {
        const txHash = await Lit.Actions.runOnce({ waitForResponse: true, name: "txnSender" }, async () => {
          try {
            const receipt = await provider.sendTransaction(signedTx);
            return receipt.hash;
          } catch (error) {
            return JSON.stringify(error.message, null, 2);
          }
        });
        return txHash;
      } catch (error) {
        console.error("Error in sendTx:", error);
        return { error: error.message || "Unknown error in sendTx" };
      }
    }
    LitSigner.sendTx = sendTx;
  })(LitSigner ||= {});

  // src/layers/la-trade-execution/la-trade-executor.ts
  async function generateGasDataObjects(params) {
    const { tradeConfig, instructions: instructions2, confirmationConfig, signerInfo } = params;
    const gasDataObjs2 = [];
    for (const instruction of instructions2) {
      const litProviderRpcUrl = await Lit.Actions.getRpcUrl({
        chain: instruction.chain
      });
      const provider = new ethers.providers.JsonRpcProvider(litProviderRpcUrl);
      console.log("--- start run once ---");
      let gasData = await Lit.Actions.runOnce({
        waitForResponse: true,
        name: "getGasPrice"
      }, async () => {
        const errors = [];
        let baseFeeHistory;
        let baseFee;
        let priorityFee;
        let maxFee;
        let gasPrice;
        try {
          baseFeeHistory = await provider.send("eth_feeHistory", [
            "0x1",
            "latest",
            []
          ]);
        } catch (error) {
          errors.push("Failed to get base fee history: " + (error?.message || "Unknown error"));
          baseFeeHistory = { baseFeePerGas: ["0x0"] };
        }
        try {
          gasPrice = await provider.getGasPrice();
        } catch (error) {
          errors.push("Failed to get gas price: " + (error?.message || "Unknown error"));
          gasPrice = ethers.BigNumber.from("0");
        }
        try {
          baseFee = ethers.BigNumber.from(baseFeeHistory.baseFeePerGas[0]);
          priorityFee = baseFee.div(4);
          maxFee = baseFee.mul(2);
        } catch (error) {
          errors.push("Failed to calculate fees: " + (error?.message || "Unknown error"));
          baseFee = ethers.BigNumber.from("0");
          priorityFee = ethers.BigNumber.from("0");
          maxFee = ethers.BigNumber.from("0");
        }
        return JSON.stringify({
          gasPrice: gasPrice.toHexString(),
          chainId: TOKEN_LIST[instruction.chain].chainId,
          maxFeePerGas: maxFee.toHexString(),
          maxPriorityFeePerGas: priorityFee.toHexString(),
          errors
        });
      });
      console.log("--- end run once ---");
      gasDataObjs2.push(gasData);
    }
    return gasDataObjs2;
  }
  async function executeTradeInstructions(params) {
    const { tradeConfig, instructions: instructions2, confirmationConfig, signerInfo } = params;
    const results = [];
    let nonceCounter = 0;
    for (let i = 0;i < instructions2.length; i++) {
      const instruction = instructions2[i];
      const gasDataObj = JSON.parse(gasDataObjs[i]);
      console.log("gasDataObj:", gasDataObj);
      gasDataObj.gasPrice = ethers.BigNumber.from(gasDataObj.gasPrice);
      gasDataObj.chainId = Number(gasDataObj.chainId);
      gasDataObj.maxFeePerGas = ethers.BigNumber.from(gasDataObj.maxFeePerGas);
      gasDataObj.maxPriorityFeePerGas = ethers.BigNumber.from(gasDataObj.maxPriorityFeePerGas);
      console.log("gasDataObj 2:", gasDataObj);
      const litProviderRpcUrl = await Lit.Actions.getRpcUrl({
        chain: instruction.chain
      });
      const provider = new ethers.providers.JsonRpcProvider(litProviderRpcUrl);
      const chainConfig = TOKEN_LIST[instruction.chain];
      const fromTokenConfig = chainConfig.tokens[instruction.fromToken];
      const toTokenConfig = chainConfig.tokens[instruction.toToken];
      const amountIn = ethers.utils.parseUnits(instruction.fromAmount, fromTokenConfig.decimals || 18);
      console.log("---------- get approve tx ---------");
      const APPROVE_ABI = [
        "function approve(address spender, uint256 amount) external returns (bool)"
      ];
      const tokenInterface = new ethers.utils.Interface(APPROVE_ABI);
      const txData = tokenInterface.encodeFunctionData("approve", [
        chainConfig.uniswap.swapRouter02,
        amountIn.mul(110).div(100)
      ]);
      const nonce = await provider.getTransactionCount(signerInfo.address);
      console.log("txData:", txData);
      const approveTx = {
        to: fromTokenConfig.address,
        data: txData,
        value: "0x0",
        gasLimit: ethers.BigNumber.from(tradeConfig.GAS_ESTIMATE_BASE),
        maxFeePerGas: gasDataObj.maxFeePerGas.mul(1000).div(100),
        maxPriorityFeePerGas: gasDataObj.maxPriorityFeePerGas.mul(1000).div(100),
        nonce: nonce + nonceCounter,
        chainId: gasDataObj.chainId,
        type: 2
      };
      console.log("approveTx:", approveTx);
      console.log("---------- sign approve tx ---------");
      const signedApproveTx = await LitSigner.signTx({
        tx: approveTx,
        sigName: "approveSig",
        pkpPubkey: signerInfo.pkpPubkey
      });
      console.log("signedApproveTx:", signedApproveTx);
      const approveTxHash = await LitSigner.sendTx(signedApproveTx, provider);
      nonceCounter++;
      console.log("approveTxHash:", approveTxHash);
      console.log("---------- get swap tx ---------");
      const SWAP_ROUTER_ABI = [
        "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)"
      ];
      const routerInterface = new ethers.utils.Interface(SWAP_ROUTER_ABI);
      const swapTxData = routerInterface.encodeFunctionData("exactInputSingle", [
        [
          fromTokenConfig.address,
          toTokenConfig.address,
          chainConfig.uniswap.fee,
          signerInfo.address,
          Math.floor(Date.now() / 1000) + 300,
          amountIn,
          instruction.minAmountOut,
          0
        ]
      ]);
      console.log("swapTxData:", swapTxData);
      const swapTx = {
        to: chainConfig.uniswap.swapRouter02,
        data: swapTxData,
        value: "0x0",
        gasLimit: ethers.BigNumber.from(tradeConfig.GAS_ESTIMATE_BASE).mul(2),
        maxFeePerGas: gasDataObj.maxFeePerGas.mul(1000).div(100),
        maxPriorityFeePerGas: gasDataObj.maxPriorityFeePerGas.mul(1000).div(100),
        nonce: nonce + nonceCounter,
        chainId: gasDataObj.chainId,
        type: 2
      };
      const quoterContract = new ethers.Contract(chainConfig.uniswap.quoter, [
        "function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)"
      ], provider);
      try {
        const quote = await quoterContract.callStatic.quoteExactInputSingle(fromTokenConfig.address, toTokenConfig.address, chainConfig.uniswap.fee, amountIn, 0);
        const minAmountOut = quote.mul(ethers.BigNumber.from(1e4).sub(tradeConfig.SLIPPAGE_BPS)).div(1e4);
        const updatedSwapTxData = routerInterface.encodeFunctionData("exactInputSingle", [
          [
            fromTokenConfig.address,
            toTokenConfig.address,
            chainConfig.uniswap.fee,
            signerInfo.address,
            Math.floor(Date.now() / 1000) + 300,
            amountIn,
            minAmountOut,
            0
          ]
        ]);
        swapTx.data = updatedSwapTxData;
        const spotQuote = await quoterContract.callStatic.quoteExactInputSingle(fromTokenConfig.address, toTokenConfig.address, chainConfig.uniswap.fee, ethers.utils.parseUnits("1", fromTokenConfig.decimals || 18), 0);
        const actualPrice = quote.mul(ethers.utils.parseUnits("1", fromTokenConfig.decimals || 18)).div(amountIn);
        const priceImpact = spotQuote.sub(actualPrice).mul(1e4).div(spotQuote).toNumber() / 100;
        console.log("Price Impact:", priceImpact.toString() + "%");
        if (priceImpact > tradeConfig.MAXIMUM_PRICE_IMPACT) {
          throw new Error("Price impact too high: " + priceImpact.toString() + "%");
        }
      } catch (error2) {
        console.error("Price impact check failed:", error2);
        throw error2;
      }
      console.log("swapTx:", swapTx);
      console.log("---------- sign swap tx ---------");
      const signedSwapTx = await LitSigner.signTx({
        tx: swapTx,
        sigName: "swapSig",
        pkpPubkey: signerInfo.pkpPubkey
      });
      console.log("signedSwapTx:", signedSwapTx);
      console.log("---------- send swap tx ---------");
      const swapTxHash = await LitSigner.sendTx(signedSwapTx, provider);
      nonceCounter++;
      console.log("swapTxHash:", swapTxHash);
      const isSuccess = typeof swapTxHash === "string";
      const error = !isSuccess && typeof swapTxHash === "object" ? swapTxHash.error : undefined;
      results.push({
        instruction,
        signedSwapTx,
        actualAmountOut: "0",
        status: isSuccess ? "success" : "failed",
        error,
        txs: [approveTxHash, swapTxHash].filter((tx) => {
          if (typeof tx === "string")
            return true;
          if (typeof tx === "object" && tx !== null)
            return false;
          return false;
        })
      });
    }
    return results;
  }

  // src/backend/lit-action.ts
  (async () => {
    const ethAddress = pubkeyToEthAddress(pkpPubkey);
    const provider = new ethers.providers.JsonRpcProvider(TOKEN_LIST.optimism.rpcUrl);
    const nativeBalance = await provider.getBalance(ethAddress);
    const balance = ethers.utils.formatEther(nativeBalance);
    console.log("ETH Native Balance:", balance);
    const portfolio = await getPortfolio(ethAddress);
    const processedPortfolio = portfolio.reduce((acc, item) => {
      if (item.token === "WETH") {
        const ethEntry = acc.find((p) => p.token === "ETH" && p.chain === item.chain);
        if (ethEntry) {
          ethEntry.balance = (parseFloat(ethEntry.balance) + parseFloat(item.balance)).toString();
          ethEntry.usdValue = (parseFloat(ethEntry.usdValue) + parseFloat(item.usdValue)).toString();
          return acc;
        }
        return [...acc, { ...item, token: "ETH" }];
      }
      return [...acc, item];
    }, []);
    const totalValue = processedPortfolio.reduce((sum, item) => sum + parseFloat(item.usdValue), 0);
    processedPortfolio.forEach((item) => {
      item.percentage = parseFloat(item.usdValue) / totalValue * 100;
    });
    console.log("portfolio:", processedPortfolio);
    if (part === 6 /* GET_PORTFOLIO */) {
      Lit.Actions.setResponse({
        response: JSON.stringify({
          portfolio: processedPortfolio
        })
      });
      return;
    }
    if (part === 1 /* GENERATE_INSTRUCTIONS */) {
      const instructions2 = await generateRebalanceInstructions({
        address: ethAddress,
        portfolio: processedPortfolio,
        config: STRATEGY_CONFIG,
        tradeConfig: DEFAULT_TRADE_CONFIG,
        strategyType: "OPTIMIZED_PAIRING" /* OptimizedPairing */
      });
      console.log("instructions:", instructions2);
      Lit.Actions.setResponse({
        response: JSON.stringify({
          instructions: instructions2
        })
      });
      return;
    }
    if (part === 2 /* GENERATE_GAS_DATA */) {
      const gasDataObjs2 = await generateGasDataObjects({
        instructions,
        signerInfo: {
          address: ethAddress,
          pkpPubkey
        },
        tradeConfig: DEFAULT_TRADE_CONFIG,
        confirmationConfig: CONFIRMATION_CONFIG
      });
      Lit.Actions.setResponse({
        response: JSON.stringify({
          gasDataObjs: gasDataObjs2
        })
      });
      return;
    }
    if (part === 3 /* EXECUTE_TXS */) {
      const signedTxs = await executeTradeInstructions({
        instructions,
        gasDataObjs,
        signerInfo: {
          address: ethAddress,
          pkpPubkey
        },
        tradeConfig: DEFAULT_TRADE_CONFIG,
        confirmationConfig: CONFIRMATION_CONFIG
      });
      console.log("signedTxs:", signedTxs);
      Lit.Actions.setResponse({
        response: JSON.stringify({
          signedTxs
        })
      });
      return;
    }
    if (part === 4 /* UNWRAP_WETH */) {
      const WETH_ABI = [
        "function withdraw(uint256 amount) external",
        "function balanceOf(address account) external view returns (uint256)"
      ];
      const chainConfig = TOKEN_LIST.optimism;
      const wethContract = new ethers.Contract(chainConfig.tokens.ETH.address, WETH_ABI, provider);
      const wethBalance = await wethContract.balanceOf(ethAddress);
      if (wethBalance.eq(0)) {
        console.log("No WETH balance to unwrap");
        Lit.Actions.setResponse({
          response: JSON.stringify({
            message: "No WETH balance to unwrap"
          })
        });
        return;
      }
      const unwrapPercentage = globalThis.unwrapPercentage || 100;
      const unwrapAmount = wethBalance.mul(unwrapPercentage).div(100);
      const gasData = await LitSigner.getGasData(ethAddress, provider);
      const unwrapTx = {
        to: chainConfig.tokens.ETH.address,
        data: wethContract.interface.encodeFunctionData("withdraw", [
          unwrapAmount
        ]),
        value: "0x0",
        gasLimit: ethers.BigNumber.from("100000"),
        maxFeePerGas: ethers.BigNumber.from(gasData.maxFeePerGas),
        maxPriorityFeePerGas: ethers.BigNumber.from(gasData.maxPriorityFeePerGas),
        nonce: gasData.nonce,
        chainId: chainConfig.chainId,
        type: 2
      };
      const signedTx = await LitSigner.signTx({
        tx: unwrapTx,
        sigName: "unwrapSig",
        pkpPubkey
      });
      const txHash = await LitSigner.sendTx(signedTx, provider);
      Lit.Actions.setResponse({
        response: JSON.stringify({
          txHash
        })
      });
      return;
    }
    if (part === 5 /* WRAP_ETH */) {
      const WETH_ABI = [
        "function deposit() external payable",
        "function balanceOf(address account) external view returns (uint256)"
      ];
      const chainConfig = TOKEN_LIST.optimism;
      const wethContract = new ethers.Contract(chainConfig.tokens.ETH.address, WETH_ABI, provider);
      const ethBalance = await provider.getBalance(ethAddress);
      if (ethBalance.eq(0)) {
        console.log("No ETH balance to wrap");
        Lit.Actions.setResponse({
          response: JSON.stringify({
            message: "No ETH balance to wrap"
          })
        });
        return;
      }
      const wrapPercentage = globalThis.wrapPercentage || 50;
      const wrapAmount = ethBalance.mul(wrapPercentage).div(100);
      const gasData = await LitSigner.getGasData(ethAddress, provider);
      const gasLimit = ethers.BigNumber.from("100000");
      const gasPrice = ethers.BigNumber.from(gasData.maxFeePerGas);
      const gasCost = gasLimit.mul(gasPrice);
      const finalWrapAmount = wrapAmount.sub(gasCost);
      if (finalWrapAmount.lte(0)) {
        console.log("Insufficient ETH balance for wrapping after gas costs");
        Lit.Actions.setResponse({
          response: JSON.stringify({
            message: "Insufficient ETH balance for wrapping after gas costs"
          })
        });
        return;
      }
      const wrapTx = {
        to: chainConfig.tokens.ETH.address,
        data: wethContract.interface.encodeFunctionData("deposit", []),
        value: finalWrapAmount.toHexString(),
        gasLimit,
        maxFeePerGas: gasPrice,
        maxPriorityFeePerGas: ethers.BigNumber.from(gasData.maxPriorityFeePerGas),
        nonce: gasData.nonce,
        chainId: chainConfig.chainId,
        type: 2
      };
      const signedTx = await LitSigner.signTx({
        tx: wrapTx,
        sigName: "wrapSig",
        pkpPubkey
      });
      const txHash = await LitSigner.sendTx(signedTx, provider);
      Lit.Actions.setResponse({
        response: JSON.stringify({
          txHash
        })
      });
      return;
    }
  })();
})();
`;