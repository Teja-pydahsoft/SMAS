import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import Registration from '../models/Registration.js';
import Pass from '../models/Pass.js';
import RegistrationForm from '../models/RegistrationForm.js';
import Role from '../models/Role.js';
import Shift from '../models/Shift.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { REGISTRATION_STAGES, REGISTRATION_STATUS, GENDERS, GENDER_LABELS } from '../constants/index.js';
import { extractFaceEmbedding, searchFaceEmbeddings } from '../services/aiClient.js';
import {
  indexVerifiedRegistration,
  removeRegistrationFromFaceIndex,
} from '../services/faceIndexService.js';
import { createRegistrationPass } from '../services/passService.js';
import { buildDisplayInfo, photoUrlFromPath, mediaUrlFromPath } from '../utils/displayInfo.js';
import { PASS_TYPES } from '../constants/index.js';
import { createMulter, createMediaMulter, uploadDir } from '../utils/storage.js';
import {
  isObjectStorageEnabled,
  uploadPhoto,
  uploadMedia,
  deleteStoredObject,
  deleteStoredMedia,
} from '../services/objectStorage.js';
import { generateRegistrationCode, shouldAssignRegistrationCode, syncPassRegistrationCode, isLegacySamsCode, buildRegistrationCodePrefix } from '../utils/registrationCode.js';
import { getShiftDurationHours } from '../utils/shiftAttendance.js';
import mongoose from 'mongoose';

const router = Router();

const upload = createMulter('registrations', (req, file) => {
  return `${req.params.id || uuidv4()}-${Date.now()}${path.extname(file.originalname) || '.jpg'}`;
});

const mediaUpload = createMediaMulter('registrations-media', (req, file) => {
  const ext = path.extname(file.originalname) || '';
  return `${req.params.id || uuidv4()}-${req.params.fieldId || 'media'}-${Date.now()}${ext}`;
});

function enrichRegistrationResponse(obj, fields = []) {
  const display = buildDisplayInfo(obj.formData, fields);
  return {
    ...obj,
    displayName: display.displayName,
    displayPhone: display.displayPhone,
    formDetails: display.details,
    mediaDetails: display.mediaDetails,
    hasMediaFields: display.hasMediaFields,
    photoUrl: photoUrlFromPath(obj.photoPath),
  };
}

function hasMediaValue(value) {
  if (!value) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'object') return Boolean(value.path || value.url);
  return false;
}

function validateFormData(form, formData, { skipMediaRequired = false } = {}) {
  for (const field of form.fields) {
    if (!field.required) continue;
    const value = formData?.[field.fieldId];
    if (field.type === 'media') {
      if (skipMediaRequired) continue;
      if (!hasMediaValue(value)) {
        return `Field "${field.label}" is required`;
      }
      continue;
    }
    if (value === undefined || value === '') {
      return `Field "${field.label}" is required`;
    }
  }
  return null;
}

function validateMediaComplete(form, formData) {
  for (const field of form.fields) {
    if (field.type !== 'media' || !field.required) continue;
    if (!hasMediaValue(formData?.[field.fieldId])) {
      return `Field "${field.label}" is required`;
    }
  }
  return null;
}

function validatePayFrequency(role, payFrequency, customPayDays) {
  const allowed = role?.payFrequencies || [];
  if (!allowed.length) return null;

  if (!payFrequency) return 'Pay frequency is required';

  if (!allowed.includes(payFrequency)) {
    return 'Selected pay frequency is not allowed for this role';
  }

  if (payFrequency === 'custom_days') {
    const days = Number(customPayDays);
    if (!Number.isInteger(days) || days < 1) {
      return 'Please enter a valid number of custom pay days (1 or more)';
    }
    const options = role?.customPayDaysOptions || [];
    if (options.length && !options.includes(days)) {
      return 'Selected custom pay days option is not allowed for this role';
    }
  }

  return null;
}

