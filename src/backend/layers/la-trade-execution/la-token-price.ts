import { TOKEN_LIST } from "../utils/la-token-list";
// import { ethers } from "ethers"; // remove this of la

type ChainType = keyof typeof TOKEN_LIST;
type TokensByChain<T extends ChainType> = Extract<
  keyof (typeof TOKEN_LIST)[T]["tokens"],
  string
>;

export async function getTokenPrice<T extends ChainType>(params: {
  fromToken: TokensByChain<T>;
  toToken: TokensByChain<T>;
  amount: string;
  chain: T;
}) {
  const { fromToken, toToken, amount, chain } = params;
  const chainConfig = TOKEN_LIST[chain] as any;

  const provider = new ethers.providers.JsonRpcProvider(chainConfig.rpcUrl);
  const quoterContract = new ethers.Contract(
    chainConfig.uniswap.quoter,
    [
      "function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)",
    ],
    provider
  );

  const amountIn = ethers.utils.parseUnits(
    amount,
    chainConfig.tokens[fromToken].decimals ?? 18
  );

  const amountOut = await quoterContract.callStatic.quoteExactInputSingle(
    chainConfig.tokens[fromToken].address,
    chainConfig.tokens[toToken].address,
    chainConfig.uniswap.fee,
    amountIn,
    0
  );

  const quote = ethers.utils.formatUnits(
    amountOut,
    chainConfig.tokens[toToken].decimals ?? 18
  );

  console.log(
    "💲 Quote: " +
      quote +
      " " +
      toToken +
      " for " +
      amount +
      " " +
      fromToken +
      " on " +
      chain
  );

  return quote;
}
