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

Free CPU spaces get **2 vCPU and 16 GB RAM** — enough for InsightFace.

### Steps

1. Sign up at [huggingface.co](https://huggingface.co) (GitHub login is fine — **no card**).
2. **New Space** → **Docker** → name it e.g. `teja-smas-ai`.
3. **Connect GitHub** → select `Teja-pydahsoft/SMAS`.
4. In Space **Settings** → **Repository**:
   - **Dockerfile path:** `ai-server/Dockerfile`
   - **App port:** `8000`
5. Add Space **Variables** (Settings → Variables):

   | Name | Value |
   |------|-------|
   | `HOST` | `0.0.0.0` |
   | `PORT` | `8000` |
   | `INSIGHTFACE_MODEL` | `buffalo_s` |
   | `DET_SIZE` | `320,320` |
   | `CPU_THREADS` | `2` |
   | `INDEX_DIR` | `/tmp/data` |

6. Wait for build (first time **10–20 min** — downloads models).
7. Your URL: `https://teja-smas-ai.hf.space` (or your space name).
8. Test: `https://YOUR-SPACE.hf.space/health`
9. On **Render** → backend env → set:
   ```
   AI_SERVER_URL=https://YOUR-SPACE.hf.space
   ```

**Note:** HF Spaces sleep when idle; first request after sleep can take 30–60s.

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