function validatePayAmount(role, payAmount) {
  const allowed = role?.payFrequencies || [];
  if (!allowed.length) return null;
  const amount = Number(payAmount);
  if (!Number.isFinite(amount) || amount < 0) {
    return 'Pay amount is required and must be 0 or more';
  }
  return null;
}

function applyPayFrequency(registration, role, payFrequency, customPayDays, payAmount) {
  const allowed = role?.payFrequencies || [];
  if (!allowed.length) {
    registration.payFrequency = null;
    registration.customPayDays = null;
    registration.payAmount = null;
    return null;
  }

  const error = validatePayFrequency(role, payFrequency, customPayDays);
  if (error) return error;

  const amountError = validatePayAmount(role, payAmount);
  if (amountError) return amountError;

  registration.payFrequency = payFrequency;
  registration.customPayDays = payFrequency === 'custom_days' ? Number(customPayDays) : null;
  registration.payAmount = Number(payAmount);
  return null;
}

function validateGender(role, gender) {
  const allowed = role?.payFrequencies || [];
  if (!allowed.length) return null;
  if (!gender) return 'Gender is required';
  if (!GENDERS.includes(gender)) {
    return `Gender must be one of: ${GENDERS.map((g) => GENDER_LABELS[g] || g).join(', ')}`;
  }
  return null;
}

function applyGender(registration, role, gender) {
  const allowed = role?.payFrequencies || [];
  if (!allowed.length) {
    registration.gender = null;
    return null;
  }

  const error = validateGender(role, gender);
  if (error) return error;

  registration.gender = gender;
  return null;
}

async function validateShiftAssignment(role, shiftId) {
  if (!role?.isShiftBased) return null;
  if (!shiftId || !mongoose.Types.ObjectId.isValid(shiftId)) {
    return 'Shift is required for this role';
  }
  const shift = await Shift.findById(shiftId);
  if (!shift || !shift.isActive) {
    return 'Selected shift is not available';
  }
  const total = getShiftDurationHours(shift);
  if (total == null || total <= 0) {
    return 'Selected shift has no total hours configured';
  }
  return null;
}

