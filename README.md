# Seeker AI Copilot

Portfolio intelligence platform built for the **Solana Seeker** phone. Real-time on-chain portfolio tracking with multi-agent analysis, risk scoring, and trade intelligence.

## Features

### Portfolio Dashboard
- Real-time token balances via Helius DAS API
- 24h price changes (Birdeye / CoinGecko)
- Donut pie chart (allocation) + area chart (performance) with toggle
- Liquid Staking Token detection (mSOL, JitoSOL, bSOL, stSOL, scnSOL + 5 more)
- SKR staking status with APR display
- Copy wallet address to clipboard
- Pull-to-refresh

### Risk Analysis
- Normalized Herfindahl-Hirschman Index (HHI) for concentration risk
- Volatility exposure (non-stablecoin ratio)
- Impermanent loss risk (LP position exposure)
- Liquidation proximity (borrow health factor)
- Severity labels (Low / Med / High) with contextual explanations

### Multi-Agent Intelligence
Four specialized agents run in parallel:
1. **Risk Analyst** - Quantitative risk scoring + protocol risk
2. **Trend Researcher** - Live DeFiLlama TVL + CoinGecko market data
3. **Security Auditor** - Protocol safety scores + token rug detection
4. **Trade Generator** - Synthesized recommendations from all agents

### Copilot Chat
- Natural language Q&A about your portfolio
- Contextual suggested questions
- Query limits: Free (20/day), Pro (100/day with 200+ SKR staked)
- Retry logic with exponential backoff

### Settings
- Financial disclaimer (required on first launch)
- Privacy Policy, Terms of Service, EULA links
- SKR Pro tier information
- About and credits

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React Native (Expo SDK 51) + TypeScript |
| Wallet | Mobile Wallet Adapter v2 + Seed Vault |
| Blockchain | Helius DAS API (tokens, NFTs, native SOL) |
| Prices | Birdeye (API key) / CoinGecko (free fallback) |
| Backend | FastAPI (Python) on Railway |
| Inference | Configurable (Groq / Anthropic / OpenAI) |
| Market Data | DeFiLlama TVL + CoinGecko prices + yields |

## Project Structure

```
seeker-ai-copilot/
  App.tsx                          # Root component, navigation, disclaimer
  src/
    config/constants.ts            # Colors, API URLs, limits
    types/index.ts                 # TypeScript interfaces
    screens/
      ConnectScreen.tsx            # Wallet connection
      PortfolioScreen.tsx          # Main dashboard
      AIScreen.tsx                 # Copilot chat
      RecommendationsScreen.tsx    # Intel hub (signals, trends, security)
      SettingsScreen.tsx           # App settings and legal
    components/
      TokenRow.tsx                 # Token display row
      RiskGauge.tsx                # Semicircle arc risk visualization
      PortfolioChart.tsx           # Pie chart + area chart with toggle
      ShareCard.tsx                # Portfolio sharing card
      AIChat.tsx                   # Chat interface
      Skeleton.tsx                 # Shimmer loading states
      ErrorBoundary.tsx            # Crash recovery
    services/
      portfolioService.ts          # Helius DAS, risk scoring, staking
      aiService.ts                 # Backend API communication
      priceService.ts              # Birdeye + CoinGecko price enrichment
      walletService.ts             # MWA connection
      transactionService.ts        # Helius Enhanced Transactions
      defiDetectionService.ts      # LST detection by mint address
      demoData.ts                  # Demo portfolio for web preview
  backend/
    app/
      main.py                      # FastAPI app, CORS, auth, rate limiting
      routes/ai_routes.py          # API endpoints
      agents/
        base.py                    # LLM init, prompt injection defense
        orchestrator.py            # Multi-agent pipeline coordinator
        risk_analyst.py            # Quantitative risk scoring
        trend_researcher.py        # Market trend detection
        security_auditor.py        # Protocol safety scoring
        trade_generator.py         # Trade recommendation synthesis
        market_data.py             # DeFiLlama + CoinGecko cache
```

## Setup

### Prerequisites
- Node.js 18+
- Python 3.11+
- Expo CLI (`npm install -g expo-cli`)
- Solana Seeker phone (for native builds)

### Frontend
```bash
npm install
npx expo start --web          # Web preview with phone frame
npx eas build --platform android --profile preview  # APK build
```

### Backend
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env          # Edit with your API keys
uvicorn app.main:app --port 8000
```

### Environment Variables

**Frontend (set in eas.json or .env):**
- `EXPO_PUBLIC_API_URL` - Backend URL (Railway)
- `EXPO_PUBLIC_HELIUS_RPC_URL` - Helius RPC endpoint with API key
- `EXPO_PUBLIC_BIRDEYE_KEY` - Birdeye API key (optional, for token security)

**Backend (set in .env):**
- `GROQ_API_KEY` - Groq inference key (required)
- `LLM_PROVIDER` - groq / anthropic / openai
- `CORS_ORIGINS` - Allowed origins (comma-separated)
- `RATE_LIMIT_RPM` - Requests per minute per IP (default: 30)

## Supported DeFi Protocols

### Liquid Staking Tokens (auto-detected by mint)
mSOL (Marinade), JitoSOL (Jito), bSOL (BlazeStake), stSOL (Lido), scnSOL (Sanctum), hSOL (Helius), jupSOL (Jupiter), LST (Sanctum Infinity), edgeSOL (Edgevana), bonkSOL (Sanctum bonkSOL)

### Protocol Security Database
Jupiter (92), Jito (91), Marinade (90), Kamino (88), Orca (87), Drift (85), Meteora (84), Tensor (83), Raydium (78), Solend (72), MarginFi (70)

## Security

- No private keys stored (MWA + Seed Vault only)
- Prompt injection defense with Unicode normalization (NFKC)
- Per-IP rate limiting on backend
- Input validation on all API endpoints (Pydantic)
- API keys provided via environment variables, never hardcoded

## License

MIT
