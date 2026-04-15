#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# dev.sh — Start the full muff local development environment
#
# Starts 3 processes in parallel:
#   1. Python FastAPI backend (port 3000)
#   2. Convex dev server (watches convex/ and pushes changes)
#   3. ngrok tunnel → exposes :3000 publicly for Sendblue webhooks
#
# Usage:
#   ./dev.sh           # start everything
#   ./dev.sh --no-ngrok  # skip ngrok (if you have a static tunnel)
#
# Requirements:
#   - .venv/ created: python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
#   - dashboard-src/node_modules: cd dashboard-src && npm install
#   - ngrok installed: brew install ngrok (optional)
#   - ngrok authed: ngrok config add-authtoken <your-token>
#   - .env file with all required vars (see .env.example)
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

NO_NGROK=false
for arg in "$@"; do
  [[ "$arg" == "--no-ngrok" ]] && NO_NGROK=true
done

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "${GREEN}[dev]${NC} $1"; }
warn() { echo -e "${YELLOW}[dev]${NC} $1"; }
err() { echo -e "${RED}[dev]${NC} $1"; }

# ── Preflight checks ──────────────────────────────────────────────────────────
log "Running preflight checks..."

if [[ ! -f ".env" ]]; then
  err ".env not found. Copy .env.example and fill in the values."
  exit 1
fi

if [[ ! -d ".venv" ]]; then
  err ".venv not found. Run: python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt"
  exit 1
fi

if [[ ! -d "dashboard-src/node_modules" ]]; then
  err "dashboard-src/node_modules not found. Run: cd dashboard-src && npm install"
  exit 1
fi

if ! command -v ngrok &>/dev/null && [[ "$NO_NGROK" == "false" ]]; then
  warn "ngrok not found. Starting without it. Install with: brew install ngrok"
  NO_NGROK=true
fi

# ── Process tracking ──────────────────────────────────────────────────────────
PIDS=()

cleanup() {
  echo ""
  log "Shutting down all processes..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  log "All processes stopped."
}
trap cleanup EXIT INT TERM

# ── Start Python backend ──────────────────────────────────────────────────────
log "Starting Python backend on :3000..."
(
  source .venv/bin/activate
  python run.py 2>&1 | sed "s/^/${BLUE}[python]${NC} /"
) &
PIDS+=($!)
sleep 2

# ── Start Convex dev server ───────────────────────────────────────────────────
log "Starting Convex dev server..."
(
  cd dashboard-src
  npx convex dev 2>&1 | sed "s/^/${CYAN}[convex]${NC} /"
) &
PIDS+=($!)
sleep 2

# ── Start ngrok ───────────────────────────────────────────────────────────────
if [[ "$NO_NGROK" == "false" ]]; then
  log "Starting ngrok tunnel on :3000..."
  (
    ngrok http 3000 --log=stdout 2>&1 | sed "s/^/${YELLOW}[ngrok]${NC} /"
  ) &
  PIDS+=($!)
  sleep 3

  # Extract and display the ngrok URL
  NGROK_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    tunnels = data.get('tunnels', [])
    for t in tunnels:
        if t.get('proto') == 'https':
            print(t['public_url'])
            break
except:
    pass
" 2>/dev/null || true)

  if [[ -n "$NGROK_URL" ]]; then
    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                  muff is running!                       ║${NC}"
    echo -e "${GREEN}╠══════════════════════════════════════════════════════════╣${NC}"
    echo -e "${GREEN}║${NC}  Dashboard:   ${CYAN}http://localhost:5173${NC} (if npm run dev)    ${GREEN}║${NC}"
    echo -e "${GREEN}║${NC}  Backend:     ${CYAN}http://localhost:3000${NC}                      ${GREEN}║${NC}"
    echo -e "${GREEN}║${NC}  Convex:      ${CYAN}https://dashboard.convex.dev${NC}               ${GREEN}║${NC}"
    echo -e "${GREEN}║${NC}  Public URL:  ${CYAN}${NGROK_URL}${NC}  ${GREEN}║${NC}"
    echo -e "${GREEN}║${NC}                                                          ${GREEN}║${NC}"
    echo -e "${GREEN}║${NC}  Sendblue webhook:                                       ${GREEN}║${NC}"
    echo -e "${GREEN}║${NC}  ${CYAN}${NGROK_URL}/webhook/sendblue${NC}  ${GREEN}║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
    echo ""
    warn "Update your Sendblue webhook URL if the ngrok URL changed."
  fi
else
  echo ""
  echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║                  muff is running!                       ║${NC}"
  echo -e "${GREEN}╠══════════════════════════════════════════════════════════╣${NC}"
  echo -e "${GREEN}║${NC}  Dashboard:   ${CYAN}http://localhost:5173${NC} (if npm run dev)    ${GREEN}║${NC}"
  echo -e "${GREEN}║${NC}  Backend:     ${CYAN}http://localhost:3000${NC}                      ${GREEN}║${NC}"
  echo -e "${GREEN}║${NC}  Convex:      ${CYAN}https://dashboard.convex.dev${NC}               ${GREEN}║${NC}"
  echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
  echo ""
fi

# ── Wait ──────────────────────────────────────────────────────────────────────
log "Press Ctrl+C to stop all processes."
wait
