/**
 * Copy a MongoDB database from production (or any source) into local (or any dest).
 * Does NOT delete or modify the source database.
 *
 * Usage (from backend/):
 *
 *   # 1) Put production URI in env (do NOT commit this):
 *   #    SOURCE_MONGODB_URI=mongodb+srv://...@.../SMAS
 *   #    DEST_MONGODB_URI=mongodb://localhost:27017/smas   (default)
 *
 *   # 2) Preview counts only:
 *   node scripts/copy-db.mjs --dry-run
 *
 *   # 3) Copy (replaces matching collections on dest):
 *   node scripts/copy-db.mjs --confirm
 *
 *   # Optional:
 *   node scripts/copy-db.mjs --confirm --drop-dest   # drop entire dest DB first
 *   node scripts/copy-db.mjs --confirm --exclude=systemusers,sessions
 *
 * Or pass URIs inline (PowerShell):
 *   $env:SOURCE_MONGODB_URI="mongodb+srv://..."; node scripts/copy-db.mjs --confirm
 */
import 'dotenv/config';
import mongoose from 'mongoose';

const DRY_RUN = process.argv.includes('--dry-run');
const CONFIRM = process.argv.includes('--confirm');
const DROP_DEST = process.argv.includes('--drop-dest');

const excludeArg = process.argv.find((a) => a.startsWith('--exclude='));
const EXCLUDE = new Set(
  (excludeArg?.split('=')[1] || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);

const SOURCE_URI = (process.env.SOURCE_MONGODB_URI || process.env.PROD_MONGODB_URI || '').trim();
const DEST_URI = (
  process.env.DEST_MONGODB_URI ||
  process.env.LOCAL_MONGODB_URI ||
  'mongodb://localhost:27017/smas'
).trim();

const BATCH_SIZE = 500;
const SKIP_NAME_PREFIXES = ['system.'];

function redactUri(uri) {
  if (!uri) return '(empty)';
  try {
    const u = new URL(uri.replace(/^mongodb\+srv/, 'https').replace(/^mongodb/, 'https'));
    const db = u.pathname?.replace(/^\//, '') || '(default)';
    return `${u.protocol.replace('https', uri.startsWith('mongodb+srv') ? 'mongodb+srv' : 'mongodb')}//***@${u.host}/${db}`;
  } catch {
    return uri.replace(/\/\/([^@/]+)@/, '//***@');
  }
}

function shouldSkipCollection(name) {
  const lower = name.toLowerCase();
  if (SKIP_NAME_PREFIXES.some((p) => lower.startsWith(p))) return true;
  if (EXCLUDE.has(lower)) return true;
  return false;
}

async function copyCollection(sourceDb, destDb, name) {
  const sourceCol = sourceDb.collection(name);
  const destCol = destDb.collection(name);
  const total = await sourceCol.countDocuments();

  if (DRY_RUN) {
    console.log(`  [dry] ${name}: ${total} document(s)`);
    return { name, total, copied: 0 };
  }

  // Replace collection contents on dest (source untouched)
  await destCol.deleteMany({});

  if (total === 0) {
    console.log(`  ok   ${name}: 0 docs`);
    return { name, total, copied: 0 };
  }

  let copied = 0;
  const cursor = sourceCol.find({}).batchSize(BATCH_SIZE);
  let batch = [];

  for await (const doc of cursor) {
    batch.push(doc);
    if (batch.length >= BATCH_SIZE) {
      await destCol.insertMany(batch, { ordered: false });
      copied += batch.length;
      process.stdout.write(`\r  …    ${name}: ${copied}/${total}`);
      batch = [];
    }
  }
  if (batch.length) {
    await destCol.insertMany(batch, { ordered: false });
    copied += batch.length;
  }
  process.stdout.write(`\r  ok   ${name}: ${copied}/${total} docs          \n`);

  // Copy indexes (ignore default _id_)
  try {
    const indexes = await sourceCol.indexes();
    for (const idx of indexes) {
      if (idx.name === '_id_') continue;
      const spec = { ...idx.key };
      const opts = {
        name: idx.name,
        unique: Boolean(idx.unique),
        sparse: Boolean(idx.sparse),
        background: true,
      };
      if (idx.expireAfterSeconds != null) opts.expireAfterSeconds = idx.expireAfterSeconds;
      if (idx.partialFilterExpression) opts.partialFilterExpression = idx.partialFilterExpression;
      try {
        await destCol.createIndex(spec, opts);
      } catch (err) {
        console.warn(`       index ${idx.name} on ${name}: ${err.message}`);
      }
    }
  } catch (err) {
    console.warn(`       could not copy indexes for ${name}: ${err.message}`);
  }

  return { name, total, copied };
}

async function main() {
  if (!SOURCE_URI) {
    console.error('Missing SOURCE_MONGODB_URI (or PROD_MONGODB_URI).');
    console.error('Set it to your production Atlas connection string, then re-run.');
    process.exit(1);
  }
  if (!DEST_URI) {
    console.error('Missing DEST_MONGODB_URI.');
    process.exit(1);
  }
  if (SOURCE_URI === DEST_URI) {
    console.error('Source and destination URIs are identical — refusing to run.');
    process.exit(1);
  }
  if (!DRY_RUN && !CONFIRM) {
    console.error('Refusing to write without --confirm (or use --dry-run to preview).');
    process.exit(1);
  }

  console.log('MongoDB copy');
  console.log(`  Mode   : ${DRY_RUN ? 'DRY RUN' : 'LIVE copy → dest'}`);
  console.log(`  Source : ${redactUri(SOURCE_URI)}`);
  console.log(`  Dest   : ${redactUri(DEST_URI)}`);
  console.log(`  Drop   : ${DROP_DEST ? 'yes (entire dest DB)' : 'no (replace per collection)'}`);
  if (EXCLUDE.size) console.log(`  Exclude: ${[...EXCLUDE].join(', ')}`);
  console.log('');

  const source = await mongoose.createConnection(SOURCE_URI).asPromise();
  const dest = await mongoose.createConnection(DEST_URI).asPromise();
  const sourceDb = source.db;
  const destDb = dest.db;

  try {
    const collections = (await sourceDb.listCollections().toArray())
      .map((c) => c.name)
      .filter((n) => !shouldSkipCollection(n))
      .sort();

    console.log(`Collections to copy: ${collections.length}\n`);

    if (!DRY_RUN && DROP_DEST) {
      console.log('Dropping destination database...');
      await destDb.dropDatabase();
      console.log('  dest DB dropped\n');
    }

    const results = [];
    for (const name of collections) {
      results.push(await copyCollection(sourceDb, destDb, name));
    }

    const docs = results.reduce((n, r) => n + r.total, 0);
    console.log('\n=== Summary ===');
    console.log(`collections: ${results.length}`);
    console.log(`documents  : ${docs}`);
    if (DRY_RUN) {
      console.log('\nDry run only — no data written. Re-run with --confirm to copy.');
    } else {
      console.log('\nDone. Point local .env MONGODB_URI at the dest, then restart the backend.');
    }
  } finally {
    await source.close();
    await dest.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
