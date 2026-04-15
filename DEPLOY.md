# Deploying muff

## Local Development

Use the startup script to run everything with one command:

```bash
./dev.sh
```

This starts:
- Python FastAPI backend on `:3000`
- Convex dev server (watches `dashboard-src/convex/`)
- ngrok tunnel (exposes `:3000` publicly for Sendblue webhooks)

```bash
./dev.sh --no-ngrok   # skip ngrok if using a static tunnel
```

**First-time setup:**
```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cd dashboard-src && npm install && cd ..
```

---

## Architecture Overview

```
Sendblue → Python FastAPI (your server)
                ↓
           Claude Agent SDK
                ↓
         Composio MCP (Gmail, Calendar)
                ↓
           Convex DB (cloud)
                ↑
         Dashboard (React) ← Convex realtime
```

**Convex is always in the cloud** regardless of where the Python server lives.
**Cron jobs run in Convex** and call back to the Python server via `PYTHON_BACKEND_URL`.

---

## Production Deployment Options

### Option 1: Fly.io (recommended — easiest)

Free tier: 3 shared VMs, 256 MB RAM, auto-HTTPS.

```bash
# Install CLI
curl -L https://fly.io/install.sh | sh
fly auth login

# Deploy (fly.toml already configured)
cd ~/Desktop/muff
fly deploy
```

Set secrets (your .env values):
```bash
fly secrets set \
  SENDBLUE_API_KEY=... \
  SENDBLUE_API_SECRET=... \
  MY_SENDBLUE_NUMBER=+1... \
  USER_PHONE_NUMBER=+1... \
  ANTHROPIC_API_KEY=sk-ant-... \
  COMPOSIO_API_KEY=... \
  COMPOSIO_USER_ID=personal \
  SUPERMEMORY_API_KEY=sm_... \
  CONVEX_URL=https://grand-whale-75.convex.cloud \
  CONVEX_DEPLOY_KEY=... \
  PORT=3000
```

After deploy:
```bash
# Set Convex to call back to your Fly URL
cd dashboard-src
npx convex env set PYTHON_BACKEND_URL https://muff-agent.fly.dev

# Re-enable crons in convex/crons.ts (uncomment the crons)
# Then deploy Convex to production:
npx convex deploy
```

**Webhook URL:** `https://muff-agent.fly.dev/webhook/sendblue`
**Dashboard:** `https://muff-agent.fly.dev`

---

### Option 2: Railway

Railway gives $5/month free credits, simple Git-push deploys, and persistent storage. Good Fly.io alternative.

```bash
# Install CLI
npm install -g @railway/cli
railway login

# Init and deploy
cd ~/Desktop/muff
railway init
railway up
```

Set environment variables in the Railway dashboard, or:
```bash
railway variables set SENDBLUE_API_KEY=... ANTHROPIC_API_KEY=... # etc
```

Add a volume for the DB if not using Convex for all data:
- Railway dashboard → your service → Volumes → Add `/app/data`

**Webhook URL:** `https://<your-app>.railway.app/webhook/sendblue`

---

### Option 3: Oracle Cloud Always Free (best value)

ARM VM with 4 OCPUs + 24 GB RAM, **never expires**, completely free.

```bash
# 1. Create account at cloud.oracle.com
# 2. Create an Always Free ARM instance (Ampere A1)
#    Shape: VM.Standard.A1.Flex, 4 OCPU, 24 GB RAM
#    OS: Ubuntu 22.04
# 3. SSH in and install dependencies
sudo apt update && sudo apt install -y python3 python3-venv python3-pip nginx certbot

# 4. Clone and set up
git clone <your-repo> /home/ubuntu/muff
cd /home/ubuntu/muff
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 5. Create .env with your keys
cp .env.example .env
nano .env

# 6. Create systemd service for auto-restart
sudo tee /etc/systemd/system/muff.service > /dev/null <<EOF
[Unit]
Description=muff agent
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/muff
ExecStart=/home/ubuntu/muff/.venv/bin/python run.py
Restart=always
RestartSec=5
EnvironmentFile=/home/ubuntu/muff/.env

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable muff
sudo systemctl start muff

# 7. Set up nginx reverse proxy + SSL
sudo certbot --nginx -d yourdomain.com
```

