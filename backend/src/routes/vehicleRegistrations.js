import fs from 'fs';
import mongoose from 'mongoose';
import { Router } from 'express';
import VehicleRegistration from '../models/VehicleRegistration.js';
import Vehicle from '../models/Vehicle.js';
import VehicleActivityLog from '../models/VehicleActivityLog.js';
import VehicleTrainingDataset from '../models/VehicleTrainingDataset.js';
import VehicleType from '../models/VehicleType.js';
import { analyzeVehicle } from '../services/aiClient.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { createMulter } from '../utils/storage.js';
import { isObjectStorageEnabled, uploadPhoto } from '../services/objectStorage.js';
import VehicleCategory from '../models/VehicleCategory.js';

const router = Router();

/**
 * Generate a small number of OCR correction variants for Vehicle Master matching.
 * Only applies controlled substitutions at positions where OCR commonly confuses characters.
 * Returns max ~10 variants to avoid false matches.
 */
function generateLightOcrVariants(plate) {
  if (!plate || plate.length < 6) return [];

  const upper = plate.toUpperCase().replace(/\s+/g, '');
  const SUBS = { 'O': '0', '0': 'O', 'S': '5', '5': 'S', 'I': '1', '1': 'I', 'B': '8', '8': 'B', 'Z': '2', '2': 'Z', 'G': '6', '6': 'G' };

  const variants = new Set();

  // Single-character substitutions
  for (let i = 0; i < upper.length; i++) {
    const sub = SUBS[upper[i]];
    if (sub) {
      const v = upper.slice(0, i) + sub + upper.slice(i + 1);
      variants.add(v);
    }
  }

  // Two-character substitutions (only for adjacent or nearby positions)
  const chars = upper.split('');
  for (let i = 0; i < chars.length; i++) {
    const sub1 = SUBS[chars[i]];
    if (!sub1) continue;
    for (let j = i + 1; j < Math.min(i + 4, chars.length); j++) {
      const sub2 = SUBS[chars[j]];
      if (!sub2) continue;
      const v = upper.slice(0, i) + sub1 + upper.slice(i + 1, j) + sub2 + upper.slice(j + 1);
      variants.add(v);
    }
  }

  variants.delete(upper);
  // Cap at 15 variants
  return [...variants].slice(0, 15);
}

function normalizePlateKey(plate) {
  return String(plate || '').toUpperCase().replace(/[^A-Z0-9]/g, '').toLowerCase();
}

function plateLookupKeys(plate) {
  const normalized = normalizePlateKey(plate);
  if (!normalized) return [];
  const keys = new Set([normalized]);
  for (const variant of generateLightOcrVariants(normalized)) {
    const key = normalizePlateKey(variant);
    if (key) keys.add(key);
  }
  return [...keys];
}

async function findExistingByPlate(plate) {
  const normalized = normalizePlateKey(plate);
  const keys = plateLookupKeys(plate);
  if (!normalized || keys.length === 0) {
    return { vehicle: null, pendingReg: null, matchType: null, matchedPlate: null, normalized };
  }

  const vehicle = await Vehicle.findOne({ normalizedPlateNumber: { $in: keys } }).populate('typeId');
  const pendingReg = await VehicleRegistration.findOne({
    normalizedPlateNumber: { $in: keys },
    status: 'Pending',
  });

  let matchType = null;
  let matchedPlate = null;
  if (vehicle) {
    matchType = vehicle.normalizedPlateNumber === normalized ? 'exact' : 'variant';
    matchedPlate = vehicle.plateNumber;
  } else if (pendingReg) {
    matchType = pendingReg.normalizedPlateNumber === normalized ? 'exact_pending' : 'variant_pending';
    matchedPlate = pendingReg.plateNumber;
  }

  return { vehicle, pendingReg, matchType, matchedPlate, normalized };
}

