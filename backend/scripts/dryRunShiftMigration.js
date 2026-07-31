/**
 * Read-only dry run: shift hours migration readiness against existing data.
 * Writes nothing.
 */
import mongoose from 'mongoose';
import 'dotenv/config';

function durationFromStartEnd(startTime, endTime) {
  if (!startTime || !endTime) return null;
  const [sh, sm] = String(startTime).split(':').map(Number);
  const [eh, em] = String(endTime).split(':').map(Number);
  if (![sh, sm, eh, em].every(Number.isFinite)) return null;
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60;
  return Math.round((mins / 60) * 100) / 100;
}

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('No MONGODB_URI');
  process.exit(1);
}

await mongoose.connect(uri);
const db = mongoose.connection.db;

try {
  const roles = await db
    .collection('roles')
    .find({}, { projection: { name: 1, isShiftBased: 1, isActive: 1 } })
    .toArray();
  const shiftBasedRoles = roles.filter((r) => r.isShiftBased);
  const shiftBasedRoleIds = shiftBasedRoles.map((r) => r._id);
  const roleName = Object.fromEntries(roles.map((r) => [String(r._id), r.name]));

  const shifts = await db.collection('shifts').find({}).toArray();
  const shiftsNeedingBackfill = shifts.filter((s) => {
    const t = Number(s.totalHours);
    return !(Number.isFinite(t) && t > 0);
  });
  const activeShifts = shifts.filter((s) => s.isActive !== false);

  const verifiedShiftBased = await db.collection('registrations').countDocuments({
    status: 'verified',
    roleId: { $in: shiftBasedRoleIds },
  });
  const withShift = await db.collection('registrations').countDocuments({
    status: 'verified',
    roleId: { $in: shiftBasedRoleIds },
    shiftId: { $exists: true, $ne: null },
  });
  const withoutShift = await db.collection('registrations').countDocuments({
    status: 'verified',
    roleId: { $in: shiftBasedRoleIds },
    $or: [{ shiftId: { $exists: false } }, { shiftId: null }],
  });

  const openPasses = await db.collection('passes').countDocuments({
    passType: 'day_pass',
    isActive: true,
    'qrPayload.divisionInside': true,
  });

  const openShiftBasedAgg = await db
    .collection('passes')
    .aggregate([
      {
        $match: {
          passType: 'day_pass',
          isActive: true,
          'qrPayload.divisionInside': true,
        },
      },
      {
        $lookup: {
          from: 'registrations',
          localField: 'registrationId',
          foreignField: '_id',
          as: 'reg',
        },
      },
      { $unwind: '$reg' },
      { $match: { 'reg.roleId': { $in: shiftBasedRoleIds } } },
      { $count: 'n' },
    ])
    .toArray();

  const openWithOldClock = await db.collection('passes').countDocuments({
    passType: 'day_pass',
    isActive: true,
    'qrPayload.divisionInside': true,
    'qrPayload.shiftEndTime': { $exists: true, $nin: [null, ''] },
    $or: [{ 'qrPayload.totalHours': { $exists: false } }, { 'qrPayload.totalHours': null }],
  });

  const openWithTotalHours = await db.collection('passes').countDocuments({
    passType: 'day_pass',
    isActive: true,
    'qrPayload.divisionInside': true,
    'qrPayload.totalHours': { $gt: 0 },
  });

  const dayPassesWithShiftIdNoTotal = await db.collection('passes').countDocuments({
    passType: 'day_pass',
    'qrPayload.shiftId': { $exists: true, $ne: null },
    $or: [{ 'qrPayload.totalHours': { $exists: false } }, { 'qrPayload.totalHours': null }],
  });

  const dayPassesWithTotal = await db.collection('passes').countDocuments({
    passType: 'day_pass',
    'qrPayload.totalHours': { $gt: 0 },
  });

  const byRole = await db
    .collection('registrations')
    .aggregate([
      { $match: { status: 'verified', roleId: { $in: shiftBasedRoleIds } } },
      {
        $group: {
          _id: '$roleId',
          total: { $sum: 1 },
          withShift: {
            $sum: {
              $cond: [
                {
                  $and: [{ $ne: ['$shiftId', null] }, { $ifNull: ['$shiftId', false] }],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ])
    .toArray();

  const missingSample = await db
    .collection('registrations')
    .find(
      {
        status: 'verified',
        roleId: { $in: shiftBasedRoleIds },
        $or: [{ shiftId: { $exists: false } }, { shiftId: null }],
      },
      { projection: { registrationCode: 1, roleId: 1, createdAt: 1 } }
    )
    .sort({ createdAt: -1 })
    .limit(20)
    .toArray();

  const openSample = await db
    .collection('passes')
    .find(
      {
        passType: 'day_pass',
        isActive: true,
        'qrPayload.divisionInside': true,
      },
      {
        projection: {
          holderName: 1,
          registrationCode: 1,
          roleName: 1,
          validDate: 1,
          'qrPayload.shiftId': 1,
          'qrPayload.shiftName': 1,
          'qrPayload.totalHours': 1,
          'qrPayload.shiftStartTime': 1,
          'qrPayload.shiftEndTime': 1,
          'qrPayload.gateEntryAt': 1,
        },
      }
    )
    .limit(20)
    .toArray();

  const report = {
    dryRun: true,
    wroteNothing: true,
    db: db.databaseName,
    shifts: {
      total: shifts.length,
      active: activeShifts.length,
      needingTotalHoursBackfill: shiftsNeedingBackfill.length,
      list: shifts.map((s) => {
        const hasTotal = Number.isFinite(Number(s.totalHours)) && Number(s.totalHours) > 0;
        return {
          name: s.name,
          isActive: s.isActive !== false,
          totalHours: s.totalHours ?? null,
          half: s.halfDayMinHours ?? null,
          full: s.fullDayMinHours ?? null,
          legacyStart: s.startTime || null,
          legacyEnd: s.endTime || null,
          wouldBackfillTo: !hasTotal ? durationFromStartEnd(s.startTime, s.endTime) : null,
        };
      }),
    },
    roles: {
      shiftBasedCount: shiftBasedRoles.length,
      shiftBased: shiftBasedRoles.map((r) => ({
        name: r.name,
        active: r.isActive !== false,
      })),
    },
    verifiedShiftBasedEmployees: {
      total: verifiedShiftBased,
      alreadyHaveShiftId: withShift,
      missingShiftId: withoutShift,
      byRole: byRole.map((r) => ({
        role: roleName[String(r._id)] || String(r._id),
        total: r.total,
        withShift: r.withShift,
        missing: r.total - r.withShift,
      })),
    },
    openSessionsNow: {
      allOpenDayPasses: openPasses,
      openOnShiftBasedRoles: openShiftBasedAgg[0]?.n || 0,
      openWithLegacyClockOnly: openWithOldClock,
      openAlreadyHaveTotalHours: openWithTotalHours,
    },
    historicalDayPasses: {
      withShiftIdButNoTotalHours: dayPassesWithShiftIdNoTotal,
      alreadyHaveTotalHours: dayPassesWithTotal,
    },
    recommendedSequence: [
      '1) Ensure each Shift has totalHours (list API backfills on read; or set in UI)',
      '2) Checkout all currently open shift-based sessions',
      '3) Edit each registration missing shiftId and assign a shift',
      '4) Next gate entry creates day pass with new totalHours snapshot',
      '5) Optional: run attendance recalculate for passes that already have shiftId',
    ],
    missingShiftSample: missingSample.map((r) => ({
      code: r.registrationCode || null,
      role: roleName[String(r.roleId)] || null,
      createdAt: r.createdAt,
    })),
    openSessionSample: openSample.map((p) => ({
      name: p.holderName,
      code: p.registrationCode,
      role: p.roleName,
      validDate: p.validDate,
      shiftName: p.qrPayload?.shiftName || null,
      totalHours: p.qrPayload?.totalHours ?? null,
      legacyWindow:
        p.qrPayload?.shiftStartTime || p.qrPayload?.shiftEndTime
          ? `${p.qrPayload?.shiftStartTime || '?'}–${p.qrPayload?.shiftEndTime || '?'}`
          : null,
      entryAt: p.qrPayload?.gateEntryAt || null,
    })),
  };

  console.log(JSON.stringify(report, null, 2));
} finally {
  await mongoose.disconnect();
}
