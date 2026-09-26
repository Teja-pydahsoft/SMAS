import Registration from '../models/Registration.js';
import RegistrationForm from '../models/RegistrationForm.js';
import Role from '../models/Role.js';
import Pass from '../models/Pass.js';
import {
  PAY_FREQUENCY_CODE_LETTERS,
  GENDER_CODE_LETTERS,
} from '../constants/index.js';

const LABOUR_TYPE_VALUE = /^(daily|weekly|monthly|custom(?:\s+days)?)\s+(male|female)$/i;

/** Fixed registration-code prefixes mapping for specific slug overrides. */
export const ROLE_CODE_PREFIXES = {
  jattu: 'JA',
};

/** Old random format e.g. SAMS-MR0LT9JX-CVNY — must not be issued going forward. */
export function isLegacySamsCode(code) {
  return typeof code === 'string' && /^SAMS-/i.test(code.trim());
}

/** Check if a role is a Labour / Laborer role. */
export function isLabourRole(role) {
  if (!role) return false;
  const name = String(role.name || '').toLowerCase().trim();
  const slug = String(role.slug || '').toLowerCase().trim();
  return (
    name === 'labour' ||
    name === 'labor' ||
    name === 'labourer' ||
    name === 'laborer' ||
    slug === 'labour' ||
    slug === 'labor' ||
    slug === 'labourer' ||
    slug === 'laborer'
  );
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
 * Role-specific registration code prefixes.
 * - Labour roles return null (they rely on Labour Type codes e.g. DM0001).
 * - Remaining roles use the starting 3 letters of the role name (e.g. Supervisor → SUP0001).
 */
export function roleRegistrationCodePrefix(role) {
  if (!role) return null;
  if (isLabourRole(role)) return null;

  const slug = String(role?.slug || '').toLowerCase().trim();
  if (slug && ROLE_CODE_PREFIXES[slug]) return ROLE_CODE_PREFIXES[slug];

  const name = String(role?.name || '').toLowerCase().trim();
  if (name === 'jattu' || name.includes('jattu')) return ROLE_CODE_PREFIXES.jattu || 'JA';

  const nameOrSlug = String(role?.name || role?.slug || '').trim();
  const clean = nameOrSlug.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (!clean) return 'ROL';
  if (clean.length < 3) return clean.padEnd(3, 'X');
  return clean.slice(0, 3);
}

async function resolveRegistrationCodePrefix(registration) {
  const role = await loadRole(registration);
  const rolePrefix = roleRegistrationCodePrefix(role);
  if (rolePrefix) return rolePrefix;

  // For Labour role:
  const fields = await loadFormFields(registration);
  const labourType = extractLabourType(registration, fields);
  const labourPrefix =
    buildRegistrationCodePrefix(labourType) ||
    buildRegistrationCodePrefix(registration.payFrequency, registration.gender);

  if (labourPrefix) return labourPrefix;

  // Fallback for Labour role if Labour Type is not specified:
  if (isLabourRole(role)) {
    return 'LAB';
  }

  return null;
}

async function nextSequentialCode(prefix) {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Case-insensitive match so sup0001 and SUP0001 share one series.
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
 * - Labour → DM0001 / DF0001 / WM0001 / WF0001 from Labour Type (fallback LAB0001)
 * - Remaining roles → 3-letter prefix + 4 digits (e.g. Supervisor → SUP0001, Engineer → ENG0001)
 */
export async function generateRegistrationCode(registration, { maxAttempts = 8 } = {}) {
  const prefix = await resolveRegistrationCodePrefix(registration);

  if (!prefix) {
    throw new Error('A valid registration code prefix could not be determined for this role.');
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

export function roleUsesRegistrationCode(role) {
  const name = String(role?.name || '').toLowerCase().trim();
  const slug = String(role?.slug || '').toLowerCase().trim();
  return name !== 'visitor' && slug !== 'visitor';
}

/**
 * True when this registration should receive (or replace a legacy SAMS- code with)
 * a sequential role/labour code.
 */
export function shouldAssignRegistrationCode(registration, role) {
  if (role && !roleUsesRegistrationCode(role)) return false;
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
