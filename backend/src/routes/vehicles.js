import { Router } from 'express';
import Vehicle from '../models/Vehicle.js';
import EquipmentMovement from '../models/EquipmentMovement.js';
import VehicleRegistration from '../models/VehicleRegistration.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

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
  const { plateNumber, direction, departmentId, status, from, to, limit = 50, page = 1 } = req.query;
  const filter = {};

  if (plateNumber) {
    const vehicle = await Vehicle.findOne({ normalizedPlateNumber: plateNumber.toLowerCase().replace(/\s+/g, '') });
    if (vehicle) filter.vehicleId = vehicle._id;
    else filter.vehicleId = null; // force empty result
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
    // Basic filtering and population
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    
    const vehicles = await Vehicle.find(filter)
      .populate('typeId')
      .populate('categoryId')
      .populate('driverId')
      .sort({ createdAt: -1 })
      .lean();
      
    const vehicleIds = vehicles.map(v => v._id);
    const allMovements = await EquipmentMovement.find({ vehicleId: { $in: vehicleIds } })
      .sort({ inTime: -1 })
      .populate('departmentId', 'name')
      .populate('divisionId', 'name')
      .populate('enteredBy', 'name')
      .populate('exitedBy', 'name')
      .lean();
      
    const movementMap = {};
    for (const m of allMovements) {
      if (!movementMap[m.vehicleId.toString()]) {
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

    const baseKeys = [
      String(vehicle.normalizedPlateNumber || '').toLowerCase().replace(/[^a-z0-9]/g, ''),
      String(vehicle.plateNumber || '').toLowerCase().replace(/[^a-z0-9]/g, ''),
    ].filter(Boolean);
    const plateKeys = new Set(baseKeys);
    const swaps = { o: '0', 0: 'o', i: '1', 1: 'i', s: '5', 5: 's' };
    for (const key of baseKeys) {
      for (let i = 0; i < key.length; i++) {
        const swap = swaps[key[i]];
        if (!swap) continue;
        plateKeys.add(key.slice(0, i) + swap + key.slice(i + 1));
      }
    }
    if (plateKeys.size > 0) {
      await VehicleRegistration.deleteMany({ normalizedPlateNumber: { $in: [...plateKeys] } });
    }

    res.json({ message: 'Vehicle deleted successfully' });
  })
);

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
