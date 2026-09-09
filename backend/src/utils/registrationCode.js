import Registration from '../models/Registration.js';
import RegistrationForm from '../models/RegistrationForm.js';
import Role from '../models/Role.js';
import Pass from '../models/Pass.js';
import {
  PAY_FREQUENCY_CODE_LETTERS,
  GENDER_CODE_LETTERS,
} from '../constants/index.js';

const LABOUR_TYPE_VALUE = /^(daily|weekly|monthly|custom(?:\s+days)?)\s+(male|female)$/i;

/** Fixed registration-code prefixes for roles that do not use Labour Type. */
export const ROLE_CODE_PREFIXES = {
  jattu: 'JA',
};

/** Old random format e.g. SAMS-MR0LT9JX-CVNY — must not be issued going forward. */
export function isLegacySamsCode(code) {
  return typeof code === 'string' && /^SAMS-/i.test(code.trim());
}

function isLabourTypeField(field) {
  const label = String(field?.label || '').toLowerCase().trim();
  const id = String(field?.fieldId || '').toLowerCase().trim();
  return (
    label.includes('labour type') ||
    label.includes('labor type') ||
    id.includes('labourtype') ||
    id.includes('labortype') ||
    /labour\s*type|labor\s*type/i.test(String(field?.fieldId || ''))
  );
}

/**
 * Labour type is stored under a form fieldId (often a UUID), not the label key.
 */
export function extractLabourType(registration, fields = []) {
  const formData = registration?.formData || {};

  for (const field of fields) {
    if (!isLabourTypeField(field)) continue;
    const value = formData?.[field.fieldId];
    if (value != null && String(value).trim()) return String(value).trim();
  }

  for (const [key, value] of Object.entries(formData)) {
    if (!/labour\s*type|labor\s*type/i.test(key)) continue;
    if (value != null && String(value).trim()) return String(value).trim();
  }

  for (const value of Object.values(formData)) {
    if (typeof value !== 'string') continue;
    if (LABOUR_TYPE_VALUE.test(value.trim())) return value.trim();
  }

  return null;
}

/**
 * Prefix from labour type ("Daily Male" → DM) or payFrequency + gender (daily, male → DM).
 */
export function buildRegistrationCodePrefix(labourTypeOrPayFrequency, gender) {
  if (labourTypeOrPayFrequency && typeof labourTypeOrPayFrequency === 'string') {
    const labourType = labourTypeOrPayFrequency.trim();
    if (LABOUR_TYPE_VALUE.test(labourType) || (!gender && labourType.includes(' '))) {
      const parts = labourType.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        return `${parts[0][0].toUpperCase()}${parts[1][0].toUpperCase()}`;
      }
    }
  }

  const freqLetter = PAY_FREQUENCY_CODE_LETTERS[labourTypeOrPayFrequency];
  const genderLetter = GENDER_CODE_LETTERS[gender];
  if (freqLetter && genderLetter) return `${freqLetter}${genderLetter}`;

  return null;
}

async function loadFormFields(registration) {
  const formId = registration?.formId?._id || registration?.formId;
  if (!formId) return [];
  const form = await RegistrationForm.findById(formId).select('fields').lean();
  return form?.fields || [];
}

async function loadRole(registration) {
  if (registration?.roleId && typeof registration.roleId === 'object' && registration.roleId.slug) {
    return registration.roleId;
  }
  const roleId = registration?.roleId?._id || registration?.roleId;
  if (!roleId) return null;
  return Role.findById(roleId).select('slug name').lean();
}

/**
 * Role-specific fixed prefixes (e.g. JATTU → JA0001).
 */
export function roleRegistrationCodePrefix(role) {
  const slug = String(role?.slug || '').toLowerCase().trim();
  if (slug && ROLE_CODE_PREFIXES[slug]) return ROLE_CODE_PREFIXES[slug];

  const name = String(role?.name || '').toLowerCase().trim();
  if (name === 'jattu' || name.includes('jattu')) return ROLE_CODE_PREFIXES.jattu;

  return null;
}

async function resolveRegistrationCodePrefix(registration) {
  const role = await loadRole(registration);
  const rolePrefix = roleRegistrationCodePrefix(role);
  if (rolePrefix) return rolePrefix;

  const fields = await loadFormFields(registration);
  const labourType = extractLabourType(registration, fields);
  return (
    buildRegistrationCodePrefix(labourType) ||
    buildRegistrationCodePrefix(registration.payFrequency, registration.gender)
  );
}

async function nextSequentialCode(prefix) {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Case-insensitive match so ja0001 and JA0001 share one series.
  const existing = await Registration.find({
    registrationCode: new RegExp(`^${escaped}\\d{4,}$`, 'i'),
  })
    .select('registrationCode')
    .lean();

  let maxSeq = 0;
  for (const row of existing) {
    const match = String(row.registrationCode || '').match(new RegExp(`^${escaped}(\\d+)$`, 'i'));
    if (!match) continue;
    const n = Number(match[1]);
    if (Number.isFinite(n) && n > maxSeq) maxSeq = n;
  }

  return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
}

/**
 * Assigns registration codes:
 * - JATTU → JA0001, JA0002, …
 * - Labour → DM0001 / DF0001 / WM0001 / WF0001 from Labour Type
 */
export async function generateRegistrationCode(registration, { maxAttempts = 8 } = {}) {
  const prefix = await resolveRegistrationCodePrefix(registration);

  if (!prefix) {
    throw new Error(
      'A valid Labour Type (e.g. Daily Male) is required to generate a registration code (e.g. DM0001)'
    );
  }

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const code = await nextSequentialCode(prefix);
    const clash = await Registration.exists({
      registrationCode: new RegExp(`^${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    });
    if (!clash) return code;
  }

  throw new Error('Could not allocate a unique registration code. Please try again.');
}

/**
 * True when this registration should receive (or replace a legacy SAMS- code with)
 * a sequential role/labour code.
 */
export function shouldAssignRegistrationCode(registration) {
  if (!registration?.registrationCode) return true;
  return isLegacySamsCode(registration.registrationCode);
}

export async function canBuildRegistrationCodePrefix(registration) {
  return Boolean(await resolveRegistrationCodePrefix(registration));
}

/** Keep Pass documents in sync when the registration code changes. */
export async function syncPassRegistrationCode(registrationId, registrationCode) {
  if (!registrationId || !registrationCode) return;
  await Pass.updateMany({ registrationId }, { $set: { registrationCode } });
}
