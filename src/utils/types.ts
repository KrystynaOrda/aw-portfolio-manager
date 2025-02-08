export interface Portfolio {
  portfolio: {
    chain: string;
    token: string;
    balance: string;
    usdValue: string;
    percentage: number;
  }[];
}

export interface StrategyConfig {
  targetAllocations: Record<string, number>;
  thresholdPercentage: number;
} 