function parseJsonField(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function buildEnrollmentSnapshot({ aiResult, plateNumber, matchType, source }) {
  const normalized = String(plateNumber || aiResult?.normalizedPlateNumber || aiResult?.combinedPlate || '')
    .toUpperCase()
    .replace(/\s+/g, '');
  const ocr = Number(aiResult?.confidence?.ocr || 0);
  const overall = Number(aiResult?.confidence?.overall || ocr || 0);
  return {
    success: Boolean(aiResult?.success),
    frontPlateNumber: aiResult?.frontPlateNumber || normalized || null,
    rearPlateNumber: aiResult?.rearPlateNumber || null,
    normalizedPlateNumber: aiResult?.normalizedPlateNumber || normalized || null,
    combinedPlate: aiResult?.combinedPlate || aiResult?.normalizedPlateNumber || normalized || null,
    plates: Array.isArray(aiResult?.plates) ? aiResult.plates : [],
    confidence: { ocr, overall },
    validationStatus: aiResult?.validationStatus || (aiResult ? 'unknown' : 'manual'),
    processingTimeMs: aiResult?.processingTimeMs ?? null,
    matchType: matchType || null,
    source: source || (aiResult ? 'analyze' : 'manual'),
    submittedPlate: plateNumber || normalized || null,
  };
}

const upload = createMulter('vehicles', (req, file) => {
  return `${Date.now()}-${Math.round(Math.random() * 1e9)}-${file.originalname}`;
});

const uploadFields = upload.fields([
  { name: 'front', maxCount: 1 },
  { name: 'frontPlate', maxCount: 1 }
]);

router.post(
  '/analyze',
  (req, res, next) => {
    console.log('[POST /analyze] 1. Request received.');
    res.on('finish', () => console.log('[POST /analyze] 9. Response finished. (finish event)'));
    res.on('close', () => console.log('[POST /analyze] 9. Response closed. (close event)'));
    next();
  },
  (req, res, next) => {
    uploadFields(req, res, (err) => {
      if (err) {
        console.error('[POST /analyze] Multer error:', err);
        return next(err);
      }
      console.log('[POST /analyze] 2. Multer completed.');
      next();
    });
  },
  asyncHandler(async (req, res) => {
    try {
      const files = req.files;
      console.log('[POST /analyze] 3. Files detected.');
      if (!files || !files.front || !files.frontPlate) {
        console.log('[POST /analyze] 8. res.status(400).json(...) executed (Missing files)');
        return res.status(400).json({ error: 'Both Vehicle Photo (front) and Number Plate Photo (frontPlate) are required' });
      }

      // Send both front and frontPlate to AI so it can try the best image
      const imagePayload = {};
      for (const key of ['frontPlate', 'front']) {
        const f = files[key] ? files[key][0] : null;
        if (!f) continue;
        let buffer;
        if (f.buffer) buffer = f.buffer;
        else if (f.path) buffer = await fs.promises.readFile(f.path);
        else continue;
        imagePayload[key] = { buffer, filename: f.originalname, mimeType: f.mimetype };
      }

      let aiResult;
      try {
        console.log('[POST /analyze] 4. Calling aiClient.analyzeVehicle()');
        aiResult = await analyzeVehicle(imagePayload);
        console.log('[POST /analyze] 5. AI response received.', aiResult);
      } catch (err) {
        console.error('[POST /analyze] AI Error:', err.stack);
        return res.status(500).json({ error: 'AI processing failed', details: err.message });
      }

      const plateNumber = aiResult.normalizedPlateNumber || aiResult.frontPlateNumber;
      if (!plateNumber) {
        return res.status(400).json({ error: 'Plate number could not be detected' });
      }

      const ocrConfidence = aiResult.confidence?.ocr || 0;
      const { vehicle, pendingReg, matchType, matchedPlate } = await findExistingByPlate(plateNumber);

      console.log('[POST /analyze] 6. Lookup completed.', matchType || 'no_match');

      // Determine confidence level for frontend
      const needsVerification = ocrConfidence < 85 || aiResult.validationStatus !== 'success';

      if (vehicle) {
        return res.json({
          foundInMaster: true,
          message: matchType === 'variant' ? 'Possible Vehicle Match (OCR variant)' : 'Vehicle Already Registered',
          matchType,
          matchedPlate,
          plateNumber,
          needsVerification: matchType === 'variant',
          vehicle: {
            plateNumber: vehicle.plateNumber,
            type: vehicle.typeId ? vehicle.typeId.name : 'Unknown',
            equipmentName: vehicle.metadata?.equipmentName || 'N/A',
            status: vehicle.status,
            registrationDate: vehicle.createdAt
          },
          ocrDetails: aiResult
        });
      }

      if (pendingReg) {
        return res.json({
          foundInMaster: true,
          message: matchType === 'variant_pending' ? 'Possible Pending Match (OCR variant)' : 'Registration Already Pending',
          matchType,
          matchedPlate,
          plateNumber,
          needsVerification: matchType === 'variant_pending',
          vehicle: {
            plateNumber: pendingReg.plateNumber,
            type: 'Pending Approval',
            equipmentName: pendingReg.data?.equipmentName || 'N/A',
            status: 'Pending',
            registrationDate: pendingReg.createdAt
          },
          ocrDetails: aiResult
        });
      }

      return res.json({
        foundInMaster: false,
        plateNumber,
        needsVerification,
        ocrDetails: aiResult
      });
    } catch (err) {
      console.error('[POST /analyze] Unhandled Exception:', err.stack);
      throw err;
    }
  })
);

router.post(
  '/',
  uploadFields,
  asyncHandler(async (req, res) => {
    const files = req.files;
    
    console.log('--- Backend Multer Output ---');
    console.log('Fields Extracted:', files ? Object.keys(files) : null);
    if (files) {
      let fileCount = 0;
      Object.entries(files).forEach(([key, fileArray]) => {
        fileArray.forEach(f => {
          fileCount++;
          console.log(`- ${key}: ${f.originalname} (${f.size || (f.buffer ? f.buffer.length : 'unknown')} bytes)`);
        });
      });
      console.log('Total files received:', fileCount);
    }

    if (!files || !files.front || !files.frontPlate) {
      return res.status(400).json({ error: 'Vehicle Photo (front) and Number Plate Photo (frontPlate) are required' });
    }

    const { formId, data, submittedBy, plateNumber: manualPlateNumber, matchType: clientMatchType } = req.body;
    const clientOcr = parseJsonField(req.body.ocrDetails);
    if (!formId) {
      return res.status(400).json({ error: 'formId is required' });
    }

    let parsedData = {};
    if (data) {
      try { parsedData = typeof data === 'string' ? JSON.parse(data) : data; }
      catch(e) { parsedData = {}; }
    }

    // Skip duplicate OCR: use the plate from /analyze (or user edit) plus the stored OCR snapshot.
    // Only call AI if no plate number and no analyze snapshot were provided.
    let aiResult = clientOcr;
    if (!manualPlateNumber && !aiResult) {
      const imagePayload = {};
      for (const key of ['frontPlate']) {
        if (!files[key] || !files[key][0]) continue;
        const f = files[key][0];
        let buffer;
        if (f.buffer) buffer = f.buffer;
        else if (f.path) buffer = await fs.promises.readFile(f.path);
        else continue;
        imagePayload[key] = { buffer, filename: f.originalname, mimeType: f.mimetype };
      }

      if (Object.keys(imagePayload).length > 0) {
        try {
          aiResult = await analyzeVehicle(imagePayload);
        } catch (err) {
          return res.status(500).json({ error: 'AI processing failed', details: err.message });
        }
      }
    }

    const typeId = parsedData.typeId;
    if (!typeId) {
      return res.status(400).json({ error: 'Vehicle Type (typeId) is required' });
    }
    const vType = await VehicleType.findById(typeId);
    if (!vType) {
      return res.status(400).json({ error: 'Invalid Vehicle Type provided' });
    }
    
    parsedData.vehicleType = vType.name; // Keep for backward compatibility in parsedData
    
    // Ensure department is null if not provided
    parsedData.departmentId = parsedData.departmentId || null;

    // Determine plate number (prefer user-provided, fallback to AI)
    const plateNumber = manualPlateNumber || (aiResult && (aiResult.normalizedPlateNumber || aiResult.frontPlateNumber));
    if (!plateNumber) {
      return res.status(400).json({ error: 'Plate number is required. AI returned null and no manual plate number was provided.' });
    }
    
    const { vehicle: existingVehicle, pendingReg: existingRegistration, matchType, matchedPlate, normalized: normalizedPlateNumber } = await findExistingByPlate(plateNumber);
    if (existingVehicle) {
      return res.status(409).json({
        error: matchType === 'variant'
          ? `Vehicle already exists in Vehicle Master as ${existingVehicle.plateNumber}`
          : 'Vehicle with this plate number already exists in Vehicle Master',
        foundInMaster: true,
        matchType,
        matchedPlate,
        vehicle: {
          _id: existingVehicle._id,
          plateNumber: existingVehicle.plateNumber,
          type: existingVehicle.typeId ? existingVehicle.typeId.name : 'Unknown',
          equipmentName: existingVehicle.metadata?.equipmentName || 'N/A',
          status: existingVehicle.status,
          registrationDate: existingVehicle.createdAt,
        },
      });
    }

    if (existingRegistration) {
      return res.status(409).json({
        error: 'A pending registration for this plate number already exists',
        foundInMaster: true,
        matchType: matchType || 'exact_pending',
        matchedPlate,
        vehicle: {
          plateNumber: existingRegistration.plateNumber,
          type: 'Pending Approval',
          equipmentName: existingRegistration.data?.equipmentName || 'N/A',
          status: 'Pending',
          registrationDate: existingRegistration.createdAt,
        },
      });
    }

    const uniquePrefix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const photos = {
      front: files.front[0].filename || `${uniquePrefix}-${files.front[0].originalname}`,
      frontPlate: files.frontPlate[0].filename || `${uniquePrefix}-${files.frontPlate[0].originalname}`
    };

    if (isObjectStorageEnabled()) {
      for (const key of ['front', 'frontPlate']) {
        if (!files[key] || !files[key][0]) continue;
        const file = files[key][0];
        if (file.buffer) {
          try {
            const uploadResult = await uploadPhoto(file.buffer, 'vehicles', photos[key], file.mimetype);
            photos[key] = uploadResult.url || uploadResult;
          } catch (uploadErr) {
            console.error(`Failed to upload ${key} to cloud storage:`, uploadErr);
            return res.status(500).json({ error: `Failed to upload image ${key} to cloud storage`, details: uploadErr.message });
          }
        }
      }
    }

    console.log('--- Before Mongo Save ---');
    console.log('Photos to save:', photos);

    const aiEnrollmentData = buildEnrollmentSnapshot({
      aiResult,
      plateNumber,
      matchType: clientMatchType || null,
      source: clientOcr ? 'analyze' : (aiResult ? 'submit_ocr' : 'manual'),
    });

    const registration = await VehicleRegistration.create({
      formId,
      submittedBy: submittedBy || req.user?._id,
      data: parsedData,
      plateNumber,
      normalizedPlateNumber,
      photos,
      aiEnrollmentData
    });

    console.log('--- After Mongo Save ---');
    console.log('Saved Registration ID:', registration._id);
    console.log('Saved Photos:', registration.photos);

    // Create Audit Log
    await VehicleActivityLog.create({
      capturedPlate: plateNumber,
      normalizedCapturedPlate: normalizedPlateNumber,
      confidence: aiEnrollmentData.confidence?.ocr || 0,
      snapshotUrl: photos.frontPlate,
      decision: 'Unknown',
      reason: 'Vehicle Registration initiated',
      metadata: { action: 'Registration', registrationId: registration._id, typeId: typeId }
    });

    res.status(201).json({ message: 'Vehicle registration submitted successfully', registration });
  })
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    
    const registrations = await VehicleRegistration.find(filter)
      .populate('formId')
      .sort({ createdAt: -1 });
    res.json(registrations);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid registration ID format' });
    }
    
    const registration = await VehicleRegistration.findById(req.params.id)
      .populate('formId');
    if (!registration) return res.status(404).json({ error: 'Registration not found' });
    res.json(registration);
  })
);

