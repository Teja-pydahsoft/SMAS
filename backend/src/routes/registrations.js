import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import Registration from '../models/Registration.js';
import Pass from '../models/Pass.js';
import RegistrationForm from '../models/RegistrationForm.js';
import Role from '../models/Role.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { REGISTRATION_STAGES, REGISTRATION_STATUS } from '../constants/index.js';
import { extractFaceEmbedding, searchFaceEmbeddings } from '../services/aiClient.js';
import {
  indexVerifiedRegistration,
  removeRegistrationFromFaceIndex,
} from '../services/faceIndexService.js';
import { createRegistrationPass } from '../services/passService.js';
import { buildDisplayInfo, photoUrlFromPath } from '../utils/displayInfo.js';
import { PASS_TYPES } from '../constants/index.js';
import { createMulter } from '../utils/storage.js';
import {
  isCloudinaryEnabled,
  uploadToCloudinary,
  deleteFromCloudinary,
  extractPublicId,
} from '../services/cloudinaryService.js';

const router = Router();

const upload = createMulter('registrations', (req, file) => {
  return `${req.params.id || uuidv4()}-${Date.now()}${path.extname(file.originalname) || '.jpg'}`;
});

function generateRegistrationCode() {
  return `SAMS-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function validateFormData(form, formData) {
  for (const field of form.fields) {
    if (field.required && (formData?.[field.fieldId] === undefined || formData[field.fieldId] === '')) {
      return `Field "${field.label}" is required`;
    }
  }
  return null;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.roleId) filter.roleId = req.query.roleId;
    if (req.query.status) filter.status = req.query.status;

    const registrations = await Registration.find(filter)
      .select('-faceEmbedding')
      .populate('roleId', 'name slug')
      .populate('formId', 'fields')
      .sort({ createdAt: -1 });

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

    res.json(
      registrations.map((reg) => {
        const obj = reg.toObject();
        const display = buildDisplayInfo(obj.formData, obj.formId?.fields || []);
        const regId = reg._id.toString();
        return {
          ...obj,
          displayName: display.displayName,
          displayPhone: display.displayPhone,
          formDetails: display.details,
          photoUrl: photoUrlFromPath(obj.photoPath),
          hasRegistrationPass: passByRegistration.has(regId),
          passCode: passByRegistration.get(regId) || null,
        };
      })
    );
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const registration = await Registration.findById(req.params.id)
      .populate('roleId', 'name slug')
      .populate('formId', 'fields');
    if (!registration) return res.status(404).json({ error: 'Registration not found' });
    const obj = registration.toObject();
    const display = buildDisplayInfo(obj.formData, obj.formId?.fields || []);
    const pass = await Pass.findOne({
      registrationId: registration._id,
      passType: PASS_TYPES.REGISTRATION,
      isActive: true,
    }).select('passCode');
    res.json({
      ...obj,
      displayName: display.displayName,
      displayPhone: display.displayPhone,
      formDetails: display.details,
      photoUrl: photoUrlFromPath(obj.photoPath),
      hasRegistrationPass: Boolean(pass),
      passCode: pass?.passCode || null,
    });
  })
);

// Duplicate check: search face index + optional form data match
router.post(
  '/check-duplicate',
  upload.single('photo'),
  asyncHandler(async (req, res) => {
    const { formData, roleId, excludeId } = req.body;

    // ── 1. Face-based duplicate check ──────────────────────────────────────
    let faceMatch = null;
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
          const MATCH_THRESHOLD = parseFloat(process.env.FACE_MATCH_THRESHOLD || '0.42');
          const searchResult = await searchFaceEmbeddings(embedding, {
            topK: 3,
            threshold: MATCH_THRESHOLD,
          });

          if (searchResult.best?.id) {
            const candidateId = searchResult.best.id;
            // Skip if this is the registration being edited
            if (!excludeId || candidateId !== excludeId) {
              const candidate = await Registration.findById(candidateId)
                .populate('roleId', 'name')
                .select('-faceEmbedding');
              if (candidate) {
                const display = buildDisplayInfo(
                  candidate.formData || {},
                  candidate.formId
                    ? (await RegistrationForm.findById(candidate.formId).select('fields'))?.fields || []
                    : []
                );
                faceMatch = {
                  registrationId: candidate._id,
                  registrationCode: candidate.registrationCode,
                  displayName: display.displayName,
                  displayPhone: display.displayPhone,
                  role: candidate.roleId?.name,
                  status: candidate.status,
                  photoUrl: photoUrlFromPath(candidate.photoPath),
                  matchScore: searchResult.best.similarity,
                };
              }
            }
          }
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

      // Get the form fields to find name/phone field IDs
      let form = null;
      if (roleId) {
        form = await RegistrationForm.findOne({ roleId, isActive: true }).select('fields');
      }
      const fields = form?.fields || [];

      // Find name & phone values from submitted form data
      const nameFieldIds = fields
        .filter((f) => f.label?.toLowerCase().includes('name') || f.type === 'text')
        .map((f) => f.fieldId);
      const phoneFieldIds = fields
        .filter((f) => f.type === 'phone' || f.label?.toLowerCase().includes('phone') || f.label?.toLowerCase().includes('mobile'))
        .map((f) => f.fieldId);

      const submittedName = nameFieldIds.map((id) => parsed[id]).find(Boolean);
      const submittedPhone = phoneFieldIds.map((id) => parsed[id]).find(Boolean);

      if (submittedName || submittedPhone) {
        const orClauses = [];
        if (submittedName) {
          nameFieldIds.forEach((id) => {
            orClauses.push({ [`formData.${id}`]: { $regex: `^${submittedName.trim()}$`, $options: 'i' } });
          });
        }
        if (submittedPhone) {
          phoneFieldIds.forEach((id) => {
            orClauses.push({ [`formData.${id}`]: submittedPhone.trim() });
          });
        }

        if (orClauses.length) {
          const query = { $or: orClauses };
          if (excludeId) query._id = { $ne: excludeId };

          const existing = await Registration.find(query)
            .populate('roleId', 'name')
            .select('-faceEmbedding')
            .limit(5);

          for (const reg of existing) {
            const display = buildDisplayInfo(reg.formData || {}, fields);
            formMatches.push({
              registrationId: reg._id,
              registrationCode: reg.registrationCode,
              displayName: display.displayName,
              displayPhone: display.displayPhone,
              role: reg.roleId?.name,
              status: reg.status,
              photoUrl: photoUrlFromPath(reg.photoPath),
            });
          }
        }
      }
    }

    const hasDuplicate = Boolean(faceMatch) || formMatches.length > 0;
    res.json({ hasDuplicate, faceMatch, formMatches });
  })
);

// Stage 1: Submit dynamic form data
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { roleId, formData } = req.body;

    const role = await Role.findById(roleId);
    if (!role) return res.status(404).json({ error: 'Role not found' });

    const form = await RegistrationForm.findOne({ roleId, isActive: true });
    if (!form) return res.status(404).json({ error: 'No active registration form for this role' });

    const validationError = validateFormData(form, formData);
    if (validationError) return res.status(400).json({ error: validationError });

    const registration = await Registration.create({
      roleId,
      formId: form._id,
      formData: formData || {},
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

    const form = await RegistrationForm.findById(registration.formId);
    const validationError = validateFormData(form, req.body.formData);
    if (validationError) return res.status(400).json({ error: validationError });

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

    await registration.save();
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

    // Delete old photo (Cloudinary or local)
    if (registration.photoPath) {
      if (registration.photoPath.includes('cloudinary.com')) {
        const publicId = extractPublicId(registration.photoPath);
        await deleteFromCloudinary(publicId);
      } else if (fs.existsSync(registration.photoPath)) {
        fs.unlinkSync(registration.photoPath);
      }
    }

    // Upload to Cloudinary if enabled, otherwise use local path
    let photoUrl;
    if (isCloudinaryEnabled()) {
      const filename = `${req.params.id}-${Date.now()}`;
      const result = await uploadToCloudinary(imageBuffer, 'registrations', filename);
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
      registration.status = REGISTRATION_STATUS.VERIFIED;
      registration.currentStage = REGISTRATION_STAGES.COMPLETED;
      registration.verifiedAt = new Date();
      registration.verifiedBy = verifiedBy || 'system';
      if (!registration.registrationCode) {
        registration.registrationCode = generateRegistrationCode();
      }
      registration.rejectionReason = undefined;
    } else {
      registration.status = REGISTRATION_STATUS.REJECTED;
      registration.rejectionReason = rejectionReason || 'Rejected during verification';
    }

    await registration.save();

    if (approved) {
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
      if (registration.photoPath.includes('cloudinary.com')) {
        const publicId = extractPublicId(registration.photoPath);
        await deleteFromCloudinary(publicId);
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
