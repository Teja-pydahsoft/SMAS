# AI Server Hosting (no debit card)

Fly.io often requires a card even for free tier. Use one of these instead.

| Option | Card needed? | RAM | Best for |
|--------|--------------|-----|----------|
| **Hugging Face Spaces** | No | up to 16 GB (CPU) | **Recommended** — built for ML |
| **Render (Docker)** | Usually no | 512 MB (free) | Same account as backend; may be tight on RAM |
| **Local PC + Cloudflare Tunnel** | No | Your PC RAM | Demos / testing only |

After deploy, set `AI_SERVER_URL` on Render to your AI server URL.

---

## Option 1 — Hugging Face Spaces (recommended)

Hugging Face Spaces are **their own Git repo** — there is no “connect GitHub” button on create.
You push code to:

```
https://huggingface.co/spaces/tejaPydahSoft/teja-smas-ai
```

Your live URL will be:

```
https://teja-smas-ai.hf.space
```

### A. Create the Space (you already did this)

- Owner: `tejaPydahSoft`
- Name: `teja-smas-ai`
- SDK: **Docker**
- Template: **Blank**
- Hardware: **CPU basic (free)**
- Private is fine (Render backend can still call it over HTTPS)

### B. Get a Hugging Face write token

1. [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)
2. **New token** → type **Write**
3. Copy the token (`hf_...`)

### C. Push code from your PC (easiest — use our script)

From the SMAS project folder in PowerShell:

```powershell
cd e:\SMAS
.\deploy\scripts\push-hf-space.ps1 -Token "hf_YOUR_TOKEN_HERE"
```

This copies `ai-server/` into your Space and pushes. HF rebuilds automatically.

### D. Push code manually (if you prefer)

```powershell
cd e:\SMAS
git clone https://tejaPydahSoft:hf_YOUR_TOKEN@huggingface.co/spaces/tejaPydahSoft/teja-smas-ai
cd teja-smas-ai

# Copy ai-server files into this folder (root of Space repo)
copy ..\ai-server\Dockerfile .
copy ..\ai-server\requirements.txt .
xcopy /E /I ..\ai-server\app app
copy ..\deploy\huggingface-space\README.md README.md

git add .
git commit -m "Deploy SMAS ai-server"
git push
```

Your Space repo root must look like:

```
teja-smas-ai/
├── README.md        ← must include sdk: docker and app_port: 8000
├── Dockerfile
├── requirements.txt
└── app/
    ├── main.py
    └── ...
```

### E. Space variables (Settings → Variables)

| Name | Value |
|------|-------|
| `HOST` | `0.0.0.0` |
| `PORT` | `8000` |
| `INSIGHTFACE_MODEL` | `buffalo_s` |
| `DET_SIZE` | `320,320` |
| `CPU_THREADS` | `2` |
| `INDEX_DIR` | `/tmp/data` |

### F. Test and connect to Render

1. Wait for build (first time **10–20 min**).
2. Open: `https://teja-smas-ai.hf.space/health`
3. On **Render** → backend → Environment:

   ```
   AI_SERVER_URL=https://teja-smas-ai.hf.space
   ```

**Private Space:** still works — Render calls your API over the public HTTPS URL. Only the Space *source code* is private.

**Note:** Spaces sleep when idle; first request after sleep can take 30–60s.

---

## Option 2 — Render Docker (same platform as backend)

`render.yaml` includes a second free service `smas-ai-server`. Deploy via **Blueprint** with the backend.

**Caveat:** Render free tier has **512 MB RAM**. InsightFace may fail or be slow. If build crashes with OOM, use Hugging Face instead.

After deploy, set on backend:

```
AI_SERVER_URL=https://smas-ai-server.onrender.com
```

---

## Option 3 — Run AI on your PC (no cloud)

Keep the AI server on your machine; expose it with a free tunnel.

### A. Start AI server locally

```bash
cd ai-server
pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### B. Cloudflare Tunnel (free, no card)

1. Install [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/).
2. Run:

   ```bash
   cloudflared tunnel --url http://localhost:8000
   ```

3. Copy the `https://xxxx.trycloudflare.com` URL.
4. Set `AI_SERVER_URL` on Render to that URL.

**Downside:** Your PC must stay on and connected. Tunnel URL changes each restart unless you set up a named tunnel.

---

## Quick comparison

```
Hugging Face  →  Best free ML hosting, no card, 16 GB RAM
Render Docker →  Easiest if backend already on Render; RAM may be too small
Local tunnel  →  Zero cloud cost; PC must run 24/7
```