async function applyShiftAssignment(registration, role, shiftId) {
  if (!role?.isShiftBased) {
    registration.shiftId = null;
    return null;
  }
  const error = await validateShiftAssignment(role, shiftId);
  if (error) return error;
  registration.shiftId = shiftId;
  return null;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Match registration code or any string value in formData (name, phone, etc.). */
function buildListFilter(query = {}) {
  const filter = {};
  if (query.roleId) filter.roleId = query.roleId;
  if (query.status) filter.status = query.status;

  const search = String(query.search || '').trim();
  if (!search) return filter;

  const pattern = escapeRegex(search);
  const searchClause = {
    $or: [
      { registrationCode: { $regex: pattern, $options: 'i' } },
      {
        $expr: {
          $gt: [
            {
              $size: {
                $filter: {
                  input: { $objectToArray: { $ifNull: ['$formData', {}] } },
                  as: 'entry',
                  cond: {
                    $and: [
                      { $eq: [{ $type: '$$entry.v' }, 'string'] },
                      {
                        $regexMatch: {
                          input: '$$entry.v',
                          regex: pattern,
                          options: 'i',
                        },
                      },
                    ],
                  },
                },
              },
            },
            0,
          ],
        },
      },
    ],
  };

  return Object.keys(filter).length ? { $and: [filter, searchClause] } : searchClause;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filter = buildListFilter(req.query);

    const wantsPagination = req.query.page != null || req.query.limit != null;
    const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '25', 10) || 25));
    const skip = (page - 1) * limit;

    const query = Registration.find(filter)
      .select('-faceEmbedding')
      .populate('roleId', 'name slug payFrequencies customPayDaysOptions isShiftBased')
      .populate('shiftId', 'name totalHours halfDayMinHours fullDayMinHours startTime endTime isActive')
      .populate('formId', 'fields')
      .sort({ createdAt: -1 });

    if (wantsPagination) {
      query.skip(skip).limit(limit);
    }

    const [registrations, total, verifiedCount] = await Promise.all([
      query,
      wantsPagination ? Registration.countDocuments(filter) : Promise.resolve(null),
      wantsPagination
        ? Registration.countDocuments(
            Object.keys(filter).length
              ? { $and: [filter, { status: REGISTRATION_STATUS.VERIFIED }] }
              : { status: REGISTRATION_STATUS.VERIFIED }
          )
        : Promise.resolve(null),
    ]);

    const verifiedIds = registrations
      .filter((r) => r.status === REGISTRATION_STATUS.VERIFIED)
      .map((r) => r._id);

    const activePasses = await Pass.find({
      registrationId: { $in: verifiedIds },
      passType: PASS_TYPES.REGISTRATION,
      isActive: true,
    }).select('registrationId passCode');

    const passByRegistration = new Map(
      activePasses.map((p) => [p.registrationId.toString(), p.passCode])
    );

    const items = registrations.map((reg) => {
      const obj = reg.toObject();
      const enriched = enrichRegistrationResponse(obj, obj.formId?.fields || []);
      const regId = reg._id.toString();
      return {
        ...enriched,
        hasRegistrationPass: passByRegistration.has(regId),
        passCode: passByRegistration.get(regId) || null,
      };
    });

    // Backward compatible: callers without page/limit still get a plain array
    if (!wantsPagination) {
      return res.json(items);
    }

    let withPassCount = 0;
    if (verifiedCount > 0) {
      const verifiedFilter = Object.keys(filter).length
        ? { $and: [filter, { status: REGISTRATION_STATUS.VERIFIED }] }
        : { status: REGISTRATION_STATUS.VERIFIED };
      const verifiedIdList = await Registration.distinct('_id', verifiedFilter);
      withPassCount = await Pass.countDocuments({
        registrationId: { $in: verifiedIdList },
        passType: PASS_TYPES.REGISTRATION,
        isActive: true,
      });
    }

    const totalPages = Math.max(1, Math.ceil(total / limit));
    res.json({
      items,
      total,
      page,
      limit,
      totalPages,
      hasMore: page < totalPages,
      summary: {
        verified: verifiedCount,
        withPass: withPassCount,
      },
    });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const registration = await Registration.findById(req.params.id)
      .select('-faceEmbedding')
      .populate('roleId', 'name slug payFrequencies customPayDaysOptions isShiftBased')
      .populate('shiftId', 'name totalHours halfDayMinHours fullDayMinHours startTime endTime isActive')
      .populate('formId', 'fields');
    if (!registration) return res.status(404).json({ error: 'Registration not found' });
    const obj = registration.toObject();
    const enriched = enrichRegistrationResponse(obj, obj.formId?.fields || []);
    const pass = await Pass.findOne({
      registrationId: registration._id,
      passType: PASS_TYPES.REGISTRATION,
      isActive: true,
    }).select('passCode');
    res.json({
      ...enriched,
      hasRegistrationPass: Boolean(pass),
      passCode: pass?.passCode || null,
    });
  })
);

/** Search the face index for registrations matching this embedding (excluding excludeId). */
async function findFaceDuplicates(embedding, excludeId) {
  if (!Array.isArray(embedding) || !embedding.length) return [];

  const MATCH_THRESHOLD = parseFloat(process.env.FACE_MATCH_THRESHOLD || '0.42');
  const searchResult = await searchFaceEmbeddings(embedding, {
    topK: 3,
    threshold: MATCH_THRESHOLD,
  });

  const matches = (searchResult.matches || []).filter(
    (m) => m?.id && (!excludeId || String(m.id) !== String(excludeId))
  );

  const results = [];
  for (const match of matches) {
    const candidate = await Registration.findById(match.id)
      .populate('roleId', 'name')
      .select('-faceEmbedding');
    if (!candidate) continue;

    const fields = candidate.formId
      ? (await RegistrationForm.findById(candidate.formId).select('fields'))?.fields || []
      : [];
    const display = buildDisplayInfo(candidate.formData || {}, fields);
    results.push({
      registrationId: candidate._id,
      registrationCode: candidate.registrationCode,
      displayName: display.displayName,
      displayPhone: display.displayPhone,
      role: candidate.roleId?.name,
      status: candidate.status,
      photoUrl: photoUrlFromPath(candidate.photoPath),
      matchScore: match.similarity,
    });
  }
  return results;
}

