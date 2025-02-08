# Demo

![Watch the demo](https://raw.githubusercontent.com/KrystynaOrda/aw-portfolio-manager/refs/heads/main/demo.gif)

# Lit Aganet Wallet - Decentralized Portfolio Manager

The Decentralized Portfolio Manager powered by Lit Protocol & AI—automates asset rebalancing with secure Lit Actions, signed by a PKP. Users engage with AI for risk analysis, select dynamic strategies based on risk tolerance, execute trades on-chain, and interact via a real-time chat interface.

Users start by engaging with an AI agent through a real-time chat interface, where they can provide their risk tolerance preferences and investment goals. The AI retrieves current holdings from the user’s PKP wallet and fetches market data from the Uniswap decentralized price oracle. It then evaluates the user’s risk profile to generate an informed strategy.

Based on the risk assessment, the system selects a trading strategy, such as conservative, balanced, or aggressive, mirroring traditional stock investing applications. The AI then generates precise trade instructions aligned with the selected strategy.

Once trade instructions are generated, they are converted into executable transactions and securely signed by the PKP through Lit Actions. The Lit Action then submits the trades to DEXs via Uniswap for automated execution.

Finally, the AI provides real-time feedback on trade execution, keeping users updated on portfolio performance.

## How it's made

The tech stack includes Lit Protocol for secure signing with PKP, AI Agent (ChatGPT) for risk analysis and strategy selection, Uniswap for executing trades on-chain, and Ethers.js with Express and WebSocket for blockchain interactions and real-time updates.

That said, there are some limitations. Since Lit Actions have a **30-second execution cap**, we can only process **a few trades per action** before hitting that limit. While technically, multiple trades can be handled within a single Lit Action, **waiting for transactions to settle on-chain would take too long**, meaning we’d have no way to do proper error handling within the action itself. As a workaround, trade execution had to be simplified, with more complex strategies moved off-chain. Another challenge was data flow—ideally, everything would happen within one Lit Action, but due to constraints, **we had to shuttle data between the Lit Action and the client**, which forced some major architectural changes in the codebase.

# Directory structure

```tree
└── ./public/
    ├── index.html                           # Chat interface
└── ./src/
    ├── _setup.ts                            # Setup PKP
    ├── server.ts                            # Chat server
    ├── _env.ts
    ├── agent/
    │   └── ai-agent.ts                      # AI Agent
    ├── config/
    │   └── portfolio-data.json              # PKP portfolio data
    |   └── user-preference.json             # User strategy settings
    |   └── delegation.ts
    ├── vendors/
    │   └── lit-service.ts
    ├── backend/
    │   └── lit-action.ts                    # Lit Actions
    │   ├── layers/
    │   │   ├── utils/
    │   │   │   ├── la-token-list.ts         # Available tokens
    │   │   │   └── la-utils.ts
    │   │   └── la-portfolio/                # Part 1 - get the PKP portfolio
    │   │   │   └── la-get-portfolio.ts
    │   │   ├── la-strategies/               # Part 2 - Select strategies
    │   │   │   ├── la-aggregated-orders.ts
    │   │   │   ├── la-instructions.ts
    │   │   │   ├── la-optimized-paring.ts
    │   │   │   └── la-full-matrix.ts
    │   │   ├── la-trade-execution/          # Part 3 - Broadcast transactions
    │   │   │   ├── la-trade-executor.ts
    │   │   │   └── la-token-price.ts
    ├── frontend/
    │   ├── index.ts                         # Main entry point
    │   ├── get-portfolio.ts
    │   ├── wrap.ts                          # Wrap WETH to trade
    │   └── unwrap.ts                        # Unwrap WETH
    ├── utils/
    │   ├── types.ts
    └   └── silent.ts
```

# Start

1. Configure environment variables by creating a `.env` file in the root directory with the following variables:

```env
ETHEREUM_PRIVATE_KEY=
ETH_ADDRESS=
PKP_PUBLIC_KEY=
PKP_ETH_ADDRESS=
OPENAI_API_KEY=
```

2. Update the delegation configuration in `./src/config/delegation.ts` with your delegation auth sig

```typescript
export const DELEGATION_AUTH_SIG = {
  sig: "0x...",
  derivedVia: "",
  signedMessage: "localhost wants you to sign in...",
  address: "0x...",
};
```