router.post(
  '/:id/approve',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid registration ID format' });
    }

    const { typeId, categoryId, departmentId, allowedGates, expiryDate, plateNumber } = req.body;

    const registration = await VehicleRegistration.findById(id);
    if (!registration) return res.status(404).json({ error: 'Registration not found' });
    if (registration.status !== 'Pending') {
      return res.status(400).json({ error: `Cannot approve a registration in ${registration.status} status` });
    }
    
    const finalPlateNumber = plateNumber || registration.plateNumber;
    const { vehicle: existingVehicle, normalized: normalizedPlateNumber } = await findExistingByPlate(finalPlateNumber);

    let finalTypeId = typeId || registration.data?.typeId;
    let finalCategoryId = categoryId || registration.data?.categoryId;
    if (!finalCategoryId || finalCategoryId === "") {
      const defaultCat = await VehicleCategory.findOne();
      finalCategoryId = defaultCat ? defaultCat._id : undefined;
    }

    let finalDriverId = registration.data?.driverId;
    if (!finalDriverId || finalDriverId === "") {
      finalDriverId = undefined;
    }
    
    let finalDepartmentId = departmentId || registration.data?.departmentId;
    if (!finalDepartmentId || finalDepartmentId === "") {
      finalDepartmentId = undefined;
    }

    // Duplicate check
    if (existingVehicle) {
       return res.status(409).json({ error: 'Vehicle with this plate number already exists' });
    }

    // Create the vehicle
    const vehicle = await Vehicle.create({
      plateNumber: finalPlateNumber,
      normalizedPlateNumber: normalizedPlateNumber,
      typeId: finalTypeId,
      categoryId: finalCategoryId,
      driverId: finalDriverId,
      departmentId: finalDepartmentId,
      allowedGates,
      expiryDate,
      ownerId: registration._id,
      ownerModel: 'Registration',
      aiMetadata: registration.aiEnrollmentData && Object.keys(registration.aiEnrollmentData).length
        ? registration.aiEnrollmentData
        : buildEnrollmentSnapshot({
            aiResult: null,
            plateNumber: finalPlateNumber,
            matchType: null,
            source: 'manual',
          }),
      metadata: { photos: registration.photos }
    });

    registration.status = 'Approved';
    registration.plateNumber = finalPlateNumber;
    registration.normalizedPlateNumber = normalizedPlateNumber;
    registration.reviewedAt = new Date();
    // registration.reviewedBy = req.user._id; // Add auth later
    await registration.save();
    
    // Store in Future AI Training Dataset
    try {
      await VehicleTrainingDataset.create({
        typeId,
        plateNumber: finalPlateNumber,
        images: registration.photos,
        approvedAt: new Date()
      });
    } catch (err) {
      console.error('Failed to save to VehicleTrainingDataset:', err.message);
    }
    
    // Create Audit Log
    await VehicleActivityLog.create({
      capturedPlate: finalPlateNumber,
      normalizedCapturedPlate: normalizedPlateNumber,
      confidence: registration.aiEnrollmentData?.confidence?.ocr || 0,
      snapshotUrl: registration.photos.frontPlate,
      decision: 'Granted',
      reason: 'Vehicle Registration Approved',
      metadata: { action: 'RegistrationApprove', registrationId: registration._id, vehicleId: vehicle._id }
    });

    res.json({ message: 'Vehicle approved successfully', vehicle });
  })
);

