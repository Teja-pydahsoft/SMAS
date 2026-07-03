import { Router } from 'express';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import SystemUser from '../models/SystemUser.js';
import SystemRole from '../models/SystemRole.js';
import Division from '../models/Division.js';
import Department from '../models/Department.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requirePermission } from '../middleware/auth.js';

const router = Router();

function normalizeIdList(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(String).filter((id) => mongoose.Types.ObjectId.isValid(id)))];
}

async function validateAccessScope(divisionIds, departmentIds) {
  if (divisionIds.length > 0) {
    const found = await Division.countDocuments({ _id: { $in: divisionIds } });
    if (found !== divisionIds.length) {
      return { error: 'One or more divisions were not found' };
    }
  }
  if (departmentIds.length > 0) {
    const departments = await Department.find({ _id: { $in: departmentIds } });
    if (departments.length !== departmentIds.length) {
      return { error: 'One or more departments were not found' };
    }
    if (divisionIds.length > 0) {
      const divisionSet = new Set(divisionIds);
      const invalidDept = departments.find((dept) =>
        !(dept.divisionIds || []).some((divId) => divisionSet.has(divId.toString()))
      );
      if (invalidDept) {
        return { error: 'Selected departments must belong to the selected divisions' };
      }
    }
  }
  return { ok: true };
}

function serializeUser(user) {
  return {
    _id: user._id,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    isSuperAdmin: user.isSuperAdmin,
    isActive: user.isActive,
    divisionIds: user.divisionIds,
    departmentIds: user.departmentIds,
    systemRoleId: user.systemRoleId,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

router.get(
  '/',
  requirePermission('system_users', 'read'),
  asyncHandler(async (req, res) => {
    const users = await SystemUser.find()
      .populate('systemRoleId', 'name slug isActive')
      .populate('divisionIds', 'name slug')
      .populate('departmentIds', 'name slug')
      .sort({ createdAt: -1 });
    res.json(users.map(serializeUser));
  })
);

router.get(
  '/:id',
  requirePermission('system_users', 'read'),
  asyncHandler(async (req, res) => {
    const user = await SystemUser.findById(req.params.id)
      .populate('systemRoleId', 'name slug isActive permissions')
      .populate('divisionIds', 'name slug')
      .populate('departmentIds', 'name slug');
    if (!user) return res.status(404).json({ error: 'System user not found' });
    res.json(serializeUser(user));
  })
);

router.post(
  '/',
  requirePermission('system_users', 'write'),
  asyncHandler(async (req, res) => {
    const { username, password, displayName, email, systemRoleId } = req.body;

    if (!username?.trim()) return res.status(400).json({ error: 'Username is required' });
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    if (!displayName?.trim()) return res.status(400).json({ error: 'Display name is required' });
    if (!systemRoleId) return res.status(400).json({ error: 'System role is required' });

    const role = await SystemRole.findById(systemRoleId);
    if (!role || !role.isActive) {
      return res.status(400).json({ error: 'Valid active system role is required' });
    }

    const divisionIds = normalizeIdList(req.body.divisionIds);
    const departmentIds = normalizeIdList(req.body.departmentIds);
    const scopeCheck = await validateAccessScope(divisionIds, departmentIds);
    if (scopeCheck.error) return res.status(400).json({ error: scopeCheck.error });

    const existing = await SystemUser.findOne({ username: username.toLowerCase().trim() });
    if (existing) return res.status(409).json({ error: 'Username already exists' });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await SystemUser.create({
      username: username.toLowerCase().trim(),
      passwordHash,
      displayName: displayName.trim(),
      email: email?.trim() || '',
      systemRoleId,
      isSuperAdmin: false,
      divisionIds,
      departmentIds,
    });

    const populated = await SystemUser.findById(user._id)
      .populate('systemRoleId', 'name slug')
      .populate('divisionIds', 'name slug')
      .populate('departmentIds', 'name slug');

    res.status(201).json(serializeUser(populated));
  })
);

router.put(
  '/:id',
  requirePermission('system_users', 'write'),
  asyncHandler(async (req, res) => {
    const user = await SystemUser.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'System user not found' });
    if (user.isSuperAdmin) {
      return res.status(400).json({ error: 'Super admin account cannot be modified here' });
    }

    const updates = {};
    if (req.body.displayName !== undefined) updates.displayName = req.body.displayName.trim();
    if (req.body.email !== undefined) updates.email = req.body.email.trim();
    if (req.body.isActive !== undefined) updates.isActive = req.body.isActive;

    if (req.body.systemRoleId !== undefined) {
      const role = await SystemRole.findById(req.body.systemRoleId);
      if (!role || !role.isActive) {
        return res.status(400).json({ error: 'Valid active system role is required' });
      }
      updates.systemRoleId = req.body.systemRoleId;
    }

    if (req.body.divisionIds !== undefined || req.body.departmentIds !== undefined) {
      const divisionIds = normalizeIdList(
        req.body.divisionIds !== undefined ? req.body.divisionIds : user.divisionIds
      );
      const departmentIds = normalizeIdList(
        req.body.departmentIds !== undefined ? req.body.departmentIds : user.departmentIds
      );
      const scopeCheck = await validateAccessScope(divisionIds, departmentIds);
      if (scopeCheck.error) return res.status(400).json({ error: scopeCheck.error });
      updates.divisionIds = divisionIds;
      updates.departmentIds = departmentIds;
    }

    if (req.body.password) {
      if (req.body.password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }
      updates.passwordHash = await bcrypt.hash(req.body.password, 12);
    }

    const updated = await SystemUser.findByIdAndUpdate(user._id, updates, {
      new: true,
      runValidators: true,
    })
      .populate('systemRoleId', 'name slug')
      .populate('divisionIds', 'name slug')
      .populate('departmentIds', 'name slug');

    res.json(serializeUser(updated));
  })
);

router.delete(
  '/:id',
  requirePermission('system_users', 'write'),
  asyncHandler(async (req, res) => {
    const user = await SystemUser.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'System user not found' });
    if (user.isSuperAdmin) {
      return res.status(400).json({ error: 'Super admin account cannot be deleted' });
    }
    await user.deleteOne();
    res.json({ message: 'System user deleted' });
  })
);

export default router;
