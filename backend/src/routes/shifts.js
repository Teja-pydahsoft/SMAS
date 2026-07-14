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

function timeToMinutes(value) {
  if (!value || typeof value !== 'string') return null;
  const parts = value.trim().split(':');
  if (parts.length < 2) return null;
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function getShiftDurationHours(startTime, endTime) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (start === null || end === null) return null;

  let durationMinutes = end - start;
  if (durationMinutes <= 0) durationMinutes += 24 * 60;
  return Math.round((durationMinutes / 60) * 100) / 100;
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

function normalizeShiftTiming(body, existing = {}) {
  const startTime =
    body.startTime !== undefined ? String(body.startTime || '').trim() : existing.startTime;
  const endTime =
    body.endTime !== undefined ? String(body.endTime || '').trim() : existing.endTime;
  const halfDayMinHours =
    body.halfDayMinHours !== undefined
      ? parseOptionalHours(body.halfDayMinHours)
      : existing.halfDayMinHours;
  const fullDayMinHours =
    body.fullDayMinHours !== undefined
      ? parseOptionalHours(body.fullDayMinHours)
      : existing.fullDayMinHours;

  if (body.halfDayMinHours !== undefined && halfDayMinHours === undefined) {
    return { error: 'Half day minimum hours must be a non-negative number' };
  }
  if (body.fullDayMinHours !== undefined && fullDayMinHours === undefined) {
    return { error: 'Full day minimum hours must be a non-negative number' };
  }

  if (startTime && endTime) {
    const totalHours = getShiftDurationHours(startTime, endTime);
    if (totalHours === null) {
      return { error: 'Enter valid shift start and end times' };
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
  }

  return {
    startTime: body.startTime !== undefined ? startTime : undefined,
    endTime: body.endTime !== undefined ? endTime : undefined,
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

    const timing = normalizeShiftTiming(req.body);
    if (timing.error) return res.status(400).json({ error: timing.error });

    const slug = req.body.slug || slugify(name);
    const shift = await Shift.create({
      name,
      slug,
      description,
      startTime: timing.startTime ?? '',
      endTime: timing.endTime ?? '',
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
    if (timing.startTime !== undefined) update.startTime = timing.startTime;
    if (timing.endTime !== undefined) update.endTime = timing.endTime;
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
