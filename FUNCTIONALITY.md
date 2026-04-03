# Seeker AI Copilot — Full Functionality Guide

## Overview

Seeker AI Copilot is a portfolio intelligence platform built exclusively for the Solana Seeker phone. It combines real-time on-chain data with multi-agent AI analysis to give Solana users actionable insights about their holdings, staking positions, and DeFi exposure.

---

## Screens

### 1. Connect Screen
- **Mobile Wallet Adapter v2** — Connects via Seed Vault secure enclave
- Animated entrance with staggered spring animations
- Feature chips previewing app capabilities (Track, Analyze, Intel, SKR Pro)

### 2. Portfolio Dashboard
- **Real-time token balances** via Helius DAS API (single call for all assets)
- **24h price changes** via Birdeye (API key) or CoinGecko (free fallback)
- **Total portfolio value** centered at top with 24h change
- **AI Summary card** — Structured bullet analysis from LLM
- **Performance chart** with 24H / 7D / 30D period selector
- **SKR Banner** — Shows liquid SKR balance and staked amount with Pro tier status
- **Staked Positions** — Detects Liquid Staking Tokens (mSOL, JitoSOL, bSOL, stSOL, scnSOL, hSOL, jupSOL, LST, edgeSOL, bonkSOL) with live APR from DeFiLlama
- **Risk Score Gauge** — Semicircle arc visualization (0-100) with 4-factor breakdown:
  - Concentration (HHI index)
  - Volatility (non-stablecoin exposure)
  - Impermanent Loss (LP positions)
  - Liquidation (borrow health)
- **DeFi Positions** with protocol safety scores
- **Token Holdings** — Full list with logos, balances, prices, 24h changes
- **NFT Count** — Grid preview of first 6 NFTs
- **Share Card** — Portfolio summary for sharing (copy/share)
- **Pull-to-refresh** for live data reload

### 3. AI Copilot Chat
- **Natural language Q&A** about your portfolio
- Multi-agent backend processes questions through 4 specialized agents
- Suggested questions on first load
- Query counter with daily limits (Free: 5/day, Pro: 20/day with 2,000+ SKR staked)
- Multi-provider LLM backend (configurable via environment variables)

### 4. Intelligence Hub
Three-tab analysis dashboard:
- **Signals** — Trade recommendations with action (buy/sell/hold/rebalance), confidence score, and reasoning
- **Trends** — Market trend detection (momentum, narrative, opportunity, risk) with live DeFiLlama TVL + CoinGecko data
- **Security** — Protocol safety scores (0-100) with audit status, top concerns, and recommendations

### 5. Settings
- App info and version
- Financial disclaimer (persistent, required on first launch)
- SKR Pro tier information (Free vs Pro)
- Legal links (Privacy Policy, Terms of Service, EULA)
- About (GitHub, support email, Helius, Solana)

---

## Technical Architecture

### Frontend
- **React Native** (Expo SDK 51) + TypeScript
- Bottom tab navigation (react-navigation)
- react-native-reanimated for 60fps animations
- expo-haptics for tactile feedback
- Shimmer skeleton loading states
- Responsive design for Seeker's 393x873 logical resolution

### Backend
- **FastAPI** (Python) deployed on Railway
- Multi-agent LLM pipeline via LangChain
- 4 specialized agents: Risk Analyst, Trend Researcher, Security Auditor, Trade Generator
- Phase 1 (parallel): Risk + Trend + Security
- Phase 2 (sequential): Trade Generator synthesizes all inputs
- Live market data injection from DeFiLlama + CoinGecko
- Prompt injection defense (7 regex patterns + input sanitization)
- Per-IP rate limiting (configurable RPM)

### Blockchain
- Helius DAS API for asset discovery (tokens + NFTs + native SOL)
- Mobile Wallet Adapter Protocol v2 for Seed Vault integration
- On-chain staking program queries for SKR staked positions
- LST detection by mint address (10 protocols supported)

---

## SKR Token Utility

| Tier | Requirement | AI Queries/Day |
|------|-------------|----------------|
| Free | None | 5 |
| Pro | Stake 2,000+ SKR | 20 |

SKR staking provides direct utility within the app — more daily AI queries for deeper portfolio analysis.

---

## Supported DeFi Protocols

### Liquid Staking Tokens (Auto-detected)
| Token | Protocol | Detection Method |
|-------|----------|-----------------|
| mSOL | Marinade Finance | Mint address |
| JitoSOL | Jito | Mint address |
| bSOL | BlazeStake | Mint address |
| stSOL | Lido | Mint address |
| scnSOL | Sanctum | Mint address |
| hSOL | Helius | Mint address |
| jupSOL | Jupiter | Mint address |
| LST | Sanctum Infinity | Mint address |
| edgeSOL | Edgevana | Mint address |
| bonkSOL | Sanctum bonkSOL | Mint address |

### Protocol Security Database
Jupiter (92), Jito (91), Marinade (90), Kamino (88), Orca (87), Drift (85), Meteora (84), Tensor (83), Raydium (78), Solend (72), MarginFi (70)

---

## Future Vision

### Phase 2: Social Intelligence
- Portfolio leaderboards (opt-in, anonymized wallet addresses)
- Copy-trade signals from top performers
- Community sentiment integration from X/Discord
- Whale wallet tracking and alerts

### Phase 3: On-Chain Actions
- One-tap swap via Jupiter aggregator integration
- Stake/unstake directly from the portfolio screen
- Auto-rebalance based on AI recommendations
- Automatic DCA (Dollar Cost Averaging) setup

### Phase 4: Advanced Analytics
- Tax reporting with cost basis tracking
- Historical P&L charts and performance attribution
- Custom price alerts (target prices, risk thresholds, whale moves)
- Gas optimization recommendations
- Portfolio comparison vs SOL index / top DeFi index

### Phase 5: Multi-Chain Expansion
- Eclipse (Solana L2) support
- Cross-chain portfolio aggregation (EVM bridges)
- Unified DeFi position tracking across chains

---

## Use Cases for Solana dApp Store

1. **Portfolio Health Monitor** — Track concentration risk, volatility exposure, and liquidation proximity in real-time
2. **DeFi Yield Comparison** — Compare current staking positions vs best available yields across Solana
3. **Token Security Scanner** — Check any token for rug risk, fake token flags, and whale concentration
4. **Seeker Season Optimizer** — Track dApp interactions for weekly reward eligibility
5. **Multi-Protocol Staking Dashboard** — See all LST positions (mSOL, JitoSOL, bSOL, etc.) with live APR in one view
6. **AI Portfolio Q&A** — Ask natural language questions about holdings, risk, and strategy
7. **Trade Signal Intelligence** — Confidence-scored trade recommendations from multi-agent analysis
8. **Portfolio Sharing** — Generate shareable portfolio summary cards for social media

---

## Pre-Submission Checklist

- [x] Financial disclaimer modal (first launch)
- [x] Privacy Policy, Terms, EULA links in Settings
- [x] versionCode: 1 in app.json
- [x] dapp-store/config.yaml initialized
- [x] Production APK with release signing key
- [x] Backend deployed (Railway)
- [x] Staked positions detection (10 LST protocols)
- [x] Risk scoring with quantitative formulas
- [x] Prompt injection defense
- [x] Rate limiting on backend
- [ ] 4+ screenshots at 1920x1080 portrait
- [ ] 512x512 app icon (matching APK)
- [ ] 1200x600 banner
- [ ] Fund publisher wallet with 0.2+ SOL
- [ ] Mint Publisher/App/Release NFTs
- [ ] Host Privacy Policy and Terms of Service pages
