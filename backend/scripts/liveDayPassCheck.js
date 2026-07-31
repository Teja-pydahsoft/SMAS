/**
 * Live integration check: createOrRefreshDayPass for one sample assigned user.
 * Creates a real day pass then deactivates it (cleanup) so gate state stays clean.
 */
import mongoose from 'mongoose';
import 'dotenv/config';
import Registration from '../src/models/Registration.js';
import Division from '../src/models/Division.js';
import Pass from '../src/models/Pass.js';
import { loadRegistrationContext } from '../src/services/passService.js';
import { createOrRefreshDayPass, getPassSessionState } from '../src/services/attendanceService.js';

const SAMPLE_CODES = ['WM0256', 'WM0255', 'WM0254', 'WM0253', 'WM0252', 'WM0247'];

await mongoose.connect(process.env.MONGODB_URI);

try {
  const division = await Division.findOne({ isActive: { $ne: false } }).lean();
  if (!division) throw new Error('No division found');

  const regs = await Registration.find({
    registrationCode: { $in: SAMPLE_CODES },
    shiftId: { $ne: null },
  })
    .select('_id registrationCode shiftId')
    .lean();

  if (!regs.length) throw new Error('No sample assigned registrations found');

  const report = [];

  for (const reg of regs) {
    // Ensure no open session blocks refresh
    await Pass.updateMany(
      {
        registrationId: reg._id,
        divisionId: division._id,
        passType: 'day_pass',
        isActive: true,
        'qrPayload.divisionInside': true,
      },
      {
        $set: {
          'qrPayload.divisionInside': false,
          'qrPayload.gateExitAt': new Date().toISOString(),
        },
      }
    );

    const { registration, role, display } = await loadRegistrationContext(reg._id);
    const pass = await createOrRefreshDayPass({
      registration,
      role,
      display,
      gateLogId: null,
      divisionId: division._id,
      divisionName: division.name || '',
    });

    const payload = pass.qrPayload || {};
    const state = getPassSessionState(pass);
    const ok =
      Boolean(payload.shiftId) &&
      Boolean(payload.shiftName) &&
      Number(payload.totalHours) > 0 &&
      state.divisionInside === true;

    report.push({
      code: reg.registrationCode,
      ok,
      passCode: pass.passCode,
      shiftName: payload.shiftName || null,
      totalHours: payload.totalHours ?? null,
      half: payload.halfDayMinHours ?? null,
      full: payload.fullDayMinHours ?? null,
      validUntil: pass.validUntil || payload.validUntil || null,
      division: division.name,
    });

    // Cleanup: close + deactivate the test day pass so we don't leave people "inside"
    await Pass.updateOne(
      { _id: pass._id || pass.id },
      {
        $set: {
          isActive: false,
          'qrPayload.divisionInside': false,
          'qrPayload.gateExitAt': new Date().toISOString(),
          'qrPayload.testCleanup': true,
        },
      }
    );
  }

  const passed = report.filter((r) => r.ok).length;
  console.log(
    JSON.stringify(
      {
        summary: { checked: report.length, passed, failed: report.length - passed },
        report,
      },
      null,
      2
    )
  );
  if (passed !== report.length) process.exitCode = 1;
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
