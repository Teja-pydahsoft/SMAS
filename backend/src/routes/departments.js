import { Router } from 'express';
import mongoose from 'mongoose';
import Department from '../models/Department.js';
import Division from '../models/Division.js';
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

function normalizeDivisionIds(body) {
  if (Array.isArray(body.divisionIds) && body.divisionIds.length > 0) {
    return [...new Set(body.divisionIds.map(String))];
  }
  if (body.divisionId) return [String(body.divisionId)];
  return [];
}

async function validateDivisions(divisionIds) {
  if (divisionIds.length === 0) {
    return { error: 'At least one division is required' };
  }
  const invalid = divisionIds.filter((id) => !mongoose.Types.ObjectId.isValid(id));
  if (invalid.length > 0) {
    return { error: 'One or more division IDs are invalid' };
  }
  const divisions = await Division.find({ _id: { $in: divisionIds } });
  if (divisions.length !== divisionIds.length) {
    return { error: 'One or more divisions were not found' };
  }
  return { divisions };
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.divisionId) filter.divisionIds = req.query.divisionId;
    if (req.query.isActive === 'true') filter.isActive = true;

    const departments = await Department.find(filter)
      .populate('divisionIds', 'name slug isActive')
      .sort({ createdAt: -1 });

    res.json(departments);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const department = await Department.findById(req.params.id).populate(
      'divisionIds',
      'name slug isActive description'
    );
    if (!department) return res.status(404).json({ error: 'Department not found' });
    res.json(department);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, description, metadata } = req.body;
    const divisionIds = normalizeDivisionIds(req.body);

    const divisionCheck = await validateDivisions(divisionIds);
    if (divisionCheck.error) return res.status(400).json({ error: divisionCheck.error });
    if (!name?.trim()) return res.status(400).json({ error: 'Department name is required' });

    const slug = req.body.slug || slugify(name);
    const department = await Department.create({
      divisionIds,
      name: name.trim(),
      slug,
      description: description?.trim() || '',
      metadata,
    });

    const populated = await Department.findById(department._id).populate(
      'divisionIds',
      'name slug isActive'
    );
    res.status(201).json(populated);
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { name, description, isActive, metadata } = req.body;
    const updates = {
      ...(name !== undefined && { name: name.trim() }),
      ...(description !== undefined && { description }),
      ...(isActive !== undefined && { isActive }),
      ...(metadata !== undefined && { metadata }),
    };

    if (req.body.divisionIds !== undefined || req.body.divisionId !== undefined) {
      const divisionIds = normalizeDivisionIds(req.body);
      const divisionCheck = await validateDivisions(divisionIds);
      if (divisionCheck.error) return res.status(400).json({ error: divisionCheck.error });
      updates.divisionIds = divisionIds;
    }

    const department = await Department.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    }).populate('divisionIds', 'name slug isActive');

    if (!department) return res.status(404).json({ error: 'Department not found' });
    res.json(department);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const department = await Department.findByIdAndDelete(req.params.id);
    if (!department) return res.status(404).json({ error: 'Department not found' });
    res.json({ message: 'Department deleted' });
  })
);

export default router;
