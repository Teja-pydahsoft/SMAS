import fs from 'fs';
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

      const imagePayload = {};
      for (const key of ['frontPlate']) {
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
        console.log('[POST /analyze] 8. res.status(500).json(...) executed (AI Error)');
        return res.status(500).json({ error: 'AI processing failed', details: err.message });
      }

      const plateNumber = aiResult.normalizedPlateNumber || aiResult.frontPlateNumber;
      if (!plateNumber) {
        console.log('[POST /analyze] 8. res.status(400).json(...) executed (Plate missing)');
        return res.status(400).json({ error: 'Plate number could not be detected' });
      }

      const normalizedPlateNumber = plateNumber.toLowerCase().replace(/\s+/g, '');
      const vehicle = await Vehicle.findOne({ normalizedPlateNumber }).populate('typeId');
      const pendingReg = await VehicleRegistration.findOne({ normalizedPlateNumber, status: 'Pending' });

      console.log('[POST /analyze] 6. Vehicle Master lookup completed.', vehicle ? 'Found' : (pendingReg ? 'Found Pending' : 'Not found'));

      console.log('[POST /analyze] 7. Preparing response.');
      if (vehicle) {
        console.log('[POST /analyze] 8. res.json(...) executed (Found in Master)');
        return res.json({
          foundInMaster: true,
          message: 'Vehicle Already Registered',
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
        console.log('[POST /analyze] 8. res.json(...) executed (Found Pending)');
        return res.json({
          foundInMaster: true, // Reuse foundInMaster to block frontend submission
          message: 'Registration Already Pending',
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

      console.log('[POST /analyze] 8. res.json(...) executed (Not in Master)');
      return res.json({
        foundInMaster: false,
        plateNumber,
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

    const { formId, data, submittedBy, plateNumber: manualPlateNumber } = req.body;
    if (!formId) {
      return res.status(400).json({ error: 'formId is required' });
    }

    let parsedData = {};
    if (data) {
      try { parsedData = typeof data === 'string' ? JSON.parse(data) : data; }
      catch(e) { parsedData = {}; }
    }

    // Prepare ONLY frontPlate image for AI Server
    const imagePayload = {};
    for (const key of ['frontPlate']) {
      if (!files[key] || !files[key][0]) continue;
      const f = files[key][0];
      let buffer;
      if (f.buffer) {
        buffer = f.buffer;
      } else if (f.path) {
        buffer = await fs.promises.readFile(f.path);
      } else {
        return res.status(500).json({ error: `Failed to read uploaded file data for ${key}` });
      }
      imagePayload[key] = { buffer, filename: f.originalname, mimeType: f.mimetype };
    }

    let aiResult;
    try {
      aiResult = await analyzeVehicle(imagePayload);
    } catch (err) {
      return res.status(500).json({ error: 'AI processing failed', details: err.message });
    }

    // AI classification can populate nullable fields in future, but we use the provided typeId
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

    // Determine plate number
    const plateNumber = manualPlateNumber || aiResult.normalizedPlateNumber || aiResult.frontPlateNumber;
    if (!plateNumber) {
      return res.status(400).json({ error: 'Plate number is required. AI returned null and no manual plate number was provided.' });
    }
    
    const normalizedPlateNumber = plateNumber.toLowerCase().replace(/\s+/g, '');
    
    // Validate duplicate plates
    const existingVehicle = await Vehicle.findOne({ normalizedPlateNumber });
    if (existingVehicle) {
      return res.status(409).json({ error: 'Vehicle with this plate number already exists in Vehicle Master' });
    }
    
    const existingRegistration = await VehicleRegistration.findOne({ normalizedPlateNumber, status: 'Pending' });
    if (existingRegistration) {
      return res.status(409).json({ error: 'A pending registration for this plate number already exists' });
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

    const registration = await VehicleRegistration.create({
      formId,
      submittedBy: submittedBy || req.user?._id,
      data: parsedData,
      plateNumber,
      normalizedPlateNumber,
      photos,
      aiEnrollmentData: aiResult
    });

    console.log('--- After Mongo Save ---');
    console.log('Saved Registration ID:', registration._id);
    console.log('Saved Photos:', registration.photos);

    // Create Audit Log
    await VehicleActivityLog.create({
      capturedPlate: plateNumber,
      normalizedCapturedPlate: normalizedPlateNumber,
      confidence: aiResult.confidence?.ocr || 0,
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

import mongoose from 'mongoose';

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
    const normalizedPlateNumber = finalPlateNumber.toLowerCase().replace(/\s+/g, '');

    let finalTypeId = typeId || registration.data?.typeId;
    let finalCategoryId = categoryId || registration.data?.categoryId;

    if (!finalCategoryId) {
      const defaultCat = await VehicleCategory.findOne();
      if (defaultCat) finalCategoryId = defaultCat._id;
    }

    // Duplicate check
    const existingVehicle = await Vehicle.findOne({ normalizedPlateNumber });
    if (existingVehicle) {
       return res.status(409).json({ error: 'Vehicle with this plate number already exists' });
    }

    // Create the vehicle
    const vehicle = await Vehicle.create({
      plateNumber: finalPlateNumber,
      normalizedPlateNumber: normalizedPlateNumber,
      typeId: finalTypeId,
      categoryId: finalCategoryId,
      departmentId,
      allowedGates,
      expiryDate,
      ownerId: registration._id,
      ownerModel: 'Registration',
      aiMetadata: registration.aiEnrollmentData, // Preserves original AI response
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
    const registration = await VehicleRegistration.findByIdAndDelete(req.params.id);
    if (!registration) return res.status(404).json({ error: 'Registration not found' });
    res.json({ message: 'Registration deleted successfully' });
  })
);

export default router;
