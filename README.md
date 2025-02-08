# Demo

![Watch the demo](https://raw.githubusercontent.com/KrystynaOrda/aw-portfolio-manager/refs/heads/main/demo.gif)

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

# Lit Aganet Wallet - Portfolio Manager

```tree
Directory structure:
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
