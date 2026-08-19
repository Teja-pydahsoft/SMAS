import { Router } from 'express';
import SystemRole from '../models/SystemRole.js';
import SystemUser from '../models/SystemUser.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requirePermission } from '../middleware/auth.js';
import { emptyPermissions, PERMISSION_MODULE_LIST } from '../constants/index.js';

const router = Router();

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizePermissions(input) {
  const base = emptyPermissions();
  if (!input || typeof input !== 'object') return base;

  for (const module of PERMISSION_MODULE_LIST) {
    const value = input[module];
    if (!value) continue;
    const write = Boolean(value.write);
    base[module] = {
      write,
      read: write || Boolean(value.read),
    };
  }
  return base;
}

async function findRoleByName(name, excludeId) {
  const query = {
    name: { $regex: `^${escapeRegex(name.trim())}$`, $options: 'i' },
  };
  if (excludeId) query._id = { $ne: excludeId };
  return SystemRole.findOne(query);
}

router.get(
  '/',
  requirePermission('system_roles', 'read'),
  asyncHandler(async (req, res) => {
    const roles = await SystemRole.find().sort({ createdAt: -1 });
    const roleIds = roles.map((r) => r._id);
    const userCounts = await SystemUser.aggregate([
      { $match: { systemRoleId: { $in: roleIds } } },
      { $group: { _id: '$systemRoleId', total: { $sum: 1 } } },
    ]);
    const countMap = new Map(userCounts.map((c) => [c._id.toString(), c.total]));

    res.json(
      roles.map((role) => ({
        ...role.toObject(),
        permissions: role.toPermissionObject(),
        userCount: countMap.get(role._id.toString()) ?? 0,
      }))
    );
  })
);

router.get(
  '/:id',
  requirePermission('system_roles', 'read'),
  asyncHandler(async (req, res) => {
    const role = await SystemRole.findById(req.params.id);
    if (!role) return res.status(404).json({ error: 'System role not found' });
    res.json({ ...role.toObject(), permissions: role.toPermissionObject() });
  })
);

router.post(
  '/',
  requirePermission('system_roles', 'write'),
  asyncHandler(async (req, res) => {
    const { name, description } = req.body;
    const trimmedName = name?.trim();
    if (!trimmedName) return res.status(400).json({ error: 'Role name is required' });
    if (trimmedName.length < 2) return res.status(400).json({ error: 'Role name must be at least 2 characters' });
    if (trimmedName.length > 60) return res.status(400).json({ error: 'Role name must be 60 characters or fewer' });

    const duplicate = await findRoleByName(trimmedName);
    if (duplicate) return res.status(400).json({ error: 'A role with this name already exists' });

    const slug = req.body.slug || slugify(trimmedName);
    const slugTaken = await SystemRole.findOne({ slug });
    if (slugTaken) return res.status(400).json({ error: 'A role with this name already exists' });

    try {
      const role = await SystemRole.create({
        name: trimmedName,
        slug,
        description: description?.trim() || '',
        permissions: normalizePermissions(req.body.permissions),
      });
      res.status(201).json({ ...role.toObject(), permissions: role.toPermissionObject() });
    } catch (err) {
      if (err?.code === 11000) {
        return res.status(400).json({ error: 'A role with this name already exists' });
      }
      throw err;
    }
  })
);

router.put(
  '/:id/permissions',
  requirePermission('system_roles', 'write'),
  asyncHandler(async (req, res) => {
    const permissions = normalizePermissions(req.body.permissions);
    const role = await SystemRole.findByIdAndUpdate(
      req.params.id,
      { permissions },
      { new: true, runValidators: true }
    );
    if (!role) return res.status(404).json({ error: 'System role not found' });
    res.json({ ...role.toObject(), permissions: role.toPermissionObject() });
  })
);

router.put(
  '/:id',
  requirePermission('system_roles', 'write'),
  asyncHandler(async (req, res) => {
    const { name, description, isActive } = req.body;
    if (name !== undefined) {
      const trimmedName = name.trim();
      if (!trimmedName) return res.status(400).json({ error: 'Role name is required' });
      const duplicate = await findRoleByName(trimmedName, req.params.id);
      if (duplicate) return res.status(400).json({ error: 'A role with this name already exists' });
    }
    const role = await SystemRole.findByIdAndUpdate(
      req.params.id,
      {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description }),
        ...(isActive !== undefined && { isActive }),
      },
      { new: true, runValidators: true }
    );
    if (!role) return res.status(404).json({ error: 'System role not found' });
    res.json({ ...role.toObject(), permissions: role.toPermissionObject() });
  })
);

router.delete(
  '/:id',
  requirePermission('system_roles', 'write'),
  asyncHandler(async (req, res) => {
    const inUse = await SystemUser.countDocuments({ systemRoleId: req.params.id });
    if (inUse > 0) {
      return res.status(400).json({ error: 'Cannot delete a role that is assigned to users' });
    }
    const role = await SystemRole.findByIdAndDelete(req.params.id);
    if (!role) return res.status(404).json({ error: 'System role not found' });
    res.json({ message: 'System role deleted' });
  })
);

export default router;
