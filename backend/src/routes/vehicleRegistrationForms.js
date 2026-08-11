import { Router } from 'express';
import VehicleRegistrationForm from '../models/VehicleRegistrationForm.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

router.get(
  '/config',
  asyncHandler(async (req, res) => {
    // Usually there's just one active vehicle form, or we can fetch all.
    const form = await VehicleRegistrationForm.findOne({ isActive: true }).sort({ createdAt: -1 });
    if (!form) return res.status(404).json({ error: 'No active vehicle registration form found' });
    res.json(form);
  })
);

router.post(
  '/config',
  asyncHandler(async (req, res) => {
    const { name, description, schema, isActive, metadata } = req.body;
    
    // Deactivate others if this is set to active
    if (isActive) {
        await VehicleRegistrationForm.updateMany({}, { isActive: false });
    }

    const form = await VehicleRegistrationForm.create({
      name,
      description,
      schema,
      isActive: isActive !== undefined ? isActive : true,
      metadata,
    });
    res.status(201).json(form);
  })
);

export default router;
