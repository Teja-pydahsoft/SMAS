import Registration from '../models/Registration.js';
import { REGISTRATION_STATUS } from '../constants/index.js';
import {
  generateRegistrationCode,
  isLegacySamsCode,
  shouldAssignRegistrationCode,
  syncPassRegistrationCode,
  canBuildRegistrationCodePrefix,
} from '../utils/registrationCode.js';

/**
 * On startup: replace legacy SAMS-… codes and fill missing codes
 * (Labour Type → DM0001…, JATTU → JA0001…).
 */
export async function migrateLegacyRegistrationCodes() {
  const candidates = await Registration.find({
    status: REGISTRATION_STATUS.VERIFIED,
    $or: [
      { registrationCode: { $regex: /^SAMS-/i } },
      { registrationCode: { $exists: false } },
      { registrationCode: null },
      { registrationCode: '' },
    ],
  }).select('_id registrationCode payFrequency gender formData formId roleId');

  if (candidates.length === 0) {
    return { upgraded: 0, skipped: 0, skippedDetails: [] };
  }

  let upgraded = 0;
  let skipped = 0;
  const skippedDetails = [];

  for (const reg of candidates) {
    if (reg.registrationCode && !isLegacySamsCode(reg.registrationCode) && !shouldAssignRegistrationCode(reg)) {
      continue;
    }

    const canBuild = await canBuildRegistrationCodePrefix(reg);
    if (!canBuild) {
      skipped += 1;
      skippedDetails.push({
        id: String(reg._id),
        oldCode: reg.registrationCode || null,
        missing: ['codePrefix'],
      });
      continue;
    }

    const oldCode = reg.registrationCode || null;
    if (oldCode && !isLegacySamsCode(oldCode)) {
      continue;
    }

    const newCode = await generateRegistrationCode(reg);
    reg.registrationCode = newCode;
    await reg.save();
    await syncPassRegistrationCode(reg._id, newCode);
    upgraded += 1;
  }

  return { upgraded, skipped, skippedDetails };
}
