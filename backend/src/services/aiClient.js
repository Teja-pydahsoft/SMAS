import path from 'path';

const AI_SERVER_URL = process.env.AI_SERVER_URL || 'http://localhost:8000';

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

async function aiFetch(pathname, options = {}) {
  const response = await fetch(`${AI_SERVER_URL}${pathname}`, options);
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

  return aiFetch('/embed', { method: 'POST', body: formData });
}

export async function compareFaceEmbeddings(embedding1, embedding2) {
  return aiFetch('/compare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embedding1, embedding2 }),
  });
}

export async function searchFaceEmbeddings(embedding, options = {}) {
  const { topK, threshold, minMargin } = options;
  return aiFetch('/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      embedding,
      top_k: topK,
      threshold,
      min_margin: minMargin,
    }),
  });
}

export async function syncFaceIndex(entries) {
  return aiFetch('/index/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries }),
  });
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
    const response = await fetch(`${AI_SERVER_URL}/health`);
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