/** Find registrations whose form data matches strictly on explicit unique fields (excluding excludeId). */
async function findUniqueFieldMatches(formData, fields, excludeId) {
  if (!formData || !fields?.length) return [];

  const uniqueFields = fields.filter((f) => f.unique === true);
  if (!uniqueFields.length) return [];

  const orClauses = [];
  uniqueFields.forEach((field) => {
    const value = formData[field.fieldId];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      const strVal = String(value).trim();
      if (field.type === 'text' || field.type === 'email' || field.type === 'textarea') {
        orClauses.push({ [`formData.${field.fieldId}`]: { $regex: `^${escapeRegex(strVal)}$`, $options: 'i' } });
      } else {
        // preserve numbers/other types, but also allow string matches for numbers sent as string
        orClauses.push({ [`formData.${field.fieldId}`]: value });
      }
    }
  });

  if (!orClauses.length) return [];

  const query = { $or: orClauses };
  if (excludeId) query._id = { $ne: excludeId };

  const existing = await Registration.find(query)
    .populate('roleId', 'name')
    .select('-faceEmbedding')
    .limit(5);

  return existing.map((reg) => {
    const display = buildDisplayInfo(reg.formData || {}, fields);
    
    // Figure out which unique field triggered the duplicate to construct an error message
    let matchedFieldLabel = null;
    for (const field of uniqueFields) {
      const submittedValue = formData[field.fieldId];
      if (submittedValue === undefined || submittedValue === null || String(submittedValue).trim() === '') continue;
      const existingValue = (reg.formData || {})[field.fieldId];
      if (existingValue === undefined || existingValue === null) continue;
      
      const sValStr = String(submittedValue).trim();
      const eValStr = String(existingValue).trim();
      
      if (field.type === 'text' || field.type === 'email' || field.type === 'textarea') {
        if (sValStr.toLowerCase() === eValStr.toLowerCase()) {
          matchedFieldLabel = field.label;
          break;
        }
      } else {
        if (submittedValue === existingValue || sValStr === eValStr) {
          matchedFieldLabel = field.label;
          break;
        }
      }
    }

    return {
      registrationId: reg._id,
      registrationCode: reg.registrationCode,
      displayName: display.displayName,
      displayPhone: display.displayPhone,
      role: reg.roleId?.name,
      status: reg.status,
      photoUrl: photoUrlFromPath(reg.photoPath),
      matchedFieldLabel
    };
  });
}

