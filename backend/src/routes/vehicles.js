import { Router } from 'express';
import mongoose from 'mongoose';
import QRCode from 'qrcode';
import Vehicle from '../models/Vehicle.js';
import EquipmentMovement from '../models/EquipmentMovement.js';
import VehicleRegistration from '../models/VehicleRegistration.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { getVehicleModuleSummary } from '../services/vehicleSummaryService.js';
import SystemSetting from '../models/SystemSetting.js';

const router = Router();

router.get('/summary', asyncHandler(async (req, res) => {
  res.json(await getVehicleModuleSummary());
}));

router.get('/dashboard', asyncHandler(async (req, res) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [total, active, inside, pending, todayEntries, todayExits, typesRaw, statuses] = await Promise.all([
    Vehicle.countDocuments(),
    Vehicle.countDocuments({ status: 'Active' }),
    EquipmentMovement.countDocuments({ status: 'Inside' }),
    VehicleRegistration.countDocuments({ status: 'Pending' }),
    EquipmentMovement.countDocuments({ inTime: { $gte: todayStart } }),
    EquipmentMovement.countDocuments({ outTime: { $gte: todayStart } }),
    Vehicle.aggregate([
      { $group: { _id: '$typeId', count: { $sum: 1 } } },
      { $lookup: { from: 'vehicletypes', localField: '_id', foreignField: '_id', as: 'typeInfo' } },
      { $unwind: { path: '$typeInfo', preserveNullAndEmptyArrays: true } },
      { $project: { _id: 0, name: '$typeInfo.name', count: 1 } }
    ]),
    Vehicle.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $project: { _id: 0, status: '$_id', count: 1 } }
    ])
  ]);

  res.json({
    total, active, inside, pending, todayEntries, todayExits,
    types: typesRaw.map(t => ({ name: t.name || 'Unknown', count: t.count })),
    statuses
  });
}));

router.get('/movements', asyncHandler(async (req, res) => {
  const { vehicleId, plateNumber, direction, departmentId, status, from, to, limit = 500, page = 1 } = req.query;
  const filter = {};

  if (vehicleId) {
    filter.vehicleId = vehicleId;
  } else if (plateNumber) {
    const cleanPlate = plateNumber.toLowerCase().replace(/\s+/g, '');
    const vehicle = await Vehicle.findOne({ 
      $or: [
        { normalizedPlateNumber: cleanPlate },
        { plateNumber: new RegExp('^' + plateNumber + '$', 'i') }
      ]
    });
    if (vehicle) filter.vehicleId = vehicle._id;
    else filter.vehicleId = null;
  }
  if (departmentId) filter.departmentId = departmentId;
  if (status) filter.status = status;
  
  if (from || to) {
    const dateFilter = {};
    if (from) dateFilter.$gte = new Date(from);
    if (to) dateFilter.$lte = new Date(to);
    if (direction === 'Exit') filter.outTime = dateFilter;
    else filter.inTime = dateFilter;
  } else if (direction === 'Entry') {
    filter.inTime = { $ne: null };
  } else if (direction === 'Exit') {
    filter.outTime = { $ne: null };
  }

  const skip = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
  
  const [total, data] = await Promise.all([
    EquipmentMovement.countDocuments(filter),
    EquipmentMovement.find(filter)
      .populate('vehicleId', 'plateNumber typeId metadata status')
      .populate('departmentId', 'name')
      .populate('divisionId', 'name')
      .populate('enteredBy', 'name')
      .populate('exitedBy', 'name')
      .sort({ inTime: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10))
  ]);

  await Vehicle.populate(data, { path: 'vehicleId.typeId', model: 'VehicleType', select: 'name' });

  res.json({ total, page: parseInt(page, 10), limit: parseInt(limit, 10), data });
}));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    
    const vehicles = await Vehicle.find(filter)
      .populate('typeId')
      .populate('categoryId')
      .populate('driverId')
      .sort({ createdAt: -1 })
      .lean();
      
    if (!vehicles.length) {
      return res.json([]);
    }

    const vehicleIds = vehicles.map(v => v._id);
    
    // Aggregation: fetch only the most recent movement per vehicle
    const latestMovements = await EquipmentMovement.aggregate([
      { $match: { vehicleId: { $in: vehicleIds } } },
      { $sort: { inTime: -1 } },
      {
        $group: {
          _id: '$vehicleId',
          doc: { $first: '$$ROOT' }
        }
      }
    ]);
      
    const populatedMovements = await EquipmentMovement.populate(latestMovements.map(m => m.doc), [
      { path: 'departmentId', select: 'name' },
      { path: 'divisionId', select: 'name' },
      { path: 'enteredBy', select: 'name' },
      { path: 'exitedBy', select: 'name' }
    ]);
      
    const movementMap = {};
    for (const m of populatedMovements) {
      if (m && m.vehicleId) {
        movementMap[m.vehicleId.toString()] = m;
      }
    }
    
    for (const v of vehicles) {
      v.activeMovement = movementMap[v._id.toString()] || null;
    }
      
    res.json(vehicles);
  })
);

