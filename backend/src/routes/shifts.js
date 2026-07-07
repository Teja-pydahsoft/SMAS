import { Router } from 'express';
import Shift from '../models/Shift.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.isActive !== undefined) {
      filter.isActive = req.query.isActive === 'true';
    }
    const shifts = await Shift.find(filter).sort({ createdAt: -1 });
    res.json(shifts);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const shift = await Shift.findById(req.params.id);
    if (!shift) return res.status(404).json({ error: 'Shift not found' });
    res.json(shift);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, description, metadata } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const slug = req.body.slug || slugify(name);
    const shift = await Shift.create({ name, slug, description, metadata });
    res.status(201).json(shift);
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { name, description, isActive, metadata } = req.body;
    const update = {};
    if (name !== undefined) {
      update.name = name;
      update.slug = req.body.slug || slugify(name);
    }
    if (description !== undefined) update.description = description;
    if (isActive !== undefined) update.isActive = isActive;
    if (metadata !== undefined) update.metadata = metadata;

    const shift = await Shift.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    });
    if (!shift) return res.status(404).json({ error: 'Shift not found' });
    res.json(shift);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const shift = await Shift.findByIdAndDelete(req.params.id);
    if (!shift) return res.status(404).json({ error: 'Shift not found' });
    res.json({ message: 'Shift deleted' });
  })
);

export default router;
