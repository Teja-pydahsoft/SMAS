import Registration from '../models/Registration.js';
import RegistrationForm from '../models/RegistrationForm.js';
import { GENDERS, REGISTRATION_STATUS } from '../constants/index.js';
import {
  generateRegistrationCode,
  isLegacySamsCode,
  buildRegistrationCodePrefix,
  syncPassRegistrationCode,
} from '../utils/registrationCode.js';

function normalizeGender(value) {
  if (value == null) return null;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return null;
  if (GENDERS.includes(raw)) return raw;
  if (raw === 'm' || raw.startsWith('male')) return 'male';
  if (raw === 'f' || raw.startsWith('female')) return 'female';
  return null;
}

async function inferGender(registration, formFieldsById) {
  const fromField = normalizeGender(registration.gender);
  if (fromField) return fromField;

  const formData = registration.formData || {};
  const fields = formFieldsById.get(String(registration.formId)) || [];

  for (const field of fields) {
    const label = String(field.label || '').toLowerCase();
    const fieldId = String(field.fieldId || '').toLowerCase();
    if (
      !label.includes('gender') &&
      !fieldId.includes('gender') &&
      fieldId !== 'sex' &&
      label !== 'sex'
    ) {
      continue;
    }
    const inferred = normalizeGender(formData[field.fieldId]);
    if (inferred) return inferred;
  }

  for (const [key, value] of Object.entries(formData)) {
    if (!/gender|sex/i.test(key)) continue;
    const inferred = normalizeGender(value);
    if (inferred) return inferred;
  }

  return null;
}

/**
 * On startup: replace legacy SAMS-… codes with pay-frequency + gender codes
 * (DM0001, DF0001, WM0001, WF0001, …). Also fills gender from form data when possible.
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
    const gender = await inferGender(reg, formFieldsById);
    if (gender && reg.gender !== gender) {
      reg.gender = gender;
    }

    if (!buildRegistrationCodePrefix(reg.payFrequency, reg.gender)) {
      skipped += 1;
      skippedDetails.push({
        id: String(reg._id),
        oldCode: reg.registrationCode || null,
        missing: [
          !reg.payFrequency ? 'payFrequency' : null,
          !reg.gender ? 'gender' : null,
        ].filter(Boolean),
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
