# Seeker Copilot — Solana Mobile Builder Grant Application

## What is it

Seeker Copilot is a portfolio tracker and analysis tool built for the Solana Seeker phone. It connects through Mobile Wallet Adapter and Seed Vault, pulls your entire portfolio from Helius DAS, and runs multi-agent analysis to give you risk scores, trade signals, and security audits on your phone in real time.

The app detects SKR staking and gates a Pro tier behind staking 200+ SKR. That gives the token direct utility inside the app.

## The problem

Seeker owners have no native way to see their full portfolio picture without jumping between multiple apps. The Seed Vault wallet shows balances but doesn't tell you about concentration risk, whether your staking yields are competitive, or if a protocol you're using has been audited.

There's no portfolio intelligence app in the Solana dApp Store. Jupiter, Backpack, Solflare are wallets and DEXs. None of them do multi-factor risk scoring or trade signal generation from your actual holdings.

## What it does

**Portfolio tracking**
- Full token and NFT inventory via Helius DAS
- 24h price changes from Birdeye and CoinGecko
- Detects 10 liquid staking tokens (mSOL, JitoSOL, bSOL, stSOL, scnSOL, hSOL, jupSOL, LST, edgeSOL, bonkSOL) with live APR
- SKR staking detection with APR display
- Pie chart allocation view and performance chart

**Risk scoring**
- Normalized HHI concentration index
- Volatility exposure based on non-stablecoin ratio
- Impermanent loss risk from LP positions
- Liquidation proximity for borrow positions
- Overall weighted score 0-100 with plain language explanations

**Trade intelligence**
- 4 specialized agents run in parallel: Risk Analyst, Trend Researcher, Security Auditor, Trade Generator
- Live market data from DeFiLlama TVL and CoinGecko
- Confidence-scored buy/sell/hold/rebalance signals
- Protocol safety scores for 11 Solana protocols

**Copilot chat**
- Ask questions about your portfolio in plain language
- 20 queries/day free, 100/day with 200+ SKR staked
- Contextual suggested questions based on your holdings

## How it uses Solana Mobile Stack

| Component | Usage |
|---|---|
| Mobile Wallet Adapter v2 | Wallet connection and authorization |
| Seed Vault | Secure key storage, no private keys in the app |
| SKR token | Staking gates Pro tier, 200+ SKR = 5x more queries |
| Seeker hardware | Optimized for 393x873 resolution, AMOLED dark theme |

## Tech stack

- React Native with Expo SDK 51 and TypeScript
- FastAPI backend on Railway
- Helius DAS API for portfolio data
- Birdeye and CoinGecko for prices
- DeFiLlama for TVL and yield data
- Configurable inference backend

## Current status

- Working APK installable on Seeker
- Backend deployed on Railway and responding to queries
- Public GitHub repo at github.com/warfield2016/seeker-copilot
- Privacy Policy and Terms of Service hosted on GitHub Pages
- Ready for Solana dApp Store submission

## Milestones

**Month 1 — dApp Store launch**
- Submit to Solana dApp Store
- Gather initial user feedback from Seeker community
- Production APK with dedicated signing key

**Month 2 — Transaction history and real data**
- Transaction history screen (the service layer is already built)
- Replace simulated performance chart with real historical data
- Persist daily query counts across sessions
- Accessibility labels on all interactive elements

**Month 3 — On-chain actions**
- Jupiter swap integration so you can swap from the portfolio screen
- Stake and unstake directly from the app
- Price alerts and push notifications
- DeFi position detection from on-chain program accounts

## Budget

| Item | Amount |
|---|---|
| EAS Production plan | $12 |
| Helius Pro plan (RPC and DAS) | $49/mo |
| Railway backend hosting | $5/mo |
| Legal pages hosting | $0 via GitHub Pages |
| Seeker device for testing | Already owned |
| Development time over 3 months | Majority of grant |
| **Total request** | **$10,000** |

## Why this matters for the Seeker ecosystem

Every phone platform needs a portfolio tracker that feels native. On iPhone its Delta or Zerion. On Seeker nothing like this exists yet.

This app gives SKR holders a reason to stake not for speculative yield but for direct utility inside an app they use daily. That kind of token usage is what makes the Seeker ecosystem sticky.

The multi-agent approach means analysis improves over time without shipping new builds. Prompts, data sources, and risk models can be updated server-side while users keep using the same app.

## About me

I built this because I own a Seeker and wanted better tooling for managing my portfolio on it. Started as a personal project and grew into something I think other Seeker owners would find useful.

GitHub: github.com/warfield2016/seeker-copilot
Contact: warfield2016@gmail.com