**Webhook URL:** `https://yourdomain.com/webhook/sendblue`

---

### Option 4: Render

Free tier available, auto-deploys from GitHub, built-in HTTPS.

1. Push repo to GitHub
2. New Web Service → connect repo
3. Build command: `pip install -r requirements.txt`
4. Start command: `python run.py`
5. Add environment variables in the dashboard

**Note:** Free tier spins down after inactivity — use a paid plan ($7/mo) for always-on.

---

### Vercel (dashboard only — not the Python server)

**Do not deploy the FastAPI app to Vercel.** This project needs a long‑running process (webhooks, background agent runs, Claude Agent SDK loop). Vercel’s serverless model has short timeouts and is a poor fit for that workload. Keep the Python server on Fly.io, Railway, Render, Oracle, or another VM/container host.

**What Vercel is good for here:** hosting the **Vite dashboard** as a static site, while Convex still handles realtime data and your Python API stays on another URL.

1. Deploy the Python backend first and note its public origin, e.g. `https://muff-agent.fly.dev`.
2. In the Vercel project, set `VITE_CONVEX_URL` to your production Convex URL (same as in `.env.local`).
3. Add a rewrite so browser calls to `/api/*` hit your Python server (the dashboard uses same‑origin `/api/...`):

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://muff-agent.fly.dev/api/:path*"
    }
  ]
}
```

Put that in `vercel.json` at the repo root **or** configure equivalent rewrites in the Vercel dashboard. Adjust the destination host to match your real backend.

**Important:** Sendblue webhooks and Convex cron callbacks (`PYTHON_BACKEND_URL`) must still point at the **Python** host, not the Vercel URL.

---

## After Any Deployment

### 1. Update Sendblue webhook
Go to [sendblue.co/dashboard](https://sendblue.co/dashboard) → Webhooks → set URL to:
```
https://<your-domain>/webhook/sendblue
```

### 2. Update Convex backend URL
```bash
cd dashboard-src
npx convex env set PYTHON_BACKEND_URL https://<your-domain>
```

### 3. Deploy Convex to production
```bash
cd dashboard-src
# Re-enable crons in convex/crons.ts first, then:
npx convex deploy
```

### 4. Build and include the dashboard
```bash
cd dashboard-src
npm run build   # outputs to app/dashboard/
```
The dashboard is served as static files by FastAPI at `/`.

---

## Deploying Updates

**Fly.io:**
```bash
fly deploy
```

**Railway:**
```bash
railway up
# or: push to GitHub if auto-deploy is enabled
```

**Oracle/VPS:**
```bash
git pull
sudo systemctl restart muff
```

**Convex functions** (schema, queries, crons):
```bash
cd dashboard-src
npx convex deploy
```

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `SENDBLUE_API_KEY` | ✓ | Sendblue API key |
| `SENDBLUE_API_SECRET` | ✓ | Sendblue API secret |
| `MY_SENDBLUE_NUMBER` | ✓ | Your Sendblue iMessage number |
| `USER_PHONE_NUMBER` | ✓ | Your personal phone number (who the agent talks to) |
| `ANTHROPIC_API_KEY` | ✓ | Claude API key |
| `COMPOSIO_API_KEY` | ✓ | Composio API key |
| `COMPOSIO_USER_ID` | ✓ | Composio user ID (default: `personal`) |
| `SUPERMEMORY_API_KEY` | ✓ | Supermemory API key |
| `CONVEX_URL` | ✓ | Convex deployment URL |
| `CONVEX_DEPLOY_KEY` | ✓ | Convex deploy key (for server-side mutations) |
| `DASHBOARD_PASSWORD` | — | Basic auth password for `/api/*` (leave empty to disable) |
| `PORT` | — | Server port (default: `3000`) |

**Convex environment variables** (set via `npx convex env set`):

| Variable | Description |
|----------|-------------|
| `PYTHON_BACKEND_URL` | Public URL of your Python server (for cron callbacks) |