// Duplicate check: search face index + optional form data match
router.post(
  '/check-duplicate',
  upload.single('photo'),
  asyncHandler(async (req, res) => {
    const { formData, roleId, excludeId } = req.body;

    // ── 1. Face-based duplicate check ──────────────────────────────────────
    let faceMatches = [];
    if (req.file) {
      try {
        const imageBuffer = req.file.buffer || fs.readFileSync(req.file.path);
        const { embedding, face_detected } = await extractFaceEmbedding(
          imageBuffer,
          req.file.filename || req.file.originalname,
          req.file.mimetype
        );

        // Clean up temp file
        if (req.file.path && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }

        if (face_detected && embedding?.length) {
          faceMatches = await findFaceDuplicates(embedding, excludeId);
        }
      } catch (err) {
        // Face check failure is non-fatal — still run form data check
        console.error('Face duplicate check error:', err.message);
        if (req.file?.path && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
      }
    }

    // ── 2. Form-data duplicate check (name + phone) ─────────────────────────
    let formMatches = [];
    if (formData) {
      const parsed = typeof formData === 'string' ? JSON.parse(formData) : formData;

      let form = null;
      if (roleId) {
        form = await RegistrationForm.findOne({ roleId, isActive: true }).select('fields');
      }
      formMatches = await findUniqueFieldMatches(parsed, form?.fields || [], excludeId);
    }

    const faceMatch = faceMatches[0] || null;
    const hasDuplicate = faceMatches.length > 0 || formMatches.length > 0;
    res.json({ hasDuplicate, faceMatch, faceMatches, formMatches });
  })
);

// Duplicate check for an existing registration (e.g. pending review / approve screens).
// Uses the stored face embedding + form data, so no new photo upload is needed.
router.get(
  '/:id/duplicates',
  asyncHandler(async (req, res) => {
    const registration = await Registration.findById(req.params.id).populate('formId', 'fields');
    if (!registration) return res.status(404).json({ error: 'Registration not found' });

    const excludeId = registration._id.toString();

    let faceMatches = [];
    try {
      faceMatches = await findFaceDuplicates(registration.faceEmbedding, excludeId);
    } catch (err) {
      // Face check failure is non-fatal — still run form data check
      console.error('Face duplicate check error:', err.message);
    }

    let formMatches = [];
    try {
      formMatches = await findUniqueFieldMatches(
        registration.formData || {},
        registration.formId?.fields || [],
        excludeId
      );
    } catch (err) {
      console.error('Form duplicate check error:', err.message);
    }

    const faceMatch = faceMatches[0] || null;
    const hasDuplicate = faceMatches.length > 0 || formMatches.length > 0;
    res.json({ hasDuplicate, faceMatch, faceMatches, formMatches });
  })
);

// Stage 1: Submit dynamic form data
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { roleId, formData, payFrequency, customPayDays, payAmount, gender, shiftId } = req.body;

    const role = await Role.findById(roleId);
    if (!role) return res.status(404).json({ error: 'Role not found' });

    const form = await RegistrationForm.findOne({ roleId, isActive: true });
    if (!form) return res.status(404).json({ error: 'No active registration form for this role' });

    const validationError = validateFormData(form, formData, { skipMediaRequired: true });
    if (validationError) return res.status(400).json({ error: validationError });

    const payFrequencyError = validatePayFrequency(role, payFrequency, customPayDays);
    if (payFrequencyError) return res.status(400).json({ error: payFrequencyError });

    const payAmountError = validatePayAmount(role, payAmount);
    if (payAmountError) return res.status(400).json({ error: payAmountError });

    const genderError = validateGender(role, gender);
    if (genderError) return res.status(400).json({ error: genderError });

    const shiftError = await validateShiftAssignment(role, shiftId);
    if (shiftError) return res.status(400).json({ error: shiftError });

    const uniqueMatches = await findUniqueFieldMatches(formData || {}, form.fields, null);
    if (uniqueMatches.length > 0) {
      const match = uniqueMatches[0];
      return res.status(400).json({ error: `A registration already exists with this ${match.matchedFieldLabel || 'Unique Field'}.` });
    }

    const registration = await Registration.create({
      roleId,
      formId: form._id,
      formData: formData || {},
      shiftId: role.isShiftBased ? shiftId : null,
      payFrequency: role.payFrequencies?.length ? payFrequency : null,
      customPayDays:
        role.payFrequencies?.length && payFrequency === 'custom_days' ? Number(customPayDays) : null,
      payAmount: role.payFrequencies?.length ? Number(payAmount) : null,
      gender: role.payFrequencies?.length ? gender : null,
      currentStage: REGISTRATION_STAGES.PHOTO,
      status: REGISTRATION_STATUS.IN_PROGRESS,
    });

    res.status(201).json(registration);
  })
);

