import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import Registration from '../models/Registration.js';
import Pass from '../models/Pass.js';
import RegistrationForm from '../models/RegistrationForm.js';
import Role from '../models/Role.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { REGISTRATION_STAGES, REGISTRATION_STATUS } from '../constants/index.js';
import { extractFaceEmbedding } from '../services/aiClient.js';
import {
  indexVerifiedRegistration,
  removeRegistrationFromFaceIndex,
} from '../services/faceIndexService.js';
import { createRegistrationPass } from '../services/passService.js';
import { buildDisplayInfo, photoUrlFromPath } from '../utils/displayInfo.js';
import { PASS_TYPES } from '../constants/index.js';
import { uploadDir } from '../utils/storage.js';

const router = Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(uploadDir, 'registrations');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${req.params.id || uuidv4()}-${Date.now()}${path.extname(file.originalname) || '.jpg'}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/octet-stream') {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
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

    const imageBuffer = fs.readFileSync(req.file.path);
    const { embedding, face_detected } = await extractFaceEmbedding(
      imageBuffer,
      req.file.filename,
      req.file.mimetype
    );

    if (!face_detected || !embedding?.length) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'No face detected in the photo. Please retake.' });
    }

    if (registration.photoPath && fs.existsSync(registration.photoPath)) {
      fs.unlinkSync(registration.photoPath);
    }

    registration.photoPath = req.file.path;
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
      photoUrl: `/uploads/registrations/${path.basename(req.file.path)}`,
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

    if (registration.photoPath && fs.existsSync(registration.photoPath)) {
      fs.unlinkSync(registration.photoPath);
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
