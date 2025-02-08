import { TradeInstruction } from "../la-strategies/la-instructions";
import { TOKEN_LIST } from "./la-token-list";
import { DefaultTradeConfig, GasDataObject } from "../la-trade-execution/la-trade-executor";

export function pubkeyToEthAddress(pkpPubkey: string) {
  return ethers.utils.computeAddress(
    new Uint8Array(
      pkpPubkey
        .replace("0x", "")
        .match(/.{1,2}/g)!
        .map((byte) => parseInt(byte, 16))
    )
  );
}

export async function LitSign(message: string) {
  await Lit.Actions.signEcdsa({
    toSign: ethers.utils.arrayify(
      ethers.utils.keccak256(ethers.utils.toUtf8Bytes(message))
    ),
    publicKey: pkpPubkey,
    sigName: "sig1",
  });
}

export namespace LitSigner {
  /**
   * Signs a transaction using the PKP's public key.
   * @param {any} tx - The transaction to sign.
   * @param {string} sigName - The name of the signature.
   * @returns {Promise<string>} The signed transaction.
   */
  export async function signTx({
    tx,
    sigName,
    pkpPubkey,
  }: {
    tx: any;
    sigName: string;
    pkpPubkey: string;
  }) {
    console.log("signing tx: ", sigName);

    const pkForLit = pkpPubkey.startsWith("0x")
      ? pkpPubkey.slice(2)
      : pkpPubkey;

    const sig = await Lit.Actions.signAndCombineEcdsa({
      toSign: ethers.utils.arrayify(
        ethers.utils.keccak256(ethers.utils.serializeTransaction(tx))
      ),
      publicKey: pkForLit,
      sigName,
    });

    return ethers.utils.serializeTransaction(
      tx,
      ethers.utils.joinSignature({
        r: "0x" + JSON.parse(sig).r.substring(2),
        s: "0x" + JSON.parse(sig).s,
        v: JSON.parse(sig).v,
      })
    );
  }

  /**
   * Retrieves gas data (maxFeePerGas, maxPriorityFeePerGas, and nonce).
   * @param {JsonRpcProvider} provider - The Ethereum provider.
   * @returns {Promise<{ maxFeePerGas: string, maxPriorityFeePerGas: string, nonce: number }>} Gas data.
   */
  export async function getGasData(ethAddress: string, provider: any) {
    console.log("Getting gas data...");

    const gasData = await Lit.Actions.runOnce(
      { waitForResponse: true, name: "gasPriceGetter" },
      async () => {
        const baseFeeHistory = await provider.send("eth_feeHistory", [
          "0x1",
          "latest",
          [],
        ]);
        const baseFee = ethers.BigNumber.from(baseFeeHistory.baseFeePerGas[0]);
        const nonce = await provider.getTransactionCount(ethAddress);

        const priorityFee = baseFee.div(4);
        const maxFee = baseFee.mul(2);

        return JSON.stringify({
          maxFeePerGas: maxFee.toHexString(),
          maxPriorityFeePerGas: priorityFee.toHexString(),
          nonce,
        });
      }
    );

    console.log("Gas data:", JSON.parse(gasData as any));

    return JSON.parse(gasData as any);
  }

  /**
   * Estimates the gas limit for a transaction.
   * @param {JsonRpcProvider} provider - The Ethereum provider.
   * @param {any} tokenInContract - The token contract instance.
   * @param {any} amount - The amount of tokens to swap.
   * @param {boolean} isApproval - Whether the transaction is an approval or a swap.
   * @param {Object} [swapParams] - Swap parameters (fee and amountOutMin).
   * @returns {Promise<any>} The estimated gas limit.
   */
  export async function estimateGasLimit(
    provider: any,
    swapRouterAddress: string,
    ethAddress: string,
    tokenInContract: any,
    amount: any,
    isApproval: boolean,
    params: {
      chainId: number;
      tokenIn: string;
      tokenOut: string;
    },
    swapParams?: {
      fee: number;
      amountOutMin: any;
    }
  ) {
    console.log("Estimating gas limit...");

    try {
      let estimatedGas;
      if (isApproval) {
        estimatedGas = await tokenInContract.estimateGas.approve(
          swapRouterAddress,
          amount,
          { from: ethAddress }
        );
      } else if (swapParams) {
        const routerInterface = new ethers.utils.Interface([
          "function exactInputSingle((address,address,uint24,address,uint256,uint256,uint160)) external payable returns (uint256)",
        ]);

        const routerContract = new ethers.Contract(
          swapRouterAddress,
          routerInterface,
          provider
        );

        estimatedGas = await routerContract.estimateGas.exactInputSingle(
          [
            params.tokenIn,
            params.tokenOut,
            swapParams.fee,
            ethAddress,
            amount,
            swapParams.amountOutMin,
            0,
          ],
          { from: ethAddress }
        );
      } else {
        throw new Error("Missing swap parameters for gas estimation");
      }

      // Add 20% buffer
      const gasLimit = estimatedGas.mul(120).div(100);
      console.log("Estimated gas limit:", gasLimit.toString());
      return gasLimit;
    } catch (error) {
      console.error("Error estimating gas:", error);
      // Use fallback gas limits
      const fallbackGas = isApproval ? "300000" : "500000";
      console.log("Using fallback gas limit:", fallbackGas);
      return ethers.BigNumber.from(fallbackGas);
    }
  }

