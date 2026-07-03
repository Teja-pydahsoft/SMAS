# Vercel + Render setup (AI already on Hugging Face)

You have: **Hugging Face** `https://teja-smas-ai.hf.space`  
You need: **MongoDB Atlas** + **Render** (backend) + **Vercel** (frontend)

```
Browser → Vercel → Render (backend) → Hugging Face (AI)
                         ↓
                    MongoDB Atlas
```

---

## Step 1 — MongoDB Atlas (5 minutes)

If you don't have a database yet:

1. [mongodb.com/atlas](https://www.mongodb.com/atlas) → sign up free
2. Create **M0 Free** cluster (region: Mumbai or nearest)
3. **Database Access** → Add user → username + password (save these)
4. **Network Access** → **Add IP** → `0.0.0.0/0` (allow from anywhere)
5. **Database** → **Connect** → Drivers → copy connection string:

```
mongodb+srv://YOUR_USER:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/smas?retryWrites=true&w=majority
```

Replace `YOUR_PASSWORD` with your real password (no `< >` brackets).

---

## Step 2 — Render (backend)

### A. Deploy from Blueprint

1. Go to [dashboard.render.com](https://dashboard.render.com)
2. **New +** → **Blueprint**
3. Connect GitHub → select **Teja-pydahsoft/SMAS**
4. Render reads `render.yaml` and creates **smas-backend**
5. Click **Apply**

### B. Set environment variables

Open **smas-backend** → **Environment** → add or confirm:

| Key | Value |
|-----|-------|
| `MONGODB_URI` | Your Atlas connection string from Step 1 |
| `AI_SERVER_URL` | `https://teja-smas-ai.hf.space` |
| `HF_TOKEN` | Hugging Face **Read** token (only if Space is **Private**) |
| `FRONTEND_URL` | Leave empty for now — set after Vercel (Step 3) |

`JWT_SECRET` and `SUPER_ADMIN_PASSWORD` are auto-generated.  
Copy **SUPER_ADMIN_PASSWORD** from Environment — you need it to log in.

### C. Deploy and test

1. Wait until status is **Live** (first deploy ~2–5 min)
2. Open: `https://smas-backend.onrender.com/api/health`
3. Should show:
   ```json
   { "status": "ok", "services": { "ai": "online" } }
   ```

If `"ai": "offline"`:
- Check `AI_SERVER_URL` is exactly `https://teja-smas-ai.hf.space`
- If HF Space is Private, set `HF_TOKEN` with a Read token
- Or make HF Space **Public** (Settings → Visibility)

**Login credentials:** username `superadmin`, password = `SUPER_ADMIN_PASSWORD` from Render env.

---

## Step 3 — Vercel (frontend)

### A. Import project

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import **Teja-pydahsoft/SMAS** from GitHub
3. **Important:** set **Root Directory** → `frontend` (click Edit)

### B. Environment variable

Before deploy, add:

| Name | Value |
|------|-------|
| `BACKEND_URL` | `https://smas-backend.onrender.com` |

(Use your actual Render URL if the service name differs.)

### C. Deploy

1. Click **Deploy**
2. Wait ~2–3 minutes
3. Note your URL, e.g. `https://smas-xxx.vercel.app`

### D. Connect back to Render

1. Render → **smas-backend** → **Environment**
2. Set `FRONTEND_URL` to your Vercel URL:
   ```
   https://smas-xxx.vercel.app
   ```
3. Save → Render redeploys automatically

---

## Step 4 — Test the full app

1. Open your **Vercel URL** in the browser
2. Go to `/login`
3. Login: `superadmin` + password from Render `SUPER_ADMIN_PASSWORD`
4. Test registration / gate (camera needs HTTPS — Vercel provides this)

Quick health check via frontend proxy:
```
https://YOUR-VERCEL-URL.vercel.app/api/health
```

---

## Checklist

- [ ] MongoDB Atlas cluster + connection string
- [ ] Render `smas-backend` live
- [ ] `/api/health` shows `"ai": "online"`
- [ ] Vercel deployed with `BACKEND_URL`
- [ ] Render `FRONTEND_URL` set to Vercel URL
- [ ] Login works on Vercel site

---

## Free tier notes

- **Render** sleeps after ~15 min idle — first load may take 30–60s
- **Hugging Face** sleeps when idle — first face scan may be slow
- **Uploads** on Render are temporary (lost on redeploy) — OK for testing

---

## Your URLs (fill in after deploy)

| Service | URL |
|---------|-----|
| AI (done) | `https://teja-smas-ai.hf.space` |
| Backend | `https://smas-backend.onrender.com` |
| Frontend | `https://________.vercel.app` |
| Database | MongoDB Atlas (no public URL) |