// Update form data (new or existing registration)
router.put(
  '/:id/form',
  asyncHandler(async (req, res) => {
    const registration = await Registration.findById(req.params.id);
    if (!registration) return res.status(404).json({ error: 'Registration not found' });

    const role = await Role.findById(registration.roleId);
    if (!role) return res.status(404).json({ error: 'Role not found' });

    const form = await RegistrationForm.findById(registration.formId);
    const validationError = validateFormData(form, req.body.formData, { skipMediaRequired: true });
    if (validationError) return res.status(400).json({ error: validationError });

    const uniqueMatches = await findUniqueFieldMatches(req.body.formData || {}, form.fields, registration._id.toString());
    if (uniqueMatches.length > 0) {
      const match = uniqueMatches[0];
      return res.status(400).json({ error: `A registration already exists with this ${match.matchedFieldLabel || 'Unique Field'}.` });
    }

    const payFrequencyError = applyPayFrequency(
      registration,
      role,
      req.body.payFrequency,
      req.body.customPayDays,
      req.body.payAmount
    );
    if (payFrequencyError) return res.status(400).json({ error: payFrequencyError });

    const genderError = applyGender(registration, role, req.body.gender);
    if (genderError) return res.status(400).json({ error: genderError });

    const shiftError = await applyShiftAssignment(registration, role, req.body.shiftId);
    if (shiftError) return res.status(400).json({ error: shiftError });

    registration.formData = req.body.formData;

    const isVerified = registration.status === REGISTRATION_STATUS.VERIFIED;
    const isRejected = registration.status === REGISTRATION_STATUS.REJECTED;

    if (isVerified) {
      // Keep verified status and completed stage when editing form only
    } else if (isRejected) {
      registration.status = REGISTRATION_STATUS.IN_PROGRESS;
      registration.currentStage = registration.photoPath
        ? REGISTRATION_STAGES.REVIEW
        : REGISTRATION_STAGES.PHOTO;
      registration.rejectionReason = undefined;
    } else if (
      registration.currentStage === REGISTRATION_STAGES.FORM ||
      registration.currentStage === REGISTRATION_STAGES.PHOTO
    ) {
      registration.currentStage = REGISTRATION_STAGES.PHOTO;
    }
    // pending_verification / review: keep current stage, form data updated only

    if (shouldAssignRegistrationCode(registration)) {
      try {
        registration.registrationCode = await generateRegistrationCode(registration);
      } catch (err) {
        return res.status(400).json({ error: err.message || 'Could not generate registration code' });
      }
    }

    await registration.save();

    if (registration.registrationCode) {
      try {
        await syncPassRegistrationCode(registration._id, registration.registrationCode);
      } catch (err) {
        console.error('Failed to sync registration code on passes:', err.message);
      }
    }

    const updated = await Registration.findById(registration._id).populate('roleId', 'name slug');
    res.json(updated);
  })
);

// Stage 2: Upload photo and extract face embedding via AI server
router.post(
  '/:id/photo',
  upload.single('photo'),
  asyncHandler(async (req, res) => {
    const registration = await Registration.findById(req.params.id);
    if (!registration) return res.status(404).json({ error: 'Registration not found' });

    if (!req.file) return res.status(400).json({ error: 'Photo is required' });

    const form = await RegistrationForm.findById(registration.formId);
    const mediaError = validateMediaComplete(form, registration.formData);
    if (mediaError) return res.status(400).json({ error: mediaError });

    const imageBuffer = req.file.buffer || fs.readFileSync(req.file.path);
    const { embedding, face_detected } = await extractFaceEmbedding(
      imageBuffer,
      req.file.filename || req.file.originalname,
      req.file.mimetype
    );

    if (!face_detected || !embedding?.length) {
      // Clean up: delete local file if it was written
      if (req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ error: 'No face detected in the photo. Please retake.' });
    }

    // Delete old photo (S3/Cloudinary or local)
    if (registration.photoPath) {
      if (
        registration.photoPath.includes('cloudinary.com') ||
        registration.photoPath.includes('amazonaws.com')
      ) {
        await deleteStoredObject(registration.photoPath);
      } else if (fs.existsSync(registration.photoPath)) {
        fs.unlinkSync(registration.photoPath);
      }
    }

    // Upload to S3/Cloudinary if enabled, otherwise use local path
    let photoUrl;
    if (isObjectStorageEnabled()) {
      const filename = `${req.params.id}-${Date.now()}.jpg`;
      const result = await uploadPhoto(
        imageBuffer,
        'registrations',
        filename,
        req.file.mimetype || 'image/jpeg'
      );
      photoUrl = result.url;
    } else {
      photoUrl = req.file.path;
    }

    registration.photoPath = photoUrl;
    registration.faceEmbedding = embedding;

    const isVerified = registration.status === REGISTRATION_STATUS.VERIFIED;

    if (isVerified) {
      registration.currentStage = REGISTRATION_STAGES.COMPLETED;
      registration.status = REGISTRATION_STATUS.VERIFIED;
    } else {
      registration.currentStage = REGISTRATION_STAGES.REVIEW;
      registration.status = REGISTRATION_STATUS.PENDING_VERIFICATION;
      registration.rejectionReason = undefined;
    }

    await registration.save();

    if (isVerified) {
      try {
        await indexVerifiedRegistration(registration);
      } catch (err) {
        console.error('Failed to update face index:', err.message);
      }
    }

    const updated = await Registration.findById(registration._id).populate('roleId', 'name slug');

    res.json({
      registration: updated,
      photoUrl: photoUrlFromPath(photoUrl),
    });
  })
);

