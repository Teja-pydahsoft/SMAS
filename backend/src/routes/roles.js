import { Router } from 'express';
import Role from '../models/Role.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { PAY_FREQUENCIES } from '../constants/index.js';

const router = Router();

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizePayFrequencies(input) {
  if (!Array.isArray(input)) return undefined;
  return [...new Set(input.filter((value) => PAY_FREQUENCIES.includes(value)))];
}

function normalizeCustomPayDaysOptions(input) {
  if (!Array.isArray(input)) return undefined;
  const parsed = input
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 1);
  return [...new Set(parsed)].sort((a, b) => a - b);
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
    const { name, description, isShiftBased, payFrequencies, customPayDaysOptions, metadata } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const slug = req.body.slug || slugify(name);
    const normalizedPayFrequencies = normalizePayFrequencies(payFrequencies) ?? [];
    const normalizedCustomDays = normalizedPayFrequencies.includes('custom_days')
      ? normalizeCustomPayDaysOptions(customPayDaysOptions) ?? []
      : [];
    const role = await Role.create({
      name,
      slug,
      description,
      isShiftBased: Boolean(isShiftBased),
      payFrequencies: normalizedPayFrequencies,
      customPayDaysOptions: normalizedCustomDays,
      metadata,
    });
    res.status(201).json(role);
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { name, description, isActive, isShiftBased, payFrequencies, customPayDaysOptions, metadata } =
      req.body;
    const update = { name, description, isActive, isShiftBased, metadata };
    const normalizedPayFrequencies = normalizePayFrequencies(payFrequencies);
    if (normalizedPayFrequencies !== undefined) {
      update.payFrequencies = normalizedPayFrequencies;
      update.customPayDaysOptions = normalizedPayFrequencies.includes('custom_days')
        ? normalizeCustomPayDaysOptions(customPayDaysOptions) ?? []
        : [];
    } else if (customPayDaysOptions !== undefined) {
      update.customPayDaysOptions = normalizeCustomPayDaysOptions(customPayDaysOptions) ?? [];
    }
    const role = await Role.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
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
