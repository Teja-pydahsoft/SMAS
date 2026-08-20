import Registration from '../models/Registration.js';
import RegistrationForm from '../models/RegistrationForm.js';
import { REGISTRATION_STATUS } from '../constants/index.js';
import {
  generateRegistrationCode,
  isLegacySamsCode,
  extractLabourType,
  buildRegistrationCodePrefix,
  syncPassRegistrationCode,
  shouldAssignRegistrationCode,
} from '../utils/registrationCode.js';

/**
 * On startup: replace legacy SAMS-… codes and fill missing codes from Labour Type
 * (DM0001, DF0001, WM0001, WF0001, …).
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
  }).select('_id registrationCode payFrequency gender formData formId');

  if (candidates.length === 0) {
    return { upgraded: 0, skipped: 0, skippedDetails: [] };
  }

  const formIds = [...new Set(candidates.map((r) => String(r.formId)).filter(Boolean))];
  const forms = await RegistrationForm.find({ _id: { $in: formIds } })
    .select('fields')
    .lean();
  const formFieldsById = new Map(forms.map((f) => [String(f._id), f.fields || []]));

  let upgraded = 0;
  let skipped = 0;
  const skippedDetails = [];

  for (const reg of candidates) {
    if (reg.registrationCode && !isLegacySamsCode(reg.registrationCode) && !shouldAssignRegistrationCode(reg)) {
      continue;
    }

    const fields = formFieldsById.get(String(reg.formId)) || [];
    const labourType = extractLabourType(reg, fields);
    const prefix =
      buildRegistrationCodePrefix(labourType) ||
      buildRegistrationCodePrefix(reg.payFrequency, reg.gender);

    if (!prefix) {
      skipped += 1;
      skippedDetails.push({
        id: String(reg._id),
        oldCode: reg.registrationCode || null,
        missing: ['labourType'],
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
