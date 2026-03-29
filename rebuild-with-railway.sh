#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
# Rebuild APK with Railway backend URL
# Usage: bash rebuild-with-railway.sh [OPTIONAL_URL]
# If URL is not passed, reads from .railway-api-url file
# ──────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   Seeker AI Copilot — Production APK Build   ║"
echo "╚══════════════════════════════════════════════╝"

# Resolve Railway URL
if [ -n "${1:-}" ]; then
  RAILWAY_URL="$1"
elif [ -f "$SCRIPT_DIR/.railway-api-url" ]; then
  RAILWAY_URL=$(cat "$SCRIPT_DIR/.railway-api-url")
else
  echo ""
  echo "  ❌ No Railway URL found."
  echo "     Run: bash deploy-railway.sh first"
  echo "     Or:  bash rebuild-with-railway.sh https://your-url.railway.app"
  exit 1
fi

# Strip trailing slash
RAILWAY_URL="${RAILWAY_URL%/}"

echo ""
echo "  API URL: $RAILWAY_URL"
echo ""

# Test the backend is live
echo "  Checking backend health..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$RAILWAY_URL/health" --max-time 10 || echo "000")
if [ "$HTTP_STATUS" = "200" ]; then
  echo "  ✓ Backend is live and healthy"
else
  echo "  ⚠  Health check returned $HTTP_STATUS — backend may still be starting up"
  echo "     Continuing anyway..."
fi

# Update the .env.production file
ENV_FILE="$SCRIPT_DIR/.env.production"
echo ""
echo "  Writing $ENV_FILE..."
cat > "$ENV_FILE" <<EOF
EXPO_PUBLIC_API_URL=$RAILWAY_URL
EOF
echo "  ✓ .env.production updated"

# Trigger EAS production build
echo ""
echo "  Starting EAS production build..."
cd "$SCRIPT_DIR"
EXPO_PUBLIC_API_URL="$RAILWAY_URL" npx eas build \
  --platform android \
  --profile preview \
  --non-interactive

echo ""
echo "  ✅ Build submitted! Check progress at:"
echo "     https://expo.dev/accounts/warfield2016/projects/seeker-ai-copilot/builds"
