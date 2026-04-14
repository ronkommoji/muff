# Free Deployment Guide

Two solid free options. Oracle Cloud is the better long-term choice (truly free forever,
more RAM than you'll ever need). Fly.io is faster to set up.

---

## Option A — Oracle Cloud Always Free (Recommended)

Oracle gives you a free ARM VM **permanently** — 4 OCPUs, 24 GB RAM. No credit card expiry risk,
no spin-downs.

### 1. Create a free account
Go to https://www.oracle.com/cloud/free/ and sign up.
Select a home region close to you (you can't change it later).
You'll need a credit card for identity verification — you will NOT be charged.

### 2. Create the VM
1. Console → Compute → Instances → Create Instance
2. Change shape: **Ampere → VM.Standard.A1.Flex** (ARM) → 4 OCPUs / 24 GB RAM
3. Image: **Ubuntu 22.04**
4. Add your SSH public key (`~/.ssh/id_rsa.pub` or generate one with `ssh-keygen`)
5. Create — note the public IP

### 3. Open firewall ports
Compute → Instances → your instance → Subnet → Security List → Add Ingress Rules:
- Source: `0.0.0.0/0` | Protocol: TCP | Port: **3000** (dashboard + webhook)
- Source: `0.0.0.0/0` | Protocol: TCP | Port: **443** (HTTPS, if you set up a domain)

Also run on the VM itself:
```bash
sudo iptables -I INPUT -p tcp --dport 3000 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

### 4. Set up the server
SSH in and install deps:
```bash
ssh ubuntu@<YOUR_VM_IP>

sudo apt update && sudo apt install -y python3 python3-pip python3-venv git

# Clone or copy your project (from your Mac)
# On your Mac: scp -r ~/Desktop/muff ubuntu@<YOUR_VM_IP>:~/muff
```

### 5. Configure and run
```bash
cd ~/muff
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
nano .env   # fill in all your API keys
```

### 6. Run as a systemd service (auto-restart, survives reboots)
```bash
sudo nano /etc/systemd/system/muff-agent.service
```

Paste:
```ini
[Unit]
Description=Personal AI Agent
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/muff
EnvironmentFile=/home/ubuntu/muff/.env
ExecStart=/home/ubuntu/muff/.venv/bin/python run.py
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable muff-agent
sudo systemctl start muff-agent
sudo systemctl status muff-agent   # should show active (running)

# Watch logs live:
sudo journalctl -fu muff-agent
```

### 7. Free HTTPS with Caddy (optional but recommended)
If you have a domain (even a free one from https://www.duckdns.org):

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudflare.com/keyless-ssl/linux/debian/caddy.list' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
curl -1sLf 'https://dl.cloudflare.com/keyless-ssl/linux/debian/gpg' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
sudo apt install -y caddy
```

`sudo nano /etc/caddy/Caddyfile`:
```
yourdomain.duckdns.org {
    reverse_proxy localhost:3000
}
```

```bash
sudo systemctl restart caddy
```

Caddy auto-provisions a free Let's Encrypt certificate.

**Webhook URL:** `https://yourdomain.duckdns.org/webhook/sendblue`
**Dashboard:** `https://yourdomain.duckdns.org`

Without a domain, use: `http://<YOUR_VM_IP>:3000`

---

## Option B — Fly.io Free Tier

Fly gives you 3 free shared VMs with auto-HTTPS. Easier setup, but shared hardware and
limited to 256 MB RAM free.

### 1. Install Fly CLI
```bash
curl -L https://fly.io/install.sh | sh
fly auth signup   # or fly auth login
```

### 2. Add Dockerfile to your project
Create `~/Desktop/muff/Dockerfile`:
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN mkdir -p data
EXPOSE 3000
CMD ["python", "run.py"]
```

### 3. Launch
```bash
cd ~/Desktop/muff
fly launch --name muff-agent --region iad --no-deploy
```

Set your secrets (replaces .env on Fly):
```bash
fly secrets set \
  SENDBLUE_API_KEY=sb_key_... \
  SENDBLUE_API_SECRET=sb_secret_... \
  MY_SENDBLUE_NUMBER=+1... \
  USER_PHONE_NUMBER=+1... \
  ANTHROPIC_API_KEY=sk-ant-... \
  COMPOSIO_API_KEY=... \
  COMPOSIO_USER_ID=personal \
  SUPERMEMORY_API_KEY=sm_... \
  DB_PATH=/app/data/agent.db \
  PORT=3000
```

Mount a volume for the SQLite database (free 1 GB):
```bash
fly volumes create muff_data --region iad --size 1
```

Add to `fly.toml` under `[mounts]`:
```toml
[[mounts]]
  source = "muff_data"
  destination = "/app/data"
```

Deploy:
```bash
fly deploy
```

**Webhook URL:** `https://muff-agent.fly.dev/webhook/sendblue`
**Dashboard:** `https://muff-agent.fly.dev`

---

## Set the Webhook URL in Sendblue

Once deployed, go to your **Sendblue dashboard → Webhooks** and set the receive URL to:

| Deployment | Webhook URL |
|---|---|
| Oracle + domain | `https://yourdomain.duckdns.org/webhook/sendblue` |
| Oracle IP only | `http://<YOUR_VM_IP>:3000/webhook/sendblue` |
| Fly.io | `https://muff-agent.fly.dev/webhook/sendblue` |

---

## Deploying Updates

**Oracle Cloud:**
```bash
# On your Mac — copy changed files
scp -r ~/Desktop/muff ubuntu@<YOUR_VM_IP>:~/muff

# On the VM — restart
sudo systemctl restart muff-agent
```

**Fly.io:**
```bash
cd ~/Desktop/muff
fly deploy
```

---

## Free Tier Limits Summary

| | Oracle Cloud | Fly.io |
|---|---|---|
| RAM | 24 GB | 256 MB |
| CPU | 4 ARM cores | Shared |
| Storage | 200 GB block | 1 GB volume |
| Bandwidth | 10 TB/mo | 160 GB/mo |
| HTTPS | Via Caddy + domain | Auto, included |
| Always on | Yes | Yes (within free limits) |
| Expires | Never | Never (requires credit card) |
| Best for | This project | Quick start |
