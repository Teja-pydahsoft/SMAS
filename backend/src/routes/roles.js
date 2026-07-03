import { Router } from 'express';
import Role from '../models/Role.js';
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
    const roles = await Role.find().sort({ createdAt: -1 });
    res.json(roles);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const role = await Role.findById(req.params.id);
    if (!role) return res.status(404).json({ error: 'Role not found' });
    res.json(role);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, description, metadata } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const slug = req.body.slug || slugify(name);
    const role = await Role.create({ name, slug, description, metadata });
    res.status(201).json(role);
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { name, description, isActive, metadata } = req.body;
    const role = await Role.findByIdAndUpdate(
      req.params.id,
      { name, description, isActive, metadata },
      { new: true, runValidators: true }
    );
    if (!role) return res.status(404).json({ error: 'Role not found' });
    res.json(role);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const role = await Role.findByIdAndDelete(req.params.id);
    if (!role) return res.status(404).json({ error: 'Role not found' });
    res.json({ message: 'Role deleted' });
  })
);

export default router;
