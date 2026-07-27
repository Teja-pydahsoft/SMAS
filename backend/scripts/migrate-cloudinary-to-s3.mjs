/**
 * Copy Cloudinary-hosted media to S3 and update MongoDB URLs.
 * Does NOT delete anything from Cloudinary.
 *
 * Usage (from backend/):
 *   node scripts/migrate-cloudinary-to-s3.mjs --dry-run
 *   node scripts/migrate-cloudinary-to-s3.mjs
 *   node scripts/migrate-cloudinary-to-s3.mjs --concurrency=8
 *   node scripts/migrate-cloudinary-to-s3.mjs --skip-gate   # optional: skip GateLog photos
 */
import 'dotenv/config';
import path from 'path';
import mongoose from 'mongoose';
import Registration from '../src/models/Registration.js';
import GateLog from '../src/models/GateLog.js';
import ActivitySighting from '../src/models/ActivitySighting.js';
import Pass from '../src/models/Pass.js';
import { isS3Enabled, uploadToS3, isS3Url, extractS3Key } from '../src/services/s3StorageService.js';

const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_GATE = process.argv.includes('--skip-gate');
const concurrencyArg = process.argv.find((a) => a.startsWith('--concurrency='));
const CONCURRENCY = Math.max(1, parseInt(concurrencyArg?.split('=')[1] || '6', 10) || 6);

function isCloudinaryUrl(value) {
  return typeof value === 'string' && value.includes('cloudinary.com');
}

function guessFolderAndName(url, fallbackFolder) {
  try {
    const pathname = new URL(url).pathname;
    const afterUpload = pathname.split('/upload/')[1] || pathname;
    const parts = afterUpload.split('/').filter(Boolean);
    const start = parts[0]?.match(/^v\d+$/) ? 1 : 0;
    const segs = parts.slice(start);
    if (segs[0] === 'smas' && segs.length >= 3) {
      return { folder: segs[1], filename: segs.slice(2).join('/') };
    }
    if (segs.length >= 2) {
      return { folder: segs[segs.length - 2], filename: segs[segs.length - 1] };
    }
    return { folder: fallbackFolder, filename: segs[segs.length - 1] || `file-${Date.now()}` };
  } catch {
    return { folder: fallbackFolder, filename: `file-${Date.now()}` };
  }
}

function guessContentType(url, headerType) {
  if (headerType && headerType !== 'application/octet-stream') return headerType;
  let ext = '';
  try {
    ext = path.extname(new URL(url).pathname).toLowerCase();
  } catch {
    ext = '';
  }
  const map = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.mp4': 'video/mp4',
  };
  return map[ext] || 'application/octet-stream';
}

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = guessContentType(url, res.headers.get('content-type'));
  return { buffer, contentType };
}

async function migrateUrl(url, fallbackFolder) {
  if (!isCloudinaryUrl(url)) return { skipped: true, reason: 'not-cloudinary', url };
  if (isS3Url(url)) return { skipped: true, reason: 'already-s3', url };

  const { folder, filename } = guessFolderAndName(url, fallbackFolder);

  if (DRY_RUN) {
    return {
      skipped: false,
      dryRun: true,
      from: url,
      wouldUpload: `smas/${folder}/${filename}`,
    };
  }

  const { buffer, contentType } = await download(url);
  const result = await uploadToS3(buffer, folder, filename, contentType);
  return { skipped: false, from: url, to: result.url, key: result.key, resourceType: result.resourceType };
}

function proxyPathForS3Url(s3Url) {
  const key = extractS3Key(s3Url);
  if (!key) return s3Url;
  return `/uploads/s3/${key.split('/').map(encodeURIComponent).join('/')}`;
}

