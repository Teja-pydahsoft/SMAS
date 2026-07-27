/**
 * Repair Pass.holderPhotoUrl entries that still point at dead Cloudinary URLs
 * by copying the linked registration's (already migrated) S3 photo.
 *
 *   node scripts/repair-pass-photos-from-registration.mjs
 *   node scripts/repair-pass-photos-from-registration.mjs --dry-run
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import Pass from '../src/models/Pass.js';
import Registration from '../src/models/Registration.js';
import { isS3Url, extractS3Key } from '../src/services/s3StorageService.js';
import { photoUrlFromPath } from '../src/utils/displayInfo.js';

const DRY_RUN = process.argv.includes('--dry-run');

function proxyFromStored(photoPath) {
  if (!photoPath) return null;
  if (isS3Url(photoPath)) {
    const key = extractS3Key(photoPath);
    if (!key) return null;
    return `/uploads/s3/${key.split('/').map(encodeURIComponent).join('/')}`;
  }
  return photoUrlFromPath(photoPath);
}

await mongoose.connect(process.env.MONGODB_URI);

const passes = await Pass.find({
  holderPhotoUrl: { $regex: /cloudinary\.com/i },
}).select('_id passCode registrationId holderPhotoUrl');

console.log(`Passes still on Cloudinary: ${passes.length}`);
console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`);

let ok = 0;
let fail = 0;
let noReg = 0;
let noPhoto = 0;

for (const pass of passes) {
  const tag = pass.passCode || String(pass._id);
  try {
    if (!pass.registrationId) {
      noReg += 1;
      console.warn(`  no-reg ${tag}`);
      continue;
    }
    const reg = await Registration.findById(pass.registrationId).select('photoPath');
    if (!reg?.photoPath) {
      noPhoto += 1;
      console.warn(`  no-photo ${tag}`);
      continue;
    }
    const next = proxyFromStored(reg.photoPath);
    if (!next) {
      noPhoto += 1;
      console.warn(`  bad-photo ${tag}`);
      continue;
    }
    if (DRY_RUN) {
      ok += 1;
      if (ok <= 5 || ok % 50 === 0) console.log(`  dry ${tag} → ${next}`);
      continue;
    }
    pass.holderPhotoUrl = next;
    await pass.save();
    ok += 1;
    if (ok <= 5 || ok % 50 === 0) console.log(`  ok  ${tag}`);
  } catch (err) {
    fail += 1;
    console.error(`  FAIL ${tag}: ${err.message}`);
  }
}

console.log(`\nSummary: ok=${ok} noReg=${noReg} noPhoto=${noPhoto} fail=${fail}`);
await mongoose.disconnect();
process.exit(fail > 0 ? 1 : 0);