// Upload media/document for a dynamic form field
router.post(
  '/:id/media/:fieldId',
  mediaUpload.single('file'),
  asyncHandler(async (req, res) => {
    const registration = await Registration.findById(req.params.id);
    if (!registration) return res.status(404).json({ error: 'Registration not found' });

    const form = await RegistrationForm.findById(registration.formId);
    if (!form) return res.status(404).json({ error: 'Registration form not found' });

    const field = form.fields.find((f) => f.fieldId === req.params.fieldId);
    if (!field) return res.status(404).json({ error: 'Form field not found' });
    if (field.type !== 'media') {
      return res.status(400).json({ error: 'Field is not a media upload field' });
    }

    if (!req.file) return res.status(400).json({ error: 'File is required' });

    const fileBuffer = req.file.buffer || fs.readFileSync(req.file.path);
    const extension = path.extname(req.file.originalname) || '';
    const originalName = req.file.originalname || `file${extension}`;

    const existingMedia = registration.formData?.[field.fieldId];
    if (existingMedia) {
      const existingPath = typeof existingMedia === 'string' ? existingMedia : existingMedia.path;
      if (existingPath) {
        if (
          existingPath.includes('cloudinary.com') ||
          existingPath.includes('amazonaws.com')
        ) {
          const resourceType = typeof existingMedia === 'object' ? existingMedia.resourceType : 'image';
          await deleteStoredMedia(existingPath, resourceType);
        } else if (fs.existsSync(existingPath)) {
          fs.unlinkSync(existingPath);
        }
      }
    }

    let storedPath;
    let resourceType = null;
    if (isObjectStorageEnabled()) {
      const filename = `${req.params.id}-${req.params.fieldId}-${Date.now()}${extension}`;
      try {
        const result = await uploadMedia(
          fileBuffer,
          'registrations-media',
          filename,
          req.file.mimetype || 'application/octet-stream'
        );
        storedPath = result.url;
        resourceType = result.resourceType;
        if (req.file.path && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
      } catch (cloudErr) {
        console.error('Object storage media upload failed, falling back to local:', cloudErr.message);
        const localDir = path.join(uploadDir, 'registrations-media');
        if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });
        const localName = `${req.params.id}-${req.params.fieldId}-${Date.now()}${extension}`;
        const localPath = path.join(localDir, localName);
        fs.writeFileSync(localPath, fileBuffer);
        storedPath = localPath;
      }
    } else {
      storedPath = req.file.path;
    }

    const publicUrl = storedPath.startsWith('http') ? storedPath : mediaUrlFromPath(storedPath);
    const mediaValue = {
      path: storedPath,
      url: publicUrl || storedPath,
      originalName,
      mimetype: req.file.mimetype,
      extension: extension.toLowerCase(),
      size: req.file.size,
      ...(resourceType ? { resourceType } : {}),
    };

    registration.formData = {
      ...(registration.formData || {}),
      [field.fieldId]: mediaValue,
    };
    await registration.save();

    const updated = await Registration.findById(registration._id)
      .populate('roleId', 'name slug payFrequencies customPayDaysOptions isShiftBased')
      .populate('shiftId', 'name totalHours halfDayMinHours fullDayMinHours startTime endTime isActive')
      .populate('formId', 'fields');
    const obj = updated.toObject();
    const enriched = enrichRegistrationResponse(obj, obj.formId?.fields || []);

    res.json({
      registration: enriched,
      media: mediaValue,
    });
  })
);