async function mapPool(items, limit, worker) {
  let index = 0;
  const results = new Array(items.length);
  async function run() {
    while (index < items.length) {
      const i = index;
      index += 1;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
  return results;
}

async function migrateRegistrationPhotos() {
  const regs = await Registration.find({
    photoPath: { $regex: /cloudinary\.com/i },
  }).select('_id registrationCode photoPath');

  console.log(`\nRegistrations.photoPath: ${regs.length} (concurrency=${CONCURRENCY})`);
  let ok = 0;
  let fail = 0;

  await mapPool(regs, CONCURRENCY, async (reg) => {
    const tag = reg.registrationCode || String(reg._id);
    try {
      const result = await migrateUrl(reg.photoPath, 'registrations');
      if (result.skipped) return;
      if (result.dryRun) {
        ok += 1;
        if (ok <= 5 || ok % 50 === 0) console.log(`  dry  ${tag}: → ${result.wouldUpload}`);
        return;
      }
      reg.photoPath = result.to;
      await reg.save();
      ok += 1;
      if (ok <= 5 || ok % 25 === 0) console.log(`  ok   ${tag} → ${result.key}`);
    } catch (err) {
      fail += 1;
      console.error(`  FAIL ${tag}: ${err.message}`);
    }
  });

  console.log(`  done registrations photos: ok=${ok} fail=${fail}`);
  return { ok, fail, total: regs.length };
}

async function migrateRegistrationMedia() {
  const regs = await Registration.find({
    formData: { $exists: true, $ne: {} },
  }).select('_id registrationCode formData');

  const jobs = [];
  for (const reg of regs) {
    const formData = reg.formData || {};
    for (const [fieldId, value] of Object.entries(formData)) {
      if (typeof value === 'string' && isCloudinaryUrl(value)) {
        jobs.push({ reg, fieldId, kind: 'string', source: value });
      } else if (value && typeof value === 'object') {
        const source = isCloudinaryUrl(value.path)
          ? value.path
          : isCloudinaryUrl(value.url)
            ? value.url
            : null;
        if (source) jobs.push({ reg, fieldId, kind: 'object', source, value });
      }
    }
  }

  console.log(`\nRegistrations.formData media: ${jobs.length}`);
  let ok = 0;
  let fail = 0;
  const dirty = new Map();

  await mapPool(jobs, CONCURRENCY, async (job) => {
    const tag = `${job.reg.registrationCode || job.reg._id}.${job.fieldId}`;
    try {
      const result = await migrateUrl(job.source, 'registrations-media');
      if (result.skipped) return;
      if (result.dryRun) {
        ok += 1;
        return;
      }
      const formData = dirty.get(String(job.reg._id))?.formData || { ...(job.reg.formData || {}) };
      if (job.kind === 'string') {
        formData[job.fieldId] = result.to;
      } else {
        formData[job.fieldId] = {
          ...job.value,
          path: result.to,
          url: result.to,
          resourceType: result.resourceType || job.value.resourceType,
        };
      }
      dirty.set(String(job.reg._id), { reg: job.reg, formData });
      ok += 1;
      console.log(`  ok   ${tag} → ${result.key}`);
    } catch (err) {
      fail += 1;
      console.error(`  FAIL ${tag}: ${err.message}`);
    }
  });

  if (!DRY_RUN) {
    for (const { reg, formData } of dirty.values()) {
      reg.formData = formData;
      reg.markModified('formData');
      await reg.save();
    }
  }

  console.log(`  done media: ok=${ok} fail=${fail}`);
  return { ok, fail, total: jobs.length };
}

async function migrateCollectionPhotoPath(Model, label, folder) {
  const docs = await Model.find({
    photoPath: { $regex: /cloudinary\.com/i },
  }).select('_id photoPath');

  console.log(`\n${label}.photoPath: ${docs.length}`);
  let ok = 0;
  let fail = 0;

  await mapPool(docs, CONCURRENCY, async (doc) => {
    try {
      const result = await migrateUrl(doc.photoPath, folder);
      if (result.skipped) return;
      if (result.dryRun) {
        ok += 1;
        if (ok <= 3 || ok % 100 === 0) console.log(`  dry  ${doc._id}: → ${result.wouldUpload}`);
        return;
      }
      doc.photoPath = result.to;
      await doc.save();
      ok += 1;
      if (ok <= 3 || ok % 50 === 0) console.log(`  ok   ${doc._id} → ${result.key}`);
    } catch (err) {
      fail += 1;
      console.error(`  FAIL ${doc._id}: ${err.message}`);
    }
  });

  console.log(`  done ${label}: ok=${ok} fail=${fail}`);
  return { ok, fail, total: docs.length };
}

async function migratePassHolderPhotos() {
  const passes = await Pass.find({
    holderPhotoUrl: { $regex: /cloudinary\.com/i },
  }).select('_id passCode holderPhotoUrl');

  console.log(`\nPass.holderPhotoUrl: ${passes.length}`);
  let ok = 0;
  let fail = 0;

  await mapPool(passes, CONCURRENCY, async (pass) => {
    const tag = pass.passCode || String(pass._id);
    try {
      const result = await migrateUrl(pass.holderPhotoUrl, 'registrations');
      if (result.skipped) return;
      if (result.dryRun) {
        ok += 1;
        return;
      }
      pass.holderPhotoUrl = proxyPathForS3Url(result.to);
      await pass.save();
      ok += 1;
      if (ok <= 5 || ok % 50 === 0) console.log(`  ok   ${tag}`);
    } catch (err) {
      fail += 1;
      console.error(`  FAIL ${tag}: ${err.message}`);
    }
  });

  console.log(`  done passes: ok=${ok} fail=${fail}`);
  return { ok, fail, total: passes.length };
}

async function main() {
  if (!isS3Enabled()) {
    throw new Error('S3 is not configured. Set AWS_* and S3_BUCKET in .env');
  }

  console.log(`Mode        : ${DRY_RUN ? 'DRY RUN (count only, no downloads/writes)' : 'LIVE copy → S3 + update Mongo'}`);
  console.log(`Bucket      : ${process.env.S3_BUCKET} (${process.env.AWS_REGION || 'ap-south-1'})`);
  console.log(`Concurrency : ${CONCURRENCY}`);
  console.log(`Skip gate   : ${SKIP_GATE}`);
  console.log('Note        : Cloudinary assets are NOT deleted\n');

  await mongoose.connect(process.env.MONGODB_URI);

  const results = {
    registrations: await migrateRegistrationPhotos(),
    media: await migrateRegistrationMedia(),
    gateLogs: SKIP_GATE
      ? { ok: 0, fail: 0, total: 0 }
      : await migrateCollectionPhotoPath(GateLog, 'GateLog', 'gate'),
    activity: await migrateCollectionPhotoPath(ActivitySighting, 'ActivitySighting', 'activity'),
    passes: await migratePassHolderPhotos(),
  };

  if (SKIP_GATE) console.log('\nGateLog: skipped (--skip-gate)');

  console.log('\n=== Summary ===');
  for (const [name, r] of Object.entries(results)) {
    console.log(`${name}: total=${r.total} ok=${r.ok} fail=${r.fail}`);
  }

  await mongoose.disconnect();
  const failed = Object.values(results).reduce((n, r) => n + r.fail, 0);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
