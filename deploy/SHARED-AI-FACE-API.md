# Shared AI Face Server — Integration Guide

Use this document when another application wants to use the **SMAS AI face server** hosted on AWS (Lightsail / EC2).

The AI server does **face recognition only**:

1. Turn a face photo into a **512-d embedding** (InsightFace)
2. Search / store those embeddings in a **FAISS index** (per project namespace)

It does **not** store your users, attendance, or business logic. That stays in **your** app + **your** database.

```
Your app backend  ──HTTP──▶  AWS AI Server (:8000)
       │                         │
       │                    InsightFace → embedding
       │                    FAISS index (per namespace)
       ▼
  Your MongoDB / DB
  (source of truth for embeddings)
```

---

## 1. What you get from the AI host owner

Ask the AI host owner for:

| Item | Example | Required |
|---|---|---|
| **Base URL** | `http://172.26.x.x:8000` (private) or your agreed public/VPN URL | Yes |
| **Namespace** | `acme-gate`, `client-b` (unique per project) | Yes |
| **Model in use** | `buffalo_l` or `buffalo_s` | Yes (must match forever) |
| **Network access** | Same AWS VPC / VPN / allowlisted path to port 8000 | Yes |

> **Network note:** On the default Lightsail layout, port **8000 is not public**. Your backend must reach the AI instance over the **AWS private network** (same region), a VPN, or another path the owner configures. Browser clients should **never** call the AI server directly.

---

## 2. Rules (read before integrating)

1. **One unique namespace per project.** Never share `default` across two apps — a full `/index/sync` from one app will wipe the other app’s faces in that namespace.
2. **Your DB is source of truth.** Save embeddings in your database. The FAISS index on the AI server is only a fast search replica.
3. **Same model forever.** Embeddings from `buffalo_l` are not compatible with `buffalo_s` (and vice versa). If the host changes model, every face must be re-embedded.
4. **Embedding size is always 512.**
5. **Do not expose the AI URL to end users.** Only your backend should call it.
6. Optional full isolation: the host can run a **second AI container on port 8001** (see `deploy/lightsail/ai/docker-compose.yml` profile `second`) instead of sharing one process via namespaces.

---

## 3. Quick start (SMAS / same codebase)

If your project is another SMAS (or SMAS-fork) backend:

```env
AI_SERVER_URL=http://<AI-PRIVATE-OR-REACHABLE-HOST>:8000
FACE_INDEX_NAMESPACE=<your-unique-namespace>
FACE_EMBEDDING_SIZE=512
FACE_MATCH_THRESHOLD=0.42
MIN_MATCH_MARGIN=0.05
SEARCH_TOP_K=5
```

Then restart the backend. On startup it rebuilds the FAISS index for **your namespace only** from your MongoDB verified registrations.

Interactive OpenAPI docs (when reachable): `http://<AI-HOST>:8000/docs`

---

## 4. Quick start (any other backend)

You need HTTP client code that:

| Step | Call |
|---|---|
| Health | `GET /health` |
| Photo → vector | `POST /embed` |
| Enroll into search index | `POST /index/upsert` or full `POST /index/sync` |
| Live photo → who is it? | `POST /embed` then `POST /search` |
| Person removed | `POST /index/remove` |

Send this header on **index + search** calls (required for multi-project):

```http
x-index-namespace: <your-unique-namespace>
```

If you omit it, the server uses namespace `default`.

---

## 5. Typical flows

### A. Enroll a person (registration photo)

```text
1. Client uploads photo → YOUR backend
2. YOUR backend → POST /embed  (multipart image)
3. Save returned embedding[] in YOUR database (with person id)
4. When person is “active/verified” → POST /index/upsert
   { "id": "<your-person-id>", "embedding": [ ...512 floats... ] }
   Header: x-index-namespace: <your-namespace>
```

### B. Recognize a person (gate / attendance scan)

```text
1. Client sends live photo → YOUR backend
2. YOUR backend → POST /embed
3. YOUR backend → POST /search  { embedding, top_k, threshold, min_margin }
   Header: x-index-namespace: <your-namespace>
4. If best.similarity >= threshold and not ambiguous → treat as match
5. Load person details from YOUR database by best.id
6. Apply YOUR business rules (entry/exit, passes, etc.)
```

### C. Rebuild index after deploy / empty FAISS

```text
1. Load all active person embeddings from YOUR database
2. POST /index/sync  { "entries": [ { "id", "embedding" }, ... ] }
   Header: x-index-namespace: <your-namespace>
```

`/index/sync` **replaces the entire index for that namespace**. It does not touch other namespaces.

### D. Delete a person

```text
1. Delete / mark inactive in YOUR database
2. POST /index/remove  { "id": "<your-person-id>" }
   Header: x-index-namespace: <your-namespace>
```

---

## 6. API reference

Base URL: `AI_SERVER_URL` (no trailing slash).

### `GET /health`

```bash
curl -s "$AI_SERVER_URL/health"
```

Example response:

```json
{
  "status": "ok",
  "service": "smas-ai-server",
  "model": "buffalo_l",
  "device": "cpu",
  "embedding_size": 512,
  "match_threshold": 0.42,
  "indexed_faces": 120
}
```

### `POST /embed`

Largest face in the image → one 512-d embedding.

```bash
curl -s -X POST "$AI_SERVER_URL/embed" \
  -F "file=@face.jpg;type=image/jpeg"
```

Success:

```json
{
  "face_detected": true,
  "embedding": [0.01, -0.02, "...512 floats..."],
  "embedding_size": 512,
  "model": "buffalo_l"
}
```

