# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**muff** is a personal AI agent that communicates via iMessage (through Sendblue). It receives incoming messages via webhook, runs a Claude agent loop with access to Gmail and Google Calendar (via Composio MCP), and replies back via Sendblue. A minimal web dashboard provides visibility into messages, memories, usage, and tool connections.

## Running the App

```bash
# Install dependencies (use a venv)
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Create .env from the required keys in app/config.py, then:
python run.py

# In a separate terminal, start the Convex dev server:
cd dashboard-src
npx convex dev
```

Server starts on port 3000 (configurable via `PORT` env var). There is no hot-reload — restart manually after changes.

## Deployment

See `DEPLOY.md` for full instructions. Two options:
- **Oracle Cloud Always Free** (recommended): ARM VM, 24 GB RAM, never expires
- **Fly.io**: `fly deploy` from the project root (uses `Dockerfile` and `fly.toml`)

Update Sendblue webhook URL to `<host>/webhook/sendblue` after deploying.

Deploy Convex separately with `npx convex deploy` from `dashboard-src/`.

## Architecture

```
Sendblue webhook POST /webhook/sendblue
    → app/routes/webhook.py          # acks 200 immediately
    → app/agent/runner.py::run_agent # runs in FastAPI BackgroundTask
        → app/agent/context.py       # builds system prompt + injects Supermemory results
        → claude_agent_sdk.query()   # Claude Sonnet drives tool loop via Composio MCP
        → app/services/sendblue.py   # sends reply back
        → app/db/convex_client.py    # persists messages + usage to Convex
        → maybe_save_memory()        # async Haiku call to extract long-term facts → Supermemory

Convex crons (dashboard-src/convex/crons.ts)
    → POST /internal/run-routine     # triggers agent pipeline for scheduled routines
```

**Key design decisions:**
- Message history / conversation continuity is handled by Agent SDK sessions (`session_id` persisted per phone number in Convex `sessions` table), not by manually building message history.
- Long-term memory uses Supermemory (searched at prompt-build time, written asynchronously after each exchange by a cheap Haiku call).
- Tool execution is fully delegated to the Agent SDK via Composio MCP — no manual tool dispatch in this codebase.
- **Convex** is the database (replaces SQLite). All tables (messages, usage, sessions, logs, routines, toolCalls, kv) live in Convex with reactive queries.
- **Cron scheduling** is handled by Convex (replaces APScheduler). A morning briefing daily cron and a per-minute routine checker call back into the Python backend via `POST /internal/run-routine`.
- **Real-time dashboard updates** use Convex reactive `useQuery` subscriptions (replaces SSE polling).

## Key Files

| File | Purpose |
|---|---|
| `app/agent/runner.py` | Main agent pipeline — entry point, Agent SDK call, session handling |
| `app/agent/context.py` | System prompt template + memory injection |
| `app/config.py` | All config via pydantic-settings (reads `.env`) |
| `app/db/convex_client.py` | Convex-backed DB layer (same interface as old SQLite layer) |
| `app/services/composio.py` | MCP config for Agent SDK + OAuth/app listing helpers |
| `app/services/supermemory.py` | Memory search/add/list via Supermemory v4 API |
| `app/services/sendblue.py` | iMessage send/receive via Sendblue API |
| `app/routes/dashboard.py` | Dashboard API (`/api/*`) — Supermemory/Composio proxies + routine CRUD |
| `app/main.py` | FastAPI app, startup, and `POST /internal/run-routine` endpoint |
| `dashboard-src/convex/` | Convex schema, queries, mutations, and cron definitions |
| `app/dashboard/` | Static frontend served at `/` |

## Required Environment Variables

All defined in `app/config.py` via pydantic-settings:

```
SENDBLUE_API_KEY, SENDBLUE_API_SECRET, MY_SENDBLUE_NUMBER, USER_PHONE_NUMBER
ANTHROPIC_API_KEY
COMPOSIO_API_KEY, COMPOSIO_USER_ID (default: "personal")
SUPERMEMORY_API_KEY
CONVEX_URL (Convex deployment URL)
CONVEX_DEPLOY_KEY (for server-side mutations)
DASHBOARD_PASSWORD (optional, enables Basic Auth on /api/* routes)
PORT (default: 3000)
```

For the dashboard frontend, also set `VITE_CONVEX_URL` in `dashboard-src/.env.local`.

For Convex environment variables (set via `npx convex env set`):
```
PYTHON_BACKEND_URL (e.g. https://your-server.com — used by cron actions)
```

## Agent Tools

The agent has access to Gmail and Google Calendar via Composio MCP. Allowed tools are scoped to `mcp__composio-calendar__*` and `mcp__composio-gmail__*`. To add more toolkits, update `TOOLKITS` and `get_mcp_config()` in `app/services/composio.py` and add them to `allowed_tools` in `runner.py`.

## Token Cost Tracking

`dashboard-src/convex/usage.ts` contains `PRICING` with per-model costs. Update this when model pricing changes. The Convex `usage.getSummary` query surfaces total, monthly, and per-model breakdowns.

## Dashboard (React + shadcn/ui + Convex)

The dashboard is a Vite + React + TypeScript app in `dashboard-src/`. The build output goes directly to `app/dashboard/` which FastAPI serves. Data flows reactively from Convex via `useQuery` hooks.

### Building the dashboard

```bash
cd dashboard-src
npm run build
```

### Developing the dashboard locally

```bash
# Terminal 1: run the FastAPI backend
python run.py

# Terminal 2: run the Convex dev server
cd dashboard-src
npx convex dev

# Terminal 3: run the Vite dev server
cd dashboard-src
npm run dev   # opens http://localhost:5173 with HMR
```

### Dashboard structure

```
dashboard-src/
  convex/                     # Convex backend functions
    schema.ts                 # Full database schema (7 tables)
    messages.ts               # Message queries/mutations
    sessions.ts               # Session management
    usage.ts                  # Usage tracking + analytics
    logs.ts                   # Log queries
    routines.ts               # Routine CRUD
    toolCalls.ts              # Tool call tracking
    kv.ts                     # Key-value store
    crons.ts                  # Cron job definitions
    cronActions.ts            # Cron action implementations
  src/
    App.tsx                   # Sidebar shell + page router
    main.tsx                  # ConvexProvider setup
    lib/api.ts                # REST fetch wrappers (Supermemory, Composio)
    lib/sse.ts                # Convex-powered useSSE hook (replaces EventSource)
    components/ui/            # shadcn UI primitives
    pages/
      OverviewPage.tsx        # Stat cards + Recharts (Convex useQuery)
      ConversationsPage.tsx   # Session list + messages (Convex useQuery)
      RoutinesPage.tsx        # Routine CRUD (Convex useMutation)
      LogsPage.tsx            # Logs + tool calls + DB viewer
```
