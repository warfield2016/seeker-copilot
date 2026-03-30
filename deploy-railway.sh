#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
# Seeker AI Copilot — Railway Backend Deploy Script
# Run this once to deploy the backend so AI works on your Seeker phone.
# Usage: bash deploy-railway.sh
# ──────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   Seeker AI Copilot — Railway Deploy         ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── Step 1: Login ─────────────────────────────────────────────────
echo "▶ Step 1/5  Login to Railway (opens browser)..."
cd "$BACKEND_DIR"
railway login

# ── Step 2: Init project ──────────────────────────────────────────
echo ""
echo "▶ Step 2/5  Creating Railway project..."
railway init --name seeker-ai-copilot

# ── Step 3: Set environment variables ────────────────────────────
echo ""
echo "▶ Step 3/5  Setting environment variables..."

# Prompt for API key — never hardcode secrets in scripts
read -rp "Enter your GROQ_API_KEY: " GROQ_KEY
if [ -z "$GROQ_KEY" ]; then
  echo "   ✗ GROQ_API_KEY is required. Get one at console.groq.com"
  exit 1
fi

railway variables set \
  GROQ_API_KEY="$GROQ_KEY" \
  LLM_PROVIDER="groq" \
  CORS_ORIGINS="*" \
  RATE_LIMIT_RPM="60" \
  PORT="8000"

echo "   ✓ Environment variables set"

# ── Step 4: Deploy ────────────────────────────────────────────────
echo ""
echo "▶ Step 4/5  Deploying backend (this takes ~2 min)..."
railway up --detach

echo ""
echo "▶ Step 5/5  Getting your Railway URL..."
sleep 10  # give Railway a moment to register the deployment

RAILWAY_URL=$(railway domain 2>/dev/null || echo "")

if [ -z "$RAILWAY_URL" ]; then
  echo ""
  echo "   ⚠  Auto-domain not ready yet. Generating one..."
  railway domain generate 2>/dev/null || true
  sleep 5
  RAILWAY_URL=$(railway domain 2>/dev/null || echo "")
fi

if [ -n "$RAILWAY_URL" ]; then
  echo ""
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║  ✅ DEPLOY COMPLETE!                                         ║"
  echo "╠══════════════════════════════════════════════════════════════╣"
  echo "║                                                              ║"
  printf "║  API URL: https://%-44s║\n" "$RAILWAY_URL"
  echo "║                                                              ║"
  echo "║  Next step — rebuild the APK with this URL:                 ║"
  echo "║                                                              ║"
  printf "║  EXPO_PUBLIC_API_URL=https://%-33s║\n" "$RAILWAY_URL"
  echo "║                                                              ║"
  echo "╚══════════════════════════════════════════════════════════════╝"

  # Write the URL to a file for the next build step
  echo "https://$RAILWAY_URL" > "$SCRIPT_DIR/.railway-api-url"
  echo ""
  echo "   URL saved to .railway-api-url"
  echo ""
  echo "   Now run: bash rebuild-with-railway.sh"
else
  echo ""
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║  ✅ Deploy submitted! URL not yet ready.                     ║"
  echo "║                                                              ║"
  echo "║  Check your Railway dashboard for the URL:                  ║"
  echo "║  https://railway.app/dashboard                              ║"
  echo "║                                                              ║"
  echo "║  Once you have the URL, run:                                ║"
  echo "║  bash rebuild-with-railway.sh <YOUR_RAILWAY_URL>            ║"
  echo "╚══════════════════════════════════════════════════════════════╝"
fi
