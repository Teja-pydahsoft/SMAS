/**
 * Sample migration + running check (writes only to sample users + shift totalHours backfill).
 *
 * 1) Backfill Shift.totalHours from legacy start/end
 * 2) Pick sample verified Labour users (prefer not currently inside)
 * 3) Assign different shifts to them
 * 4) Simulate day-pass snapshot + attendance status for each
 * 5) Print pass/fail report
 */
import mongoose from 'mongoose';
import 'dotenv/config';
import Shift from '../src/models/Shift.js';
import Registration from '../src/models/Registration.js';
import Role from '../src/models/Role.js';
import Pass from '../src/models/Pass.js';
import {
  getShiftDurationHours,
  resolveShiftDayStatus,
  computeActivityWindow,
} from '../src/utils/shiftAttendance.js';
import { resolveDayPassValidUntil } from '../src/utils/istTime.js';

const SAMPLE_SIZE = 6;

function durationFromStartEnd(startTime, endTime) {
  return getShiftDurationHours({ startTime, endTime });
}

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

const results = {
  shiftBackfill: [],
  assignments: [],
  checks: [],
  failures: [],
};

try {
  // ── 1) Backfill totalHours on all shifts ─────────────────────────────────
  const shifts = await Shift.find({}).sort({ name: 1 });
  for (const shift of shifts) {
    const existing = Number(shift.totalHours);
    if (Number.isFinite(existing) && existing > 0) {
      results.shiftBackfill.push({ name: shift.name, action: 'keep', totalHours: existing });
      continue;
    }
    const derived = durationFromStartEnd(shift.startTime, shift.endTime);
    if (derived == null) {
      results.failures.push(`Shift "${shift.name}" has no totalHours and no start/end`);
      continue;
    }
    shift.totalHours = derived;
    await shift.save();
    results.shiftBackfill.push({ name: shift.name, action: 'backfilled', totalHours: derived });
  }

  const activeShifts = await Shift.find({ isActive: true }).sort({ name: 1 });
  if (activeShifts.length < 2) {
    throw new Error('Need at least 2 active shifts for a varied sample');
  }

  // ── 2) Pick sample users (prefer not currently inside) ───────────────────
  const labour = await Role.findOne({ name: /labour/i, isShiftBased: true });
  if (!labour) throw new Error('No Labour shift-based role found');

  const openRegIds = await Pass.distinct('registrationId', {
    passType: 'day_pass',
    isActive: true,
    'qrPayload.divisionInside': true,
  });
  const openSet = new Set(openRegIds.map(String));

  const candidates = await Registration.find({
    status: 'verified',
    roleId: labour._id,
    $or: [{ shiftId: { $exists: false } }, { shiftId: null }],
  })
    .select('registrationCode formData shiftId roleId createdAt')
    .sort({ createdAt: -1 })
    .limit(80)
    .lean();

  const notOpen = candidates.filter((r) => !openSet.has(String(r._id)));
  const samplePool = (notOpen.length >= SAMPLE_SIZE ? notOpen : candidates).slice(0, SAMPLE_SIZE);

  if (samplePool.length === 0) throw new Error('No sample registrations found');

  // If we had to use open users, close their sessions first (sample only)
  for (const reg of samplePool) {
    if (!openSet.has(String(reg._id))) continue;
    const closed = await Pass.updateMany(
      {
        registrationId: reg._id,
        passType: 'day_pass',
        isActive: true,
        'qrPayload.divisionInside': true,
      },
      {
        $set: {
          'qrPayload.divisionInside': false,
          'qrPayload.gateExitAt': new Date().toISOString(),
          'qrPayload.updatedAt': new Date().toISOString(),
        },
      }
    );
    results.assignments.push({
      code: reg.registrationCode,
      note: `closed ${closed.modifiedCount} open session(s) before assign`,
    });
  }

  // ── 3) Assign different shifts round-robin ───────────────────────────────
  const assigned = [];
  for (let i = 0; i < samplePool.length; i += 1) {
    const reg = samplePool[i];
    const shift = activeShifts[i % activeShifts.length];
    await Registration.updateOne({ _id: reg._id }, { $set: { shiftId: shift._id } });
    const row = {
      registrationId: String(reg._id),
      code: reg.registrationCode,
      shiftName: shift.name,
      totalHours: shift.totalHours,
      half: shift.halfDayMinHours,
      full: shift.fullDayMinHours,
    };
    assigned.push({ ...row, shift });
    results.assignments.push(row);
  }

  // ── 4) Running checks ────────────────────────────────────────────────────
  for (const item of assigned) {
    const reg = await Registration.findById(item.registrationId)
      .populate('shiftId')
      .populate('roleId', 'name isShiftBased')
      .lean();

    const shift = reg.shiftId;
    const check = {
      code: item.code,
      shiftName: shift?.name || null,
      steps: {},
    };

    // A) Registration has shift
    check.steps.hasShiftId = Boolean(reg.shiftId?._id || reg.shiftId);
    if (!check.steps.hasShiftId) results.failures.push(`${item.code}: missing shiftId after assign`);

    // B) totalHours resolvable
    const totalHours = getShiftDurationHours(shift);
    check.steps.totalHours = totalHours;
    if (!(totalHours > 0)) {
      results.failures.push(`${item.code}: totalHours unresolved for ${shift?.name}`);
    }

    // C) Day-pass snapshot shape (what createOrRefreshDayPass would write)
    const snapshot = {
      shiftId: String(shift._id),
      shiftName: shift.name,
      totalHours,
      halfDayMinHours: shift.halfDayMinHours ?? null,
      fullDayMinHours: shift.fullDayMinHours ?? null,
    };
    check.steps.passSnapshot = snapshot;
    check.steps.snapshotOk =
      snapshot.shiftId &&
      snapshot.shiftName &&
      Number(snapshot.totalHours) > 0;

    // D) Session end = entry + totalHours + grace
    const entryAt = new Date();
    const validUntil = resolveDayPassValidUntil({
      entryAt,
      totalHours,
    });
    const expectedMs = totalHours * 60 * 60 * 1000 + 4 * 60 * 60 * 1000;
    const delta = Math.abs(validUntil.getTime() - entryAt.getTime() - expectedMs);
    check.steps.validUntilOk = delta < 2000;
    check.steps.validUntilIso = validUntil.toISOString();
    if (!check.steps.validUntilOk) {
      results.failures.push(`${item.code}: validUntil mismatch (delta ${delta}ms)`);
    }

    // E) Attendance statuses for synthetic segment hours
    // Simulate: 3h work + 1h break + 4h work = 7h on-site (not 8h span)
    const day = '2026-07-31';
    const logs = [
      { eventType: 'entry', scanType: 'gate', createdAt: new Date(`${day}T03:30:00.000Z`) },
      { eventType: 'exit', scanType: 'gate', createdAt: new Date(`${day}T06:30:00.000Z`) }, // 3h
      { eventType: 'entry', scanType: 'gate', createdAt: new Date(`${day}T07:30:00.000Z`) },
      { eventType: 'exit', scanType: 'gate', createdAt: new Date(`${day}T11:30:00.000Z`) }, // 4h
    ];
    const window = computeActivityWindow(logs, null, day, { today: day, now: new Date(`${day}T12:00:00.000Z`) });
    check.steps.segmentHours = window.hours;
    check.steps.segmentHoursOk = window.hours === 7;
    if (!check.steps.segmentHoursOk) {
      results.failures.push(`${item.code}: expected 7h segment sum, got ${window.hours}`);
    }

    const statusFull = resolveShiftDayStatus(totalHours, shift);
    const statusHalf = resolveShiftDayStatus(
      Number(shift.halfDayMinHours) || totalHours / 2,
      shift
    );
    const statusPartial = resolveShiftDayStatus(1.5, shift);
    check.steps.statusAtFull = statusFull?.code;
    check.steps.statusAtHalf = statusHalf?.code;
    check.steps.statusAtPartial = statusPartial?.code;
    check.steps.statusOk =
      statusFull?.code === 'P' &&
      (statusHalf?.code === 'HD' || statusHalf?.code === 'P') &&
      (statusPartial?.code === 'PT' || statusPartial?.code === 'A');

    if (!check.steps.statusOk) {
      results.failures.push(
        `${item.code}: status map unexpected P=${statusFull?.code} half=${statusHalf?.code} pt=${statusPartial?.code}`
      );
    }

    // F) Re-read from DB and confirm assignment sticks
    const again = await Registration.findById(item.registrationId).select('shiftId').lean();
    check.steps.persisted =
      String(again.shiftId) === String(shift._id);

    check.ok =
      check.steps.hasShiftId &&
      check.steps.snapshotOk &&
      check.steps.validUntilOk &&
      check.steps.segmentHoursOk &&
      check.steps.statusOk &&
      check.steps.persisted;

    results.checks.push(check);
  }

  const passed = results.checks.filter((c) => c.ok).length;
  const failed = results.checks.length - passed;

  console.log(
    JSON.stringify(
      {
        summary: {
          shiftsBackfilled: results.shiftBackfill.filter((s) => s.action === 'backfilled').length,
          shiftsKept: results.shiftBackfill.filter((s) => s.action === 'keep').length,
          usersAssigned: results.assignments.filter((a) => a.shiftName).length,
          checksPassed: passed,
          checksFailed: failed,
          failureCount: results.failures.length,
        },
        shiftBackfill: results.shiftBackfill,
        assignments: results.assignments.filter((a) => a.shiftName),
        checks: results.checks,
        failures: results.failures,
      },
      null,
      2
    )
  );

  if (failed > 0 || results.failures.length > 0) process.exitCode = 1;
} catch (err) {
  console.error('RUNNING_CHECK_FAILED', err);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
