# SMAS — AWS Lightsail Deployment (two instances)

Self-contained client deployment. Nothing here touches the existing
Render / Hugging Face / Vercel setup.

```
                Client's domain (HTTPS)
                        │
┌───────────────────────▼────────────────────────┐   ┌──────────────────────┐
│  APP INSTANCE                                  │   │  AI INSTANCE         │
│  Caddy (443) → Next.js frontend (:3000)        │   │  FastAPI +           │
│             → Express backend  (:3001) ────────┼──▶│  InsightFace + FAISS │
│                    │                           │   │  (:8000, private IP  │
│                MongoDB (internal only)         │   │   only — no public   │
│                                                │   │   port)              │
└────────────────────────────────────────────────┘   └──────────────────────┘
         AWS private network (same region)
```

| | App instance | AI instance |
|---|---|---|
| Plan | 2 GB RAM / 2 vCPU (~$12/mo) | 4 GB RAM / 2 vCPU (~$24/mo) for `buffalo_l`, or 2 GB with `buffalo_s` |
| OS | Ubuntu 24.04 LTS | Ubuntu 24.04 LTS |
| Open ports | 22, 80, 443 | 22 only |
| Region | Same for both (e.g. Mumbai `ap-south-1`) | Same for both |

---

## Step 0 — Prerequisites

- AWS account with Lightsail access.
- A domain (or subdomain) for the client. **Required** — the gate scanner
  needs camera access, which browsers only allow over HTTPS.
- This repo pushed to a git remote the servers can pull from (or use
  `scp`/`rsync` to copy it up).

## Step 1 — Create both instances

For each instance (AI first, so its private IP is ready for the app `.env`):

1. Lightsail → **Create instance** → pick the region (same for both).
2. Platform: **Linux/Unix**, Blueprint: **OS Only → Ubuntu 24.04 LTS**.
3. Pick the plan (see table above).
4. Name them clearly: `smas-app`, `smas-ai`.
5. After creation: **Networking tab → Create static IP** and attach it
   (do this for the app instance; the AI instance doesn't need one, but
   note its **private IP** — `172.26.x.x`).
6. Firewall rules:
   - `smas-app`: keep SSH (22), add HTTP (80) and HTTPS (443).
   - `smas-ai`: keep only SSH (22). **Do not open 8000** — the backend
     reaches it over the private network, which bypasses this firewall.

## Step 2 — Point the domain

At the client's DNS provider, create an **A record** for the domain
(e.g. `smas.clientdomain.com`) pointing to the app instance's **static IP**.
Do this early — Caddy can only issue the HTTPS certificate once DNS resolves.

## Step 3 — Install Docker (both instances)

SSH in (Lightsail browser terminal or `ssh ubuntu@<ip>` with the account
key), then on **each** instance:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
# log out and back in so the group change applies
```

## Step 4 — AI instance first

```bash
git clone <your-repo-url> smas && cd smas/deploy/lightsail/ai
cp .env.example .env
nano .env        # buffalo_l on 4 GB; buffalo_s + DET_SIZE=320,320 on 2 GB
docker compose up -d --build
```

First build takes ~10 minutes (compiles ML dependencies). First request
downloads the InsightFace model once (cached in a volume). Verify from the
instance itself:

```bash
curl http://localhost:8000/health
```

Note the private IP for the next step: Lightsail → `smas-ai` → Networking →
**Private IP**.

## Step 5 — App instance

```bash
git clone <your-repo-url> smas && cd smas/deploy/lightsail/app
cp .env.example .env                  # Caddy: domain only
cp backend.env.example backend.env    # backend: DB, secrets, AI URL
nano .env
nano backend.env
```

`.env` (used by Caddy for HTTPS):

- `DOMAIN` — the client's domain (bare hostname, no `https://`).

`backend.env` (everything the backend needs):

- `MONGODB_URI` — leave the default to use the bundled Mongo container,
  or point it at MongoDB Atlas / any external Mongo.
- `FRONTEND_URL` — the client's domain with `https://` prefix.
- `AI_SERVER_URL` — `http://<AI-private-IP>:8000`.
- `JWT_SECRET` — `openssl rand -hex 32`.
- `SUPER_ADMIN_PASSWORD` — strong, unique per client.
- VAPID keys — `npx web-push generate-vapid-keys` (run anywhere).

Then:

```bash
docker compose up -d --build
```

Caddy obtains the HTTPS certificate automatically on first request
(DNS must already point at the static IP).

## Step 6 — Verify

```bash
# From the app instance — backend can reach the AI server:
curl http://<AI-private-IP>:8000/health

# From your laptop:
curl https://<domain>/api/health     # expect: "ai": "online"
```

Then in the browser: log in with the super admin credentials, create a
test registration with a photo, verify it, and do a gate scan.

## Step 7 — Backups

1. Lightsail → each instance → **Snapshots → Enable automatic snapshots**
   (daily, ~$0.05/GB-month). App-instance snapshots include MongoDB data
   and uploaded photos (Docker volumes live on the instance disk).
2. Optional extra safety — nightly Mongo dump on the app instance:

```bash
(crontab -l 2>/dev/null; echo '0 2 * * * docker exec $(docker ps -qf name=mongodb) mongodump --db smas --archive > $HOME/smas-backup-$(date +\%u).archive') | crontab -
```

(keeps a rolling 7 days of dumps in the home directory).

---

## Updating the app later

```bash
cd ~/smas && git pull
cd deploy/lightsail/app     # or /ai on the AI instance
docker compose up -d --build
```

Face embeddings live in MongoDB; the AI server's index is rebuilt from the
database automatically whenever the backend restarts (or via
`POST /api/gate/reindex`), so redeploys never lose face data.

## Troubleshooting

| Symptom | Check |
|---|---|
| `"ai": "offline"` in `/api/health` | `docker compose logs ai-server` on the AI instance; confirm `AI_SERVER_URL` uses the **private** IP; confirm both instances are in the same region |
| HTTPS certificate not issued | DNS A record must resolve to the static IP (`dig <domain>`); port 80 must be open (Caddy uses it for the ACME challenge) |
| Camera blocked in browser | Page must be served over `https://` — never the bare IP |
| Slow gate scans | On a 2 GB AI instance switch to `buffalo_s` + `DET_SIZE=320,320` in `deploy/lightsail/ai/.env`, then `docker compose up -d` |
| Out of memory on app instance | `docker stats`; consider moving MongoDB to Atlas or upsizing the plan |
