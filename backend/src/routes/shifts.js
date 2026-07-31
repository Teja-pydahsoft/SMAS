import { Router } from 'express';
import Shift from '../models/Shift.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { getShiftDurationHours } from '../utils/shiftAttendance.js';

const router = Router();

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function formatDurationHours(hours) {
  if (hours === null || hours === undefined) return '';
  const rounded = Math.round(hours * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function parseOptionalHours(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (Number.isNaN(n) || n < 0) return undefined; // signal invalid
  return n;
}

function parseRequiredTotalHours(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  if (Number.isNaN(n) || n <= 0) return undefined;
  return Math.round(n * 100) / 100;
}

/**
 * Backfill totalHours from legacy start/end when missing.
 */
async function ensureTotalHours(shiftDoc) {
  if (!shiftDoc) return shiftDoc;
  const existing = Number(shiftDoc.totalHours);
  if (Number.isFinite(existing) && existing > 0) return shiftDoc;

  const derived = getShiftDurationHours(shiftDoc);
  if (derived == null || derived <= 0) return shiftDoc;

  shiftDoc.totalHours = derived;
  try {
    await Shift.updateOne({ _id: shiftDoc._id }, { $set: { totalHours: derived } });
  } catch {
    // non-fatal — still return enriched doc
  }
  return shiftDoc;
}

function normalizeShiftTiming(body, existing = {}) {
  const totalHours =
    body.totalHours !== undefined
      ? parseRequiredTotalHours(body.totalHours)
      : existing.totalHours != null
        ? Number(existing.totalHours)
        : getShiftDurationHours(existing);

  const halfDayMinHours =
    body.halfDayMinHours !== undefined
      ? parseOptionalHours(body.halfDayMinHours)
      : existing.halfDayMinHours;
  const fullDayMinHours =
    body.fullDayMinHours !== undefined
      ? parseOptionalHours(body.fullDayMinHours)
      : existing.fullDayMinHours;

  if (body.totalHours !== undefined && totalHours === undefined) {
    return { error: 'Total hours must be a positive number' };
  }
  if (body.halfDayMinHours !== undefined && halfDayMinHours === undefined) {
    return { error: 'Half day minimum hours must be a non-negative number' };
  }
  if (body.fullDayMinHours !== undefined && fullDayMinHours === undefined) {
    return { error: 'Full day minimum hours must be a non-negative number' };
  }

  if (totalHours == null || !Number.isFinite(totalHours) || totalHours <= 0) {
    return { error: 'Total hours is required' };
  }

  if (halfDayMinHours != null && halfDayMinHours > totalHours) {
    return {
      error: `Half day minimum hours (${halfDayMinHours}) cannot exceed shift total hours (${formatDurationHours(totalHours)})`,
    };
  }
  if (fullDayMinHours != null && fullDayMinHours > totalHours) {
    return {
      error: `Full day minimum hours (${fullDayMinHours}) cannot exceed shift total hours (${formatDurationHours(totalHours)})`,
    };
  }
  if (halfDayMinHours != null && fullDayMinHours != null && halfDayMinHours > fullDayMinHours) {
    return { error: 'Half day minimum hours cannot exceed full day minimum hours' };
  }

  return {
    totalHours: body.totalHours !== undefined ? totalHours : undefined,
    halfDayMinHours: body.halfDayMinHours !== undefined ? halfDayMinHours : undefined,
    fullDayMinHours: body.fullDayMinHours !== undefined ? fullDayMinHours : undefined,
  };
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.isActive !== undefined) {
      filter.isActive = req.query.isActive === 'true';
    }
    const shifts = await Shift.find(filter).sort({ createdAt: -1 });
    await Promise.all(shifts.map((s) => ensureTotalHours(s)));
    res.json(shifts);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const shift = await Shift.findById(req.params.id);
    if (!shift) return res.status(404).json({ error: 'Shift not found' });
    await ensureTotalHours(shift);
    res.json(shift);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, description, metadata } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const timing = normalizeShiftTiming(req.body);
    if (timing.error) return res.status(400).json({ error: timing.error });

    const slug = req.body.slug || slugify(name);
    const shift = await Shift.create({
      name,
      slug,
      description,
      totalHours: timing.totalHours,
      startTime: '',
      endTime: '',
      halfDayMinHours: timing.halfDayMinHours ?? null,
      fullDayMinHours: timing.fullDayMinHours ?? null,
      metadata,
    });
    res.status(201).json(shift);
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const existing = await Shift.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Shift not found' });
    await ensureTotalHours(existing);

    const { name, description, isActive, metadata } = req.body;
    const update = {};
    if (name !== undefined) {
      update.name = name;
      update.slug = req.body.slug || slugify(name);
    }
    if (description !== undefined) update.description = description;
    if (isActive !== undefined) update.isActive = isActive;
    if (metadata !== undefined) update.metadata = metadata;

    const timing = normalizeShiftTiming(req.body, existing);
    if (timing.error) return res.status(400).json({ error: timing.error });
    if (timing.totalHours !== undefined) {
      update.totalHours = timing.totalHours;
      update.startTime = '';
      update.endTime = '';
    }
    if (timing.halfDayMinHours !== undefined) update.halfDayMinHours = timing.halfDayMinHours;
    if (timing.fullDayMinHours !== undefined) update.fullDayMinHours = timing.fullDayMinHours;

    const shift = await Shift.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    });
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