// Stage 3: Review and verify/reject
router.post(
  '/:id/verify',
  asyncHandler(async (req, res) => {
    const { approved, verifiedBy, rejectionReason } = req.body;
    const registration = await Registration.findById(req.params.id);
    if (!registration) return res.status(404).json({ error: 'Registration not found' });

    if (
      registration.currentStage !== REGISTRATION_STAGES.REVIEW &&
      registration.status !== REGISTRATION_STATUS.REJECTED
    ) {
      return res.status(400).json({ error: 'Registration is not ready for verification' });
    }

    if (approved) {
      const role = await Role.findById(registration.roleId);
      if (role?.payFrequencies?.length) {
        if (!registration.payFrequency || !registration.gender) {
          return res.status(400).json({
            error: 'Pay frequency and gender are required before verification (codes like DM0001)',
          });
        }
      }

      registration.status = REGISTRATION_STATUS.VERIFIED;
      registration.currentStage = REGISTRATION_STAGES.COMPLETED;
      registration.verifiedAt = new Date();
      registration.verifiedBy = verifiedBy || 'system';

      const needsNewCode =
        shouldAssignRegistrationCode(registration) || isLegacySamsCode(registration.registrationCode);

      if (needsNewCode) {
        if (!buildRegistrationCodePrefix(registration.payFrequency, registration.gender)) {
          return res.status(400).json({
            error: 'Pay frequency and gender are required to issue a registration code (e.g. DM0001)',
          });
        }
        try {
          registration.registrationCode = await generateRegistrationCode(registration);
        } catch (err) {
          return res.status(400).json({
            error: err.message || 'Could not generate registration code',
          });
        }
      }

      registration.rejectionReason = undefined;
    } else {
      registration.status = REGISTRATION_STATUS.REJECTED;
      registration.rejectionReason = rejectionReason || 'Rejected during verification';
    }

    await registration.save();

    if (approved) {
      try {
        await syncPassRegistrationCode(registration._id, registration.registrationCode);
      } catch (err) {
        console.error('Failed to sync registration code on passes:', err.message);
      }
      try {
        await indexVerifiedRegistration(registration);
      } catch (err) {
        console.error('Failed to add face to index:', err.message);
      }
    }

    const updated = await Registration.findById(registration._id).populate('roleId', 'name slug');

    let pass = null;
    if (approved) {
      try {
        pass = await createRegistrationPass(registration._id);
      } catch (err) {
        console.error('Failed to create registration pass:', err.message);
      }
    }

    res.json({ registration: updated, pass });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const registration = await Registration.findById(req.params.id);
    if (!registration) return res.status(404).json({ error: 'Registration not found' });

    if (registration.photoPath) {
      if (
        registration.photoPath.includes('cloudinary.com') ||
        registration.photoPath.includes('amazonaws.com')
      ) {
        await deleteStoredObject(registration.photoPath);
      } else if (fs.existsSync(registration.photoPath)) {
        fs.unlinkSync(registration.photoPath);
      }
    }

    try {
      await removeRegistrationFromFaceIndex(req.params.id);
    } catch (err) {
      console.error('Failed to remove face from index:', err.message);
    }

    await Pass.deleteMany({ registrationId: req.params.id });
    await Registration.findByIdAndDelete(req.params.id);
    res.json({ message: 'Registration deleted' });
  })
);

export default router;