router.post(
  '/:id/reject',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid registration ID format' });
    }

    const { reason } = req.body;
    
    const registration = await VehicleRegistration.findById(id);
    if (!registration) return res.status(404).json({ error: 'Registration not found' });
    if (registration.status !== 'Pending') {
      return res.status(400).json({ error: `Cannot reject a registration in ${registration.status} status` });
    }

    registration.status = 'Rejected';
    registration.notes = reason || 'No reason provided';
    registration.reviewedAt = new Date();
    // registration.reviewedBy = req.user._id; // Add auth later
    await registration.save();
    
    // Create Audit Log
    await VehicleActivityLog.create({
      capturedPlate: registration.plateNumber,
      normalizedCapturedPlate: registration.normalizedPlateNumber,
      confidence: registration.aiEnrollmentData?.confidence?.ocr || 0,
      snapshotUrl: registration.photos.frontPlate,
      decision: 'Denied',
      reason: `Vehicle Registration Rejected: ${registration.notes}`,
      metadata: { action: 'RegistrationReject', registrationId: registration._id }
    });

    res.json({ message: 'Vehicle registration rejected' });
  })
);

router.put(
  '/:id/photos/:photoKey',
  upload.single('photo'),
  asyncHandler(async (req, res) => {
    const { id, photoKey } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid registration ID format' });
    }

    const validKeys = ['front', 'rear', 'left', 'right', 'frontPlate', 'rearPlate'];
    if (!validKeys.includes(photoKey)) {
      return res.status(400).json({ error: 'Invalid photo key' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No photo uploaded' });
    }

    const registration = await VehicleRegistration.findById(id);
    if (!registration) {
      return res.status(404).json({ error: 'Registration not found' });
    }
    
    if (registration.status !== 'Pending') {
      return res.status(400).json({ error: `Cannot update photos for a registration in ${registration.status} status` });
    }

    // Update the photo
    if (!registration.photos) registration.photos = {};
    
    if (isObjectStorageEnabled() && req.file.buffer) {
       try {
         const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}-${req.file.originalname}`;
         const uploadResult = await uploadPhoto(req.file.buffer, 'vehicles', uniqueName, req.file.mimetype);
         registration.photos[photoKey] = uploadResult.url || uploadResult;
       } catch (err) {
         return res.status(500).json({ error: 'Failed to upload photo to cloud storage' });
       }
    } else {
       registration.photos[photoKey] = req.file.filename || req.file.originalname;
    }
    
    // Note: We are not re-triggering AI processing here to keep it simple, 
    // but the new image is saved for review.
    
    registration.markModified('photos');
    await registration.save();

    res.json({ message: 'Photo updated successfully', registration });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const registration = await VehicleRegistration.findById(req.params.id);
    if (!registration) return res.status(404).json({ error: 'Registration not found' });

    await VehicleRegistration.findByIdAndDelete(req.params.id);

    // Keep Vehicle Master in sync when an approved registration is removed.
    if (registration.status === 'Approved') {
      await Vehicle.findOneAndDelete({ normalizedPlateNumber: registration.normalizedPlateNumber });
    }

    res.json({ message: 'Registration deleted successfully' });
  })
);

export default router;