router.post(
  '/check-batch',
  asyncHandler(async (req, res) => {
    const { plates } = req.body;
    if (!Array.isArray(plates) || plates.length === 0) {
      return res.status(400).json({ error: 'Array of plates is required' });
    }

    const normalizedPlates = plates.map(p => p.toLowerCase().replace(/\s+/g, ''));
    
    const vehicles = await Vehicle.find({ normalizedPlateNumber: { $in: normalizedPlates } })
      .populate('typeId')
      .populate('categoryId')
      .populate('departmentId')
      .populate('divisionId');

    const result = {};
    for (const v of vehicles) {
      result[v.normalizedPlateNumber] = v;
    }
    
    res.json(result);
  })
);

// GET /api/vehicles/settings
router.get(
  '/settings',
  asyncHandler(async (req, res) => {
    let settings = await SystemSetting.findOne({ singleton: 'singleton' });
    if (!settings) {
      settings = await SystemSetting.create({ singleton: 'singleton' });
    }
    // ensure vehicleSettings exists
    if (!settings.vehicleSettings) {
      settings.vehicleSettings = { ocrEnabled: true, qrEnabled: false };
      await settings.save();
    }
    res.json(settings.vehicleSettings);
  })
);

// PUT /api/vehicles/settings
router.put(
  '/settings',
  asyncHandler(async (req, res) => {
    const { ocrEnabled, qrEnabled } = req.body;
    let settings = await SystemSetting.findOne({ singleton: 'singleton' });
    if (!settings) settings = new SystemSetting({ singleton: 'singleton' });
    
    settings.vehicleSettings = {
      ocrEnabled: ocrEnabled !== undefined ? ocrEnabled : true,
      qrEnabled: qrEnabled !== undefined ? qrEnabled : false
    };
    
    // business rule: if ocr is off, turn on the qr by default
    if (!settings.vehicleSettings.ocrEnabled) {
      settings.vehicleSettings.qrEnabled = true;
    }
    
    await settings.save();
    res.json(settings.vehicleSettings);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const vehicle = await Vehicle.findById(req.params.id)
      .populate('typeId')
      .populate('categoryId')
      .populate('driverId')
      .populate('departmentId')
      .populate('divisionId')
      .populate('allowedGates');
      
    if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });
    res.json(vehicle);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const vehicle = await Vehicle.findByIdAndDelete(req.params.id);
    if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });

    // Remove only stale pending requests for this plate. Keep Approved/Rejected history.
    const plateKey = normalizePlateKey(vehicle.normalizedPlateNumber || vehicle.plateNumber);
    if (plateKey) {
      await VehicleRegistration.deleteMany({
        normalizedPlateNumber: plateKey,
        status: 'Pending',
      });
    }

    res.json({ message: 'Vehicle deleted successfully' });
  })
);

router.get(
  '/:id/qr',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    let plateNumber = null;
    
    if (mongoose.Types.ObjectId.isValid(id)) {
      const vehicle = await Vehicle.findById(id);
      if (vehicle) plateNumber = vehicle.plateNumber;
    }
    
    if (!plateNumber) {
      const registration = await VehicleRegistration.findById(id);
      if (registration) plateNumber = registration.plateNumber;
    }
    
    if (!plateNumber) {
      return res.status(404).json({ error: 'Vehicle or Registration not found' });
    }
    
    const qrDataUrl = await QRCode.toDataURL(plateNumber, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 600,
      color: { dark: '#000000', light: '#ffffff' }
    });
    
    res.json({ qrDataUrl, plateNumber });
  })
);

function normalizePlateKey(plate) {
  return String(plate || '').toUpperCase().replace(/[^A-Z0-9]/g, '').toLowerCase();
}

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { plateNumber, typeId, categoryId, driverId, departmentId, divisionId, status, allowedGates, expiryDate, ownerId, ownerModel, metadata } = req.body;
    if (!plateNumber || !typeId || !categoryId) {
      return res.status(400).json({ error: 'Plate Number, Type, and Category are required' });
    }

    const normalizedPlateNumber = plateNumber.toLowerCase().replace(/\s+/g, '');

    const existing = await Vehicle.findOne({ normalizedPlateNumber });
    if (existing) {
      return res.status(409).json({ error: 'Vehicle with this plate number already exists' });
    }

    const vehicle = await Vehicle.create({
      plateNumber,
      normalizedPlateNumber,
      typeId,
      categoryId,
      driverId,
      departmentId,
      divisionId,
      status: status || 'Active',
      allowedGates,
      expiryDate,
      ownerId,
      ownerModel,
      metadata,
    });
    res.status(201).json(vehicle);
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { status, allowedGates, expiryDate, departmentId, divisionId, typeId, categoryId, driverId, metadata } = req.body;
    
    const update = { status, allowedGates, expiryDate, departmentId, divisionId, typeId, categoryId, driverId, metadata };
    
    const vehicle = await Vehicle.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });
    res.json(vehicle);
  })
);

export default router;
