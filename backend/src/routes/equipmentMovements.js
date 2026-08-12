import express from 'express';
import asyncHandler from 'express-async-handler';
import fs from 'fs';
import EquipmentMovement from '../models/EquipmentMovement.js';
import IdleSession from '../models/IdleSession.js';
import Vehicle from '../models/Vehicle.js';
import Department from '../models/Department.js';
import Gate from '../models/Gate.js';
import { createMulter } from '../utils/storage.js';
import { isObjectStorageEnabled, uploadPhoto } from '../services/objectStorage.js';
import { analyzeVehicle, extractFaceEmbedding, searchFaceEmbeddings } from '../services/aiClient.js';
import Registration from '../models/Registration.js';
import GateLog from '../models/GateLog.js';
import { 
  logDepartmentEntry, 
  logDepartmentExit, 
  logIdleStarted, 
  logIdleCleared,
  logManualOverride
} from '../services/equipmentEventService.js';

const upload = createMulter('activity', (req, file) => {
  const ext = file.originalname.split('.').pop() || 'jpg';
  return `movement_${Date.now()}_${Math.floor(Math.random() * 1000)}.${ext}`;
});

const router = express.Router();

// Step 1: Upload and Analyze (No database movement recorded yet)
router.post(
  '/analyze',
  upload.single('image'),
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Image is required' });

    let buffer;
    if (req.file.buffer) buffer = req.file.buffer;
    else buffer = await fs.promises.readFile(req.file.path);

    const imagePayload = { frontPlate: { buffer, filename: req.file.originalname, mimeType: req.file.mimetype } };

    try {
      const aiResult = await analyzeVehicle(imagePayload);
      
      const plateNumber = aiResult.frontPlateNumber || aiResult.normalizedPlateNumber;
      let vehicle = null;
      let driver = null;
      let driverMatchScore = 0;
      
      if (plateNumber) {
        vehicle = await Vehicle.findOne({ normalizedPlateNumber: plateNumber.toLowerCase().replace(/\s+/g, '') }).populate('typeId');
      }
      
      try {
        const faceExt = await extractFaceEmbedding(req.file.buffer, req.file.originalname, req.file.mimetype);
        if (faceExt.face_detected && faceExt.embedding?.length) {
          const searchResult = await searchFaceEmbeddings(faceExt.embedding, {
            topK: 1,
            threshold: parseFloat(process.env.FACE_MATCH_THRESHOLD || '0.42')
          });
          if (searchResult.best?.id) {
            driver = await Registration.findById(searchResult.best.id).select('-faceEmbedding');
            driverMatchScore = searchResult.best.similarity;
          }
        }
      } catch (faceErr) {
        console.warn('Face detection error during vehicle analysis:', faceErr.message);
      }
      
      let activeMovement = null;
      if (vehicle) {
        activeMovement = await EquipmentMovement.findOne({ vehicleId: vehicle._id, status: 'Inside' }).populate('departmentId');
      }
      let snapshotUrl = req.file.filename;
      const ext = req.file.originalname.split('.').pop() || 'jpg';
      const uniqueFilename = snapshotUrl || `movement_${Date.now()}_${Math.floor(Math.random() * 1000)}.${ext}`;

      if (isObjectStorageEnabled()) {
        try {
          const result = await uploadPhoto(
            req.file.buffer,
            'activity',
            uniqueFilename,
            req.file.mimetype
          );
          snapshotUrl = result.url || result;
        } catch (uploadErr) {
          console.warn('[equipmentMovements] Cloud upload failed, falling back to local filename:', uploadErr.message);
          snapshotUrl = uniqueFilename;
        }
      } else {
        snapshotUrl = uniqueFilename;
      }

      res.json({
        success: true,
        aiResult,
        vehicle, 
        driver,
        driverMatchScore,
        activeMovement,
        snapshotUrl,
        message: plateNumber ? 'Analysis completed' : 'Analysis completed, manual entry may be required'
      });
    } catch (err) {
      res.status(500).json({ error: 'AI analysis failed', details: err.message });
    }
  })
);

