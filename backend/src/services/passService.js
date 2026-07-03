import QRCode from 'qrcode';
import Pass from '../models/Pass.js';
import Registration from '../models/Registration.js';
import RegistrationForm from '../models/RegistrationForm.js';
import Role from '../models/Role.js';
import { PASS_TYPES } from '../constants/index.js';
import { buildDisplayInfo, photoUrlFromPath } from '../utils/displayInfo.js';

function generatePassCode(prefix) {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${rand}`;
}

function todayDateString(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function endOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
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

export async function formatPassResponse(passDoc, qrDataUrl = null) {
  const pass = passDoc.toObject ? passDoc.toObject() : passDoc;
  const qr = qrDataUrl || (pass.passCode ? await buildQrDataUrl(pass.passCode) : null);

  return {
    ...pass,
    qrDataUrl: qr,
    passTitle: pass.passType === PASS_TYPES.REGISTRATION ? 'Registration Pass' : 'Day Pass',
  };
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
    details: display.details,
    qrPayload,
    isActive: true,
  });

  return formatPassResponse(pass, await buildQrDataUrl(passCode));
}

export async function createDayPass(registrationId, gateLogId) {
  const { registration, role, display } = await loadRegistrationContext(registrationId);
  const now = new Date();
  const validDate = todayDateString(now);

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
    validUntil: endOfDay(now).toISOString(),
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
    validUntil: endOfDay(now),
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
  const existing = await getRegistrationPass(registrationId);
  if (existing) return existing;
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

export async function getPassByCode(passCode) {
  const pass = await Pass.findOne({ passCode, isActive: true });
  if (!pass) return null;
  return formatPassResponse(pass);
}
