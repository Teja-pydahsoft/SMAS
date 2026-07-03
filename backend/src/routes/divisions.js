import { Router } from 'express';
import Division from '../models/Division.js';
import Gate from '../models/Gate.js';
import Department from '../models/Department.js';
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
    if (req.query.isActive === 'true') filter.isActive = true;

    const divisions = await Division.find(filter).sort({ createdAt: -1 });
    const divisionIds = divisions.map((d) => d._id);

    const gateCounts = await Gate.aggregate([
      { $match: { divisionId: { $in: divisionIds } } },
      { $group: { _id: '$divisionId', total: { $sum: 1 }, active: { $sum: { $cond: ['$isActive', 1, 0] } } } },
    ]);

    const deptCounts = await Department.aggregate([
      { $match: { divisionIds: { $in: divisionIds } } },
      { $unwind: '$divisionIds' },
      { $match: { divisionIds: { $in: divisionIds } } },
      { $group: { _id: '$divisionIds', total: { $sum: 1 }, active: { $sum: { $cond: ['$isActive', 1, 0] } } } },
    ]);

    const countMap = new Map(gateCounts.map((g) => [g._id.toString(), g]));
    const deptMap = new Map(deptCounts.map((d) => [d._id.toString(), d]));

    res.json(
      divisions.map((division) => {
        const counts = countMap.get(division._id.toString());
        const dept = deptMap.get(division._id.toString());
        return {
          ...division.toObject(),
          gateCount: counts?.total ?? 0,
          activeGateCount: counts?.active ?? 0,
          departmentCount: dept?.total ?? 0,
          activeDepartmentCount: dept?.active ?? 0,
        };
      })
    );
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const division = await Division.findById(req.params.id);
    if (!division) return res.status(404).json({ error: 'Division not found' });

    const gates = await Gate.find({ divisionId: division._id }).sort({ createdAt: 1 });
    const departments = await Department.find({ divisionIds: division._id })
      .populate('divisionIds', 'name slug isActive')
      .sort({ createdAt: 1 });
    res.json({ ...division.toObject(), gates, departments });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, description, metadata, gates = [] } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Division name is required' });

    const slug = req.body.slug || slugify(name);
    const division = await Division.create({
      name: name.trim(),
      slug,
      description: description?.trim() || '',
      metadata,
    });

    const createdGates = [];
    for (const gateInput of gates) {
      if (!gateInput?.name?.trim() || !gateInput?.gateType) continue;
      const gateSlug = gateInput.slug || slugify(gateInput.name);
      const gate = await Gate.create({
        divisionId: division._id,
        name: gateInput.name.trim(),
        slug: gateSlug,
        gateType: gateInput.gateType,
        description: gateInput.description?.trim() || '',
      });
      createdGates.push(gate);
    }

    res.status(201).json({ ...division.toObject(), gates: createdGates });
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { name, description, isActive, metadata } = req.body;
    const division = await Division.findByIdAndUpdate(
      req.params.id,
      {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description }),
        ...(isActive !== undefined && { isActive }),
        ...(metadata !== undefined && { metadata }),
      },
      { new: true, runValidators: true }
    );
    if (!division) return res.status(404).json({ error: 'Division not found' });
    res.json(division);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const division = await Division.findById(req.params.id);
    if (!division) return res.status(404).json({ error: 'Division not found' });

    await Gate.deleteMany({ divisionId: division._id });
    await Department.updateMany(
      { divisionIds: division._id },
      { $pull: { divisionIds: division._id } }
    );
    await Department.deleteMany({ divisionIds: { $size: 0 } });
    await division.deleteOne();
    res.json({ message: 'Division deleted; linked departments updated' });
  })
);

export default router;
