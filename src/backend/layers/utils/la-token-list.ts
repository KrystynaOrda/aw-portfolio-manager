// Token configuration type
export type TokenConfig = {
  address: string;
  decimals?: number;
  name?: string;
  logo?: string;
};

// Chain configuration type
export type ChainConfig = {
  rpcUrl: string;
  explorer: string;
  tokens: Record<string, TokenConfig>;
  uniswap: {
    quoter: string;
    swapRouter02: string;
    fee: number;
  };
};

// Token list type
export const TOKEN_LIST = {
  optimism: {
    chainId: 10,
    rpcUrl: "https://mainnet.optimism.io",
    explorer: "https://optimistic.etherscan.io",
    tokens: {
      OP: {
        address: "0x4200000000000000000000000000000000000042",
        name: "Optimism",
        decimals: 18,
      },
      ETH: {
        address: "0x4200000000000000000000000000000000000006",
        name: "Ether",
        decimals: 18,
      },
      WETH: {
        address: "0x4200000000000000000000000000000000000006",
        name: "Wrapped Ether",
        decimals: 18,
      },
      USDC: {
        address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
        name: "USD Coin",
        decimals: 6,
      },
      DAI: {
        address: "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1",
        name: "Dai Stablecoin",
        decimals: 18,
      },
      WBTC: {
        address: "0x68f180fcce6836688e9084f035309e29bf0a2095",
        name: "Wrapped BTC",
        decimals: 8,
      },
    },
    uniswap: {
      quoter: "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6",

      // rename this to swapRouter (not 02)
      swapRouter02: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
      fee: 3000,
    },
  },
  arbitrum: {
    chainId: 42161,
    rpcUrl: "https://arbitrum.llamarpc.com",
    explorer: "https://arbiscan.io",
    tokens: {
      ETH: {
        address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
        name: "Ether",
        decimals: 18,
      },
      USDC: {
        address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
        name: "USD Coin",
        decimals: 6,
      },
      DAI: {
        address: "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1",
        name: "Dai Stablecoin",
        decimals: 18,
      },
      WBTC: {
        address: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
        name: "Wrapped BTC",
        decimals: 8,
      },
    },
    uniswap: {
      quoter: "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6",
      swapRouter02: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
      fee: 3000,
    },
  },
} as const;
