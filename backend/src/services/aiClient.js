import path from 'path';

const AI_SERVER_URL = process.env.AI_SERVER_URL || 'http://localhost:8000';
const HF_TOKEN = process.env.HF_TOKEN || '';

// Namespace isolates this project's face index on the shared AI server.
// Set FACE_INDEX_NAMESPACE in .env to a unique value per project
// (e.g. "project-alpha", "project-beta"). Defaults to "default".
const FACE_INDEX_NAMESPACE = (process.env.FACE_INDEX_NAMESPACE || 'default').trim();

function aiHeaders(extra = {}) {
  const headers = { ...extra };
  if (HF_TOKEN) {
    headers.Authorization = `Bearer ${HF_TOKEN}`;
  }
  // Always send the namespace so the AI server routes to the correct index
  if (FACE_INDEX_NAMESPACE && FACE_INDEX_NAMESPACE !== 'default') {
    headers['x-index-namespace'] = FACE_INDEX_NAMESPACE;
  }
  return headers;
}

function mimeFromFilename(filename = '') {
  const ext = path.extname(filename).toLowerCase();
  const map = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
  };
  return map[ext] || 'image/jpeg';
}

/**
 * Face-recognition calls (embed/compare/search) get a long timeout so cold
 * starts on the AI host never abort a real scan; everything else gets a short
 * timeout so a hung AI server can't pile up pending requests in this process.
 */
const AI_FACE_TIMEOUT_MS = parseInt(process.env.AI_FACE_TIMEOUT_MS || '60000', 10);
const AI_ADMIN_TIMEOUT_MS = parseInt(process.env.AI_ADMIN_TIMEOUT_MS || '15000', 10);
const AI_HEALTH_TIMEOUT_MS = parseInt(process.env.AI_HEALTH_TIMEOUT_MS || '5000', 10);

async function aiFetch(pathname, options = {}, timeoutMs = AI_ADMIN_TIMEOUT_MS) {
  let response;
  try {
    response = await fetch(`${AI_SERVER_URL}${pathname}`, {
      ...options,
      headers: aiHeaders(options.headers),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw new Error(`AI server timed out after ${Math.round(timeoutMs / 1000)}s (${pathname})`);
    }
    throw err;
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || error.message || `AI server error: ${response.status}`);
  }
  return response.json();
}

export async function extractFaceEmbedding(imageBuffer, filename = 'photo.jpg', mimeType) {
  const type = mimeType || mimeFromFilename(filename);
  const formData = new FormData();
  formData.append('file', new Blob([imageBuffer], { type }), filename);

  return aiFetch('/embed', { method: 'POST', body: formData }, AI_FACE_TIMEOUT_MS);
}

export async function compareFaceEmbeddings(embedding1, embedding2) {
  return aiFetch(
    '/compare',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embedding1, embedding2 }),
    },
    AI_FACE_TIMEOUT_MS
  );
}

export async function searchFaceEmbeddings(embedding, options = {}) {
  const { topK, threshold, minMargin } = options;
  return aiFetch(
    '/search',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embedding,
        top_k: topK,
        threshold,
        min_margin: minMargin,
      }),
    },
    AI_FACE_TIMEOUT_MS
  );
}

export async function syncFaceIndex(entries) {
  // Full index sync can carry thousands of embeddings — allow the long timeout.
  return aiFetch(
    '/index/sync',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries }),
    },
    AI_FACE_TIMEOUT_MS
  );
}

export async function upsertFaceIndexEntry(id, embedding) {
  return aiFetch('/index/upsert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, embedding }),
  });
}

export async function removeFaceIndexEntry(id) {
  return aiFetch('/index/remove', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
}

export async function getFaceIndexStats() {
  return aiFetch('/index/stats');
}

export async function checkAiServerHealth() {
  try {
    const response = await fetch(`${AI_SERVER_URL}/health`, {
      headers: aiHeaders(),
      signal: AbortSignal.timeout(AI_HEALTH_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForAiServer(maxAttempts = 15, delayMs = 2000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (await checkAiServerHealth()) {
      return true;
    }
    if (attempt < maxAttempts) {
      await sleep(delayMs);
    }
  }
  return false;
}