No face → HTTP `400`.

### `POST /embed-multi`

All faces in the frame (activity / crowd). Returns embeddings + boxes (+ optional thumbnails).

```bash
curl -s -X POST "$AI_SERVER_URL/embed-multi" \
  -F "file=@crowd.jpg;type=image/jpeg"
```

### `POST /compare`

Compare two embeddings (e.g. known person vs live photo when you already know the id).

```bash
curl -s -X POST "$AI_SERVER_URL/compare" \
  -H "Content-Type: application/json" \
  -d '{"embedding1":[...],"embedding2":[...]}'
```

Returns cosine `similarity` (higher = more alike). Typical match threshold: **0.42** (confirm with host).

### `POST /search`

Find nearest enrolled faces in **your namespace**.

```bash
curl -s -X POST "$AI_SERVER_URL/search" \
  -H "Content-Type: application/json" \
  -H "x-index-namespace: your-project-name" \
  -d '{
    "embedding": [ "...512 floats..." ],
    "top_k": 5,
    "threshold": 0.42,
    "min_margin": 0.05
  }'
```

Useful fields:

| Field | Meaning |
|---|---|
| `best` | Top match `{ id, similarity }` if any |
| `matches` | Top-K list |
| `ambiguous` | `true` if top-2 scores are too close (`min_margin`) — do **not** auto-accept |

### `POST /index/upsert`

Add or update one person in the FAISS index.

```bash
curl -s -X POST "$AI_SERVER_URL/index/upsert" \
  -H "Content-Type: application/json" \
  -H "x-index-namespace: your-project-name" \
  -d '{"id":"person-123","embedding":[...512 floats...]}'
```

### `POST /index/sync`

Replace **all** faces in your namespace.

```bash
curl -s -X POST "$AI_SERVER_URL/index/sync" \
  -H "Content-Type: application/json" \
  -H "x-index-namespace: your-project-name" \
  -d '{"entries":[{"id":"p1","embedding":[...]},{"id":"p2","embedding":[...]}]}'
```

### `POST /index/remove`

```bash
curl -s -X POST "$AI_SERVER_URL/index/remove" \
  -H "Content-Type: application/json" \
  -H "x-index-namespace: your-project-name" \
  -d '{"id":"person-123"}'
```

### `GET /index/stats`

```bash
curl -s "$AI_SERVER_URL/index/stats" \
  -H "x-index-namespace: your-project-name"
```

---

## 7. Suggested client timeouts

| Call | Suggested timeout |
|---|---|
| `/health` | 5s |
| `/embed`, `/embed-multi`, `/search`, `/compare` | 60s (CPU + cold start) |
| `/index/sync` (large) | 60s+ |

---

## 8. Minimal Node.js example

```js
const AI_SERVER_URL = process.env.AI_SERVER_URL;
const NAMESPACE = process.env.FACE_INDEX_NAMESPACE; // e.g. "acme-gate"

function nsHeaders(extra = {}) {
  return {
    ...extra,
    ...(NAMESPACE && NAMESPACE !== 'default'
      ? { 'x-index-namespace': NAMESPACE }
      : {}),
  };
}

async function embedPhoto(buffer, filename = 'photo.jpg') {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: 'image/jpeg' }), filename);
  const res = await fetch(`${AI_SERVER_URL}/embed`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json(); // { face_detected, embedding, ... }
}

async function searchFace(embedding) {
  const res = await fetch(`${AI_SERVER_URL}/search`, {
    method: 'POST',
    headers: nsHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      embedding,
      top_k: 5,
      threshold: 0.42,
      min_margin: 0.05,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function upsertFace(id, embedding) {
  const res = await fetch(`${AI_SERVER_URL}/index/upsert`, {
    method: 'POST',
    headers: nsHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ id, embedding }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
```

Reference implementation in this repo: `backend/src/services/aiClient.js`.

---

## 9. Checklist for a new project

- [ ] Received reachable `AI_SERVER_URL` and unique `FACE_INDEX_NAMESPACE`
- [ ] Backend (not browser) can `GET /health`
- [ ] Confirmed model name matches host (`buffalo_l` / `buffalo_s`)
- [ ] Enroll path: embed → save in **your** DB → upsert/sync with namespace header
- [ ] Recognize path: embed → search with same namespace → apply your business logic
- [ ] Delete path: remove from your DB + `/index/remove`
- [ ] Startup (or cron) full `/index/sync` so FAISS matches your DB after AI restarts
- [ ] Namespace is unique (not `default` if another app already uses it)

---

## 10. Troubleshooting

| Symptom | Likely cause |
|---|---|
| Connection refused / timeout | No private-network / VPN path to AI host; wrong URL/port |
| Always no matches | Forgot namespace header; never upserted/synced; empty index |
| Matches wrong project’s people | Two apps sharing the same namespace (often both `default`) |
| Matches break after AI restart | FAISS was empty; run `/index/sync` from your DB again |
| “No face detected” | Bad lighting / angle / image; or not an image upload |
| Scores look random after host model change | Re-embed all photos with the new model |

---

## 11. What this server is / is not

| Is | Is not |
|---|---|
| Shared face embed + FAISS search API | Your user database |
| Multi-project via `x-index-namespace` | Attendance / gate business logic |
| CPU InsightFace (`buffalo_*`) | Liveness / spoof detection (unless added later) |

For SMAS-specific AWS Lightsail install steps (creating the AI instance itself), see `deploy/lightsail/README.md`.