  export async function getApproveTx(params: {
    instruction: TradeInstruction;
    ethAddress: string;
    provider: any;
    swapRouterAddress: string;
    amountIn: string;
    gasData: GasDataObject;
  }) {
    const { instruction, ethAddress, provider, swapRouterAddress, amountIn } =
      params;
    const chainId =
      TOKEN_LIST[instruction.chain as keyof typeof TOKEN_LIST].chainId;
    const gasLimit = await LitSigner.estimateGasLimit(
      provider,
      swapRouterAddress,
      ethAddress,
      instruction.fromToken,
      amountIn,
      true,
      {
        chainId,
        tokenIn: instruction.fromToken,
        tokenOut: instruction.toToken,
      }
    );

    const APPROVE_ABI = [
      "function approve(address spender, uint256 amount) external returns (bool)",
    ];
    const tokenInterface = new ethers.utils.Interface(APPROVE_ABI);

    const txData = tokenInterface.encodeFunctionData("approve", [
      swapRouterAddress,
      amountIn,
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
      type: 2,
    };

    return tx;
  }

  export async function getSwapTx(params: {
    instruction: TradeInstruction;
    ethAddress: string;
    provider: any;
    swapRouterAddress: string;
    amountIn: string;
    amountOutMinimum: string;
    gasData: GasDataObject;
    isEthTrade?: boolean;
  }) {
    const { instruction, ethAddress, provider, swapRouterAddress, amountIn } =
      params;
    const chainId =
      TOKEN_LIST[instruction.chain as keyof typeof TOKEN_LIST].chainId;
    const chainConfig =
      TOKEN_LIST[instruction.chain as keyof typeof TOKEN_LIST];

    const gasLimit = await LitSigner.estimateGasLimit(
      provider,
      swapRouterAddress,
      ethAddress,
      instruction.fromToken,
      amountIn,
      false,
      {
        chainId,
        tokenIn: instruction.fromToken,
        tokenOut: instruction.toToken,
      },
      {
        fee: chainConfig.uniswap.fee,
        amountOutMin: params.amountOutMinimum,
      }
    );

    const SWAP_ROUTER_ABI = [
      "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)",
    ];
    const routerInterface = new ethers.utils.Interface(SWAP_ROUTER_ABI);

    const fromTokenConfig =
      chainConfig.tokens[
        instruction.fromToken as keyof typeof chainConfig.tokens
      ];
    const toTokenConfig =
      chainConfig.tokens[
        instruction.toToken as keyof typeof chainConfig.tokens
      ];

    const txData = routerInterface.encodeFunctionData("exactInputSingle", [
      [
        fromTokenConfig.address,
        toTokenConfig.address,
        chainConfig.uniswap.fee,
        ethAddress,
        Math.floor(Date.now() / 1000) + 300, // 5 minutes deadline
        amountIn,
        params.amountOutMinimum,
        0, // sqrtPriceLimitX96
      ],
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
      type: 2,
    };

    return tx;
  }

  export async function sendTx(signedTx: any, provider: any) {
    try {
      const txHash = await Lit.Actions.runOnce(
        { waitForResponse: true, name: "txnSender" },
        async () => {
          try {
            const receipt = await provider.sendTransaction(signedTx);
            return receipt.hash;
          } catch (error: any) {
            return JSON.stringify(error.message, null, 2);
          }
        }
      );
      return txHash;
    } catch (error: any) {
      console.error("Error in sendTx:", error);
      return { error: error.message || "Unknown error in sendTx" };
    }
  }
}
