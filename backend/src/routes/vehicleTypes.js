import { Router } from 'express';
import VehicleType from '../models/VehicleType.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const types = await VehicleType.find().sort({ createdAt: -1 });
    res.json(types);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const type = await VehicleType.findById(req.params.id);
    if (!type) return res.status(404).json({ error: 'Vehicle Type not found' });
    res.json(type);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, description, isActive, metadata } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const type = await VehicleType.create({
      name,
      description,
      isActive: isActive !== undefined ? isActive : true,
      metadata,
    });
    res.status(201).json(type);
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { name, description, isActive, metadata } = req.body;
    const update = { name, description, isActive, metadata };
    
    const type = await VehicleType.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!type) return res.status(404).json({ error: 'Vehicle Type not found' });
    res.json(type);
  })
);


export default router;
