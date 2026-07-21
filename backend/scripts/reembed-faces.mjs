/**
 * Batch re-embed existing registrations against the CURRENT AI server.
 *
 * Why: if faces were originally embedded by a different InsightFace model
 * (or det-size) than the one the AI server runs now, the stored 512-d vectors
 * live in a different space and never match on a gate scan ("person not found")
 * even though the embedding exists. Re-uploading a photo fixes one person;
 * this script fixes everyone at once.
 *
 * What it does:
 *   1. Connects to MongoDB (MONGODB_URI)
 *   2. For every registration that has a photo, downloads the stored photo
 *      (Cloudinary URL or local uploads path)
 *   3. Sends it to the current AI server (AI_SERVER_URL) to get a fresh embedding
 *   4. Overwrites registration.faceEmbedding with the new vector
 *   5. Rebuilds the AI server's FAISS index from the DB
 *
 * Run it INSIDE the backend container so it inherits MONGODB_URI / AI_SERVER_URL:
 *   docker compose exec backend node scripts/reembed-faces.mjs
 *   docker compose exec backend node scripts/reembed-faces.mjs --verified-only
 *   docker compose exec backend node scripts/reembed-faces.mjs --dry-run
 */
import fs from 'fs';
import mongoose from 'mongoose';

import Registration from '../src/models/Registration.js';
import { REGISTRATION_STATUS } from '../src/constants/index.js';
import { extractFaceEmbedding } from '../src/services/aiClient.js';
import { rebuildFaceIndexFromDb } from '../src/services/faceIndexService.js';

const EMBEDDING_SIZE = parseInt(process.env.FACE_EMBEDDING_SIZE || '512', 10);
const DRY_RUN = process.argv.includes('--dry-run');
const VERIFIED_ONLY = process.argv.includes('--verified-only');

async function loadImageBuffer(photoPath) {
  if (/^https?:\/\//i.test(photoPath)) {
    const res = await fetch(photoPath);
    if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  if (!fs.existsSync(photoPath)) throw new Error(`local file missing: ${photoPath}`);
  return fs.readFileSync(photoPath);
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set (run inside the backend container).');

  console.log(`AI server : ${process.env.AI_SERVER_URL || 'http://localhost:8000'}`);
  console.log(`Namespace : ${process.env.FACE_INDEX_NAMESPACE || 'default'}`);
  console.log(`Mode      : ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}${VERIFIED_ONLY ? ', verified-only' : ''}\n`);

  await mongoose.connect(uri);

  const filter = { photoPath: { $exists: true, $nin: [null, ''] } };
  if (VERIFIED_ONLY) filter.status = REGISTRATION_STATUS.VERIFIED;

  const regs = await Registration.find(filter).select('_id registrationCode status photoPath');
  console.log(`Found ${regs.length} registration(s) with a photo.\n`);

  const stats = { updated: 0, noFace: 0, failed: 0, skipped: 0 };

  for (const reg of regs) {
    const tag = reg.registrationCode || String(reg._id);
    try {
      const buffer = await loadImageBuffer(reg.photoPath);
      const { embedding, face_detected } = await extractFaceEmbedding(buffer, `${tag}.jpg`);

      if (!face_detected || embedding?.length !== EMBEDDING_SIZE) {
        stats.noFace += 1;
        console.warn(`  SKIP ${tag}: no valid ${EMBEDDING_SIZE}-d face detected`);
        continue;
      }

      if (DRY_RUN) {
        stats.skipped += 1;
        console.log(`  OK   ${tag}: would update (dry run)`);
        continue;
      }

      reg.faceEmbedding = embedding;
      await reg.save();
      stats.updated += 1;
      console.log(`  OK   ${tag}: re-embedded`);
    } catch (err) {
      stats.failed += 1;
      console.error(`  FAIL ${tag}: ${err.message}`);
    }
  }

  console.log(`\nRe-embed summary:`, stats);

  if (!DRY_RUN && stats.updated > 0) {
    console.log('\nRebuilding AI index from DB...');
    const result = await rebuildFaceIndexFromDb();
    console.log('Index rebuilt:', result);
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Fatal:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