// Step 2: Confirm Movement
router.post(
  '/capture',
  asyncHandler(async (req, res) => {
    const { vehicleId, departmentId, divisionId, direction, snapshotUrl, confidence, aiPlate, confirmedPlate, isOverride, driverId } = req.body;
    const movementSource = 'camera';

    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });
    
    const department = await Department.findById(departmentId);
    if (!department) return res.status(404).json({ error: 'Department not found' });

    const now = new Date();
    const userId = req.user ? req.user._id : null;

    if (isOverride) {
      await logManualOverride(vehicle, userId, `Confirmed Plate ${confirmedPlate} over AI ${aiPlate}`, snapshotUrl);
    }

    if (direction === 'Entry') {
      const existingMovement = await EquipmentMovement.findOne({ vehicleId, status: 'Inside' });
      if (existingMovement) {
        if (existingMovement.departmentId.toString() === departmentId) {
          return res.status(400).json({ error: 'Equipment is already inside this department' });
        }
        existingMovement.status = 'Exited';
        existingMovement.outTime = now;
        existingMovement.exitedBy = userId;
        existingMovement.outSnapshotUrl = snapshotUrl;
        await existingMovement.save();
      }

      const activeIdleSession = await IdleSession.findOne({ vehicleId, status: 'Active' });
      if (activeIdleSession) {
        activeIdleSession.status = 'Cleared';
        activeIdleSession.clearedAt = now;
        activeIdleSession.idleDurationMinutes = Math.round((now - activeIdleSession.startTime) / 60000);
        await activeIdleSession.save();
        await logIdleCleared(activeIdleSession);
      }

      let driverLog = null;
      if (driverId) {
        const registration = await Registration.findById(driverId);
        if (registration) {
          driverLog = await GateLog.create({
            registrationId: driverId,
            roleId: registration.roleId,
            divisionId,
            departmentId,
            gateId: 'department',
            scanType: 'department',
            eventType: 'entry',
            accessGranted: true,
            matched: true,
            scannedBy: userId,
            matchScore: 1.0,
            photoPath: snapshotUrl,
            metadata: { vehicleId }
          });
        }
      }

      const movement = await EquipmentMovement.create({
        vehicleId, departmentId, divisionId, enteredBy: userId, inTime: now, status: 'Inside', movementSource, snapshotUrl, driverId, driverLogId: driverLog?._id, metadata: { aiPlate, confirmedPlate }
      });

      await logDepartmentEntry(vehicle, departmentId, null, movementSource, movement._id, snapshotUrl, confidence);
      res.status(201).json({ message: 'Equipment entered department successfully', movement });
    } else {
      const existingMovement = await EquipmentMovement.findOne({ vehicleId, status: 'Inside' });
      if (!existingMovement) {
        return res.status(400).json({ error: 'Equipment is not currently inside any department' });
      }

      existingMovement.status = 'Exited';
      existingMovement.outTime = now;
      existingMovement.exitedBy = userId;
      existingMovement.outSnapshotUrl = snapshotUrl;
      await existingMovement.save();

      if (existingMovement.driverId) {
        const registration = await Registration.findById(existingMovement.driverId);
        if (registration) {
          await GateLog.create({
            registrationId: existingMovement.driverId,
            roleId: registration.roleId,
            divisionId: existingMovement.divisionId,
            departmentId: existingMovement.departmentId,
            gateId: 'department',
            scanType: 'department',
            eventType: 'exit',
            accessGranted: true,
            matched: true,
            scannedBy: userId,
            matchScore: 1.0,
            photoPath: snapshotUrl,
            metadata: { vehicleId, linkedMovementId: existingMovement._id }
          });
        }
      }

      const idleSession = await IdleSession.create({ vehicleId, lastDepartmentId: existingMovement.departmentId, startTime: now, status: 'Active' });
      
      await logDepartmentExit(vehicle, existingMovement.departmentId, null, movementSource, existingMovement._id, snapshotUrl, confidence);
      await logIdleStarted(idleSession);

      res.json({ message: 'Equipment exited department successfully', movement: existingMovement });
    }
  })
);

// We can retain the pure manual /entry and /exit for fallback if needed, but I'll refactor them to use event service
router.post('/entry', asyncHandler(async (req, res) => {
    const { vehicleId, departmentId, divisionId, movementSource = 'manual' } = req.body;
    const vehicle = await Vehicle.findById(vehicleId);
    const now = new Date();
    
    const existingMovement = await EquipmentMovement.findOne({ vehicleId, status: 'Inside' });
    if (existingMovement) {
      if (existingMovement.departmentId.toString() === departmentId) return res.status(400).json({ error: 'Already inside' });
      existingMovement.status = 'Exited'; existingMovement.outTime = now; await existingMovement.save();
    }

    const activeIdleSession = await IdleSession.findOne({ vehicleId, status: 'Active' });
    if (activeIdleSession) {
      activeIdleSession.status = 'Cleared'; activeIdleSession.clearedAt = now;
      activeIdleSession.idleDurationMinutes = Math.round((now - activeIdleSession.startTime) / 60000);
      await activeIdleSession.save();
      await logIdleCleared(activeIdleSession);
    }

    const movement = await EquipmentMovement.create({ vehicleId, departmentId, divisionId, inTime: now, status: 'Inside', movementSource });
    await logDepartmentEntry(vehicle, departmentId, null, movementSource, movement._id);
    res.json({ movement });
}));

router.post('/exit', asyncHandler(async (req, res) => {
    const { vehicleId, movementSource = 'manual' } = req.body;
    const vehicle = await Vehicle.findById(vehicleId);
    const existingMovement = await EquipmentMovement.findOne({ vehicleId, status: 'Inside' });
    if (!existingMovement) return res.status(400).json({ error: 'Not inside' });

    const now = new Date();
    existingMovement.status = 'Exited'; existingMovement.outTime = now; await existingMovement.save();
    const idleSession = await IdleSession.create({ vehicleId, lastDepartmentId: existingMovement.departmentId, startTime: now, status: 'Active' });
    
    await logDepartmentExit(vehicle, existingMovement.departmentId, null, movementSource, existingMovement._id);
    await logIdleStarted(idleSession);
    res.json({ movement: existingMovement });
}));

export default router;
