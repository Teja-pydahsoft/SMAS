import { Router } from 'express';
import Gate from '../models/Gate.js';
import Division from '../models/Division.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { GATE_TYPES } from '../constants/index.js';

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
    if (req.query.divisionId) filter.divisionId = req.query.divisionId;
    if (req.query.isActive === 'true') filter.isActive = true;

    const gates = await Gate.find(filter)
      .populate('divisionId', 'name slug isActive')
      .sort({ createdAt: -1 });

    res.json(gates);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const gate = await Gate.findById(req.params.id).populate('divisionId', 'name slug isActive');
    if (!gate) return res.status(404).json({ error: 'Gate not found' });
    res.json(gate);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { divisionId, name, gateType, description, metadata } = req.body;
    if (!divisionId) return res.status(400).json({ error: 'Division is required' });
    if (!name?.trim()) return res.status(400).json({ error: 'Gate name is required' });
    if (!Object.values(GATE_TYPES).includes(gateType)) {
      return res.status(400).json({ error: 'gateType must be entry, exit, or both' });
    }

    const division = await Division.findById(divisionId);
    if (!division) return res.status(404).json({ error: 'Division not found' });

    const slug = req.body.slug || slugify(name);
    const gate = await Gate.create({
      divisionId,
      name: name.trim(),
      slug,
      gateType,
      description: description?.trim() || '',
      metadata,
    });

    const populated = await Gate.findById(gate._id).populate('divisionId', 'name slug isActive');
    res.status(201).json(populated);
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { name, gateType, description, isActive, metadata } = req.body;

    if (gateType !== undefined && !Object.values(GATE_TYPES).includes(gateType)) {
      return res.status(400).json({ error: 'gateType must be entry, exit, or both' });
    }

    const gate = await Gate.findByIdAndUpdate(
      req.params.id,
      {
        ...(name !== undefined && { name: name.trim() }),
        ...(gateType !== undefined && { gateType }),
        ...(description !== undefined && { description }),
        ...(isActive !== undefined && { isActive }),
        ...(metadata !== undefined && { metadata }),
      },
      { new: true, runValidators: true }
    ).populate('divisionId', 'name slug isActive');

    if (!gate) return res.status(404).json({ error: 'Gate not found' });
    res.json(gate);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const gate = await Gate.findByIdAndDelete(req.params.id);
    if (!gate) return res.status(404).json({ error: 'Gate not found' });
    res.json({ message: 'Gate deleted' });
  })
);

export default router;
