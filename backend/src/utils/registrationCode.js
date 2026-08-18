import Registration from '../models/Registration.js';
import Pass from '../models/Pass.js';
import {
  PAY_FREQUENCY_CODE_LETTERS,
  GENDER_CODE_LETTERS,
} from '../constants/index.js';

/** Old random format e.g. SAMS-MR0LT9JX-CVNY — must not be issued going forward. */
export function isLegacySamsCode(code) {
  return typeof code === 'string' && /^SAMS-/i.test(code.trim());
}

/**
 * Build a sequential code like DM0001 from labour type.
 * Daily Male → DM0001, Daily Female → DF0001, Weekly Male → WM0001, etc.
 */
export function buildRegistrationCodePrefix(labourType) {
  if (!labourType || typeof labourType !== 'string') return null;
  const parts = labourType.split(' ').map(w => w.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0].toUpperCase()}${parts[1][0].toUpperCase()}`;
  }
  return null;
}

function extractLabourType(registration) {
  if (!registration || !registration.formData) return null;
  for (const [key, value] of Object.entries(registration.formData)) {
    if (/labour\s*type/i.test(key) && typeof value === 'string') {
      return value;
    }
  }
  return null;
}

async function nextSequentialCode(prefix) {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const existing = await Registration.find({
    registrationCode: new RegExp(`^${escaped}\\d{4,}$`),
  })
    .select('registrationCode')
    .lean();

  let maxSeq = 0;
  for (const row of existing) {
    const match = String(row.registrationCode || '').match(new RegExp(`^${escaped}(\\d+)$`));
    if (!match) continue;
    const n = Number(match[1]);
    if (Number.isFinite(n) && n > maxSeq) maxSeq = n;
  }

  return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
}

/**
 * Assigns registration codes like DM0001 / DF0001 / WM0001 / WF0001.
 * Never returns the legacy SAMS-… format.
 */
export async function generateRegistrationCode(registration, { maxAttempts = 8 } = {}) {
  const labourType = extractLabourType(registration);
  const prefix = buildRegistrationCodePrefix(labourType);
  if (!prefix) {
    throw new Error(
      'A valid Labour Type (e.g. Daily Male) is required to generate a registration code (e.g. DM0001)'
    );
  }

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const code = await nextSequentialCode(prefix);
    const clash = await Registration.exists({ registrationCode: code });
    if (!clash) return code;
  }

  throw new Error('Could not allocate a unique registration code. Please try again.');
}

/**
 * True when this registration should receive (or replace a legacy SAMS- code with)
 * a labour type code.
 */
export function shouldAssignRegistrationCode(registration) {
  const labourType = extractLabourType(registration);
  if (!buildRegistrationCodePrefix(labourType)) {
    return false;
  }
  if (!registration.registrationCode) return true;
  return isLegacySamsCode(registration.registrationCode);
}

/** Keep Pass documents in sync when the registration code changes. */
export async function syncPassRegistrationCode(registrationId, registrationCode) {
  if (!registrationId || !registrationCode) return;
  await Pass.updateMany({ registrationId }, { $set: { registrationCode } });
}
