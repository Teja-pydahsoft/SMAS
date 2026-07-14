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
 * Build a sequential code like DM0001 from pay frequency + gender.
 * Daily+Male → DM0001, Daily+Female → DF0001, Weekly+Male → WM0001, etc.
 */
export function buildRegistrationCodePrefix(payFrequency, gender) {
  const freqLetter = PAY_FREQUENCY_CODE_LETTERS[payFrequency];
  const genderLetter = GENDER_CODE_LETTERS[gender];
  if (!freqLetter || !genderLetter) return null;
  return `${freqLetter}${genderLetter}`;
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
  const prefix = buildRegistrationCodePrefix(registration?.payFrequency, registration?.gender);
  if (!prefix) {
    throw new Error(
      'Pay frequency and gender are required to generate a registration code (e.g. DM0001)'
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
 * a pay-frequency + gender code.
 */
export function shouldAssignRegistrationCode(registration) {
  if (!buildRegistrationCodePrefix(registration?.payFrequency, registration?.gender)) {
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
