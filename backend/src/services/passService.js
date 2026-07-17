import QRCode from 'qrcode';
import Pass from '../models/Pass.js';
import Registration from '../models/Registration.js';
import RegistrationForm from '../models/RegistrationForm.js';
import Role from '../models/Role.js';
import Shift from '../models/Shift.js';
import { PASS_TYPES } from '../constants/index.js';
import { buildDisplayInfo, photoUrlFromPath } from '../utils/displayInfo.js';
import { formatPayFrequencyLabel } from '../utils/paymentCalculation.js';
import {
  todayDateStringIst,
  resolveDayPassValidUntil,
  shiftEndAtIst,
} from '../utils/istTime.js';

function generatePassCode(prefix) {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${rand}`;
}

function todayDateString(date = new Date()) {
  return todayDateStringIst(date);
}

const PAY_AMOUNT_DETAIL_LABELS = new Set([
  'pay amount',
  'amount',
  'per day amount',
  'pay amount (per day)',
  'salary',
  'wage',
  'wages',
]);

/** Strip pay amounts from pass detail rows (registration + day passes). */
function sanitizePassDetails(details = []) {
  return (details || [])
    .filter((d) => {
      const label = String(d?.label || '').trim().toLowerCase();
      return !PAY_AMOUNT_DETAIL_LABELS.has(label);
    })
    .map((d) => {
      const label = String(d?.label || '').trim().toLowerCase();
      if (label !== 'pay frequency') return d;
      // "Weekly · ₹300" → "Weekly"
      const value = String(d?.value || '')
        .replace(/\s*[·•|\-–—]\s*₹[\d,]+(?:\.\d+)?/gi, '')
        .replace(/\s*₹[\d,]+(?:\.\d+)?/gi, '')
        .trim();
      return { ...d, value: value || d.value };
    });
}

export function buildPassVerifyUrl(passCode) {
  const base = (process.env.FRONTEND_URL || 'http://localhost:3000')
    .split(',')[0]
    .trim()
    .replace(/\/$/, '');
  return `${base}/pass/verify/${encodeURIComponent(passCode)}`;
}

export async function buildQrDataUrl(passCode) {
  return QRCode.toDataURL(buildPassVerifyUrl(passCode), {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 280,
    color: { dark: '#0f1419', light: '#ffffff' },
  });
}

async function loadRegistrationContext(registrationId) {
  const registration = await Registration.findById(registrationId)
    .populate('roleId', 'name slug')
    .populate('formId', 'fields');

  if (!registration) throw new Error('Registration not found');
  if (registration.status !== 'verified') {
    throw new Error('Registration must be verified to issue a pass');
  }

  const role = registration.roleId?.name
    ? registration.roleId
    : await Role.findById(registration.roleId);
  const form = registration.formId?.fields
    ? registration.formId
    : await RegistrationForm.findById(registration.formId);

  const display = buildDisplayInfo(registration.formData, form?.fields || []);

  return { registration, role, display };
}

export { loadRegistrationContext };

/**
 * Expected out for display: shift end in IST when known,
 * otherwise the 24h access window from gate check-in.
 * Actual checkout keeps stored validUntil.
 */
async function resolveDisplayValidUntil(pass) {
  if (pass.passType !== PASS_TYPES.DAY_PASS) {
    return pass.validUntil || null;
  }
  if (pass.qrPayload?.gateExitAt) {
    return pass.validUntil || null;
  }

  let startTime = pass.qrPayload?.shiftStartTime || '';
  let endTime = pass.qrPayload?.shiftEndTime || '';
  const shiftId = pass.qrPayload?.shiftId;

  if ((!endTime || !startTime) && shiftId) {
    try {
      const shift = await Shift.findById(shiftId).select('startTime endTime').lean();
      if (shift) {
        startTime = startTime || shift.startTime || '';
        endTime = endTime || shift.endTime || '';
      }
    } catch {
      // keep stored validUntil
    }
  }

  const validDate = pass.validDate || pass.qrPayload?.validDate || todayDateString();
  const fromShift = shiftEndAtIst(validDate, startTime, endTime);
  if (fromShift) return fromShift;

  const entryAt =
    pass.qrPayload?.gateEntryAt || pass.validFrom || pass.createdAt || null;
  return resolveDayPassValidUntil({
    entryAt,
    fallbackDate: new Date(),
  });
}

export async function formatPassResponse(passDoc, qrDataUrl = null) {
  const pass = passDoc.toObject ? passDoc.toObject() : passDoc;
  const qr = qrDataUrl || (pass.passCode ? await buildQrDataUrl(pass.passCode) : null);
  const validUntil = await resolveDisplayValidUntil(pass);

  return {
    ...pass,
    validUntil,
    details: sanitizePassDetails(pass.details),
    qrDataUrl: qr,
    passTitle: pass.passType === PASS_TYPES.REGISTRATION ? 'Registration Pass' : 'Day Pass',
  };
}

/** Build extra system-level fields from the Registration document itself —
 *  mirrors the columns shown in the All Registrations table:
 *  Photo | Name | Role | Contact | Status | Code | Pass | Date          */
function buildRegistrationSystemDetails(registration, role) {
  const extras = [];

  // Role (table col 3)
  if (role?.name) {
    extras.push({ label: 'Role', value: role.name });
  }

  // Contact / phone — only add if NOT already in formData details
  // (displayPhone comes from buildDisplayInfo; we add it explicitly here
  //  so it always appears even when the form field label differs)
  if (registration.formData) {
    // phone is already captured by buildDisplayInfo into display.details,
    // so we skip it here — handled via formData fields
  }

  // Gender (shown as D/M, D/F etc in current pass — keep)
  if (registration.gender) {
    extras.push({ label: 'Gender', value: registration.gender });
  }

  // Pay frequency only — never include pay amount on the printed pass
  if (registration.payFrequency) {
    extras.push({
      label: 'Pay Frequency',
      value: formatPayFrequencyLabel(registration.payFrequency, registration.customPayDays),
    });
  }

  // Status (table col 5)
  if (registration.status) {
    extras.push({
      label: 'Status',
      value: registration.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    });
  }

  // Registration Code (table col 6)
  if (registration.registrationCode) {
    extras.push({ label: 'Registration Code', value: registration.registrationCode });
  }

  // Registered Date (table col 8)
  if (registration.createdAt) {
    const d = new Date(registration.createdAt);
    extras.push({
      label: 'Registered On',
      value: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    });
  }

  return extras;
}

export async function createRegistrationPass(registrationId) {
  const { registration, role, display } = await loadRegistrationContext(registrationId);

  await Pass.updateMany(
    { registrationId, passType: PASS_TYPES.REGISTRATION, isActive: true },
    { isActive: false }
  );

  const passCode = generatePassCode('REG');
  const qrPayload = {
    type: PASS_TYPES.REGISTRATION,
    passCode,
    registrationCode: registration.registrationCode,
    registrationId: registration._id.toString(),
    holderName: display.displayName,
    role: role.name,
    issuedAt: new Date().toISOString(),
  };

  // Merge form details + system-level fields (registration code, role, gender, pay, status, dates)
  const systemExtras = buildRegistrationSystemDetails(registration, role);
  const allDetails = [...display.details, ...systemExtras];

  const pass = await Pass.create({
    passCode,
    passType: PASS_TYPES.REGISTRATION,
    registrationId: registration._id,
    roleId: role._id || registration.roleId,
    validFrom: new Date(),
    holderName: display.displayName,
    holderPhotoUrl: photoUrlFromPath(registration.photoPath),
    roleName: role.name,
    registrationCode: registration.registrationCode,
    details: allDetails,
    qrPayload,
    isActive: true,
  });

  return formatPassResponse(pass, await buildQrDataUrl(passCode));
}

export async function createDayPass(registrationId, gateLogId) {
  const { registration, role, display } = await loadRegistrationContext(registrationId);
  const now = new Date();
  const validDate = todayDateString(now);
  const validUntil = resolveDayPassValidUntil({ entryAt: now, fallbackDate: now });

  const passCode = generatePassCode('DAY');
  const qrPayload = {
    type: PASS_TYPES.DAY_PASS,
    passCode,
    registrationCode: registration.registrationCode,
    registrationId: registration._id.toString(),
    gateLogId: gateLogId?.toString(),
    holderName: display.displayName,
    role: role.name,
    validDate,
    validUntil: validUntil.toISOString(),
    issuedAt: now.toISOString(),
  };

  const pass = await Pass.create({
    passCode,
    passType: PASS_TYPES.DAY_PASS,
    registrationId: registration._id,
    roleId: role._id || registration.roleId,
    gateLogId,
    validDate,
    validFrom: now,
    validUntil,
    holderName: display.displayName,
    holderPhotoUrl: photoUrlFromPath(registration.photoPath),
    roleName: role.name,
    registrationCode: registration.registrationCode,
    details: display.details,
    qrPayload,
    isActive: true,
  });

  return formatPassResponse(pass, await buildQrDataUrl(passCode));
}

export async function getRegistrationPass(registrationId) {
  const pass = await Pass.findOne({
    registrationId,
    passType: PASS_TYPES.REGISTRATION,
    isActive: true,
  }).sort({ createdAt: -1 });

  if (!pass) return null;
  return formatPassResponse(pass);
}

export async function getOrCreateRegistrationPass(registrationId) {
  // Always recreate to pick up latest form data + system fields (gender, pay frequency etc.)
  // createRegistrationPass deactivates old passes first so this is safe
  return createRegistrationPass(registrationId);
}

/**
 * Regenerate a registration pass with the latest form data + system fields.
 * Called when admin wants fresh details (e.g. after editing a registration).
 */
export async function regenerateRegistrationPass(registrationId) {
  return createRegistrationPass(registrationId);
}

export async function syncAllRegistrationPasses() {
  const verified = await Registration.find({ status: 'verified' });
  const summary = { total: verified.length, created: 0, existing: 0, failed: 0 };

  for (const reg of verified) {
    const exists = await Pass.findOne({
      registrationId: reg._id,
      passType: PASS_TYPES.REGISTRATION,
      isActive: true,
    });
    if (exists) {
      summary.existing++;
      continue;
    }
    try {
      await createRegistrationPass(reg._id);
      summary.created++;
    } catch {
      summary.failed++;
    }
  }

  return summary;
}

export async function getDayPassByGateLog(gateLogId) {
  const pass = await Pass.findOne({ gateLogId, passType: PASS_TYPES.DAY_PASS });
  if (!pass) return null;
  return formatPassResponse(pass);
}

/** Today's day pass for a registration (prefer active / most recent). */
export async function getTodayDayPass(registrationId) {
  const validDate = todayDateString();
  const pass = await Pass.findOne({
    registrationId,
    passType: PASS_TYPES.DAY_PASS,
    validDate,
  }).sort({ isActive: -1, createdAt: -1 });

  if (!pass) return null;
  return formatPassResponse(pass);
}

export async function getPassByCode(passCode) {
  const pass = await Pass.findOne({ passCode, isActive: true });
  if (!pass) return null;
  return formatPassResponse(pass);
}
