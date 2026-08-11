import { Router } from 'express';
import VehicleCategory from '../models/VehicleCategory.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const categories = await VehicleCategory.find().sort({ createdAt: -1 });
    res.json(categories);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const category = await VehicleCategory.findById(req.params.id);
    if (!category) return res.status(404).json({ error: 'Vehicle Category not found' });
    res.json(category);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, description, isActive, metadata } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const category = await VehicleCategory.create({
      name,
      description,
      isActive: isActive !== undefined ? isActive : true,
      metadata,
    });
    res.status(201).json(category);
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { name, description, isActive, metadata } = req.body;
    const update = { name, description, isActive, metadata };
    
    const category = await VehicleCategory.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!category) return res.status(404).json({ error: 'Vehicle Category not found' });
    res.json(category);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const category = await VehicleCategory.findByIdAndDelete(req.params.id);
    if (!category) return res.status(404).json({ error: 'Vehicle Category not found' });
    res.json({ message: 'Vehicle Category deleted' });
  })
);

export default router;
