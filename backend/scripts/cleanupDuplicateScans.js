/**
 * One-shot cleanup: collapse race-duplicate granted gate/department punches
 * and repair day-pass session state (WF0013-style stuck department visits).
 *
 * Usage: node scripts/cleanupDuplicateScans.js
 */
import mongoose from 'mongoose';
import 'dotenv/config';
import GateLog from '../src/models/GateLog.js';
import Pass from '../src/models/Pass.js';
import Registration from '../src/models/Registration.js';
import {
  syncDepartmentVisitsFromLogs,
  getActiveDayPass,
} from '../src/services/attendanceService.js';
import { PASS_TYPES, SCAN_TYPES, GATE_EVENT_TYPES } from '../src/constants/index.js';
import { grantedGateLogFilter } from '../src/utils/gateLogFilters.js';

const WINDOW_MS = 60 * 1000;
const TARGET_CODES = process.argv.slice(2);
const DRY_RUN = process.env.DRY_RUN === '1';

function stationKey(log) {
  const dept = log.departmentId ? String(log.departmentId) : '';
  const gate = log.gateRefId ? String(log.gateRefId) : '';
  return [log.scanType, log.eventType, String(log.divisionId || ''), dept, gate].join('|');
}

function markDenied(log, reason, error) {
  log.accessGranted = false;
  log.metadata = {
    ...(log.metadata || {}),
    denialReason: reason,
    denialError: error,
    cleanedBy: 'cleanupDuplicateScans',
    cleanedAt: new Date().toISOString(),
  };
  log.markModified('metadata');
  return log;
}

/**
 * Keep earliest granted punch per station+direction within WINDOW_MS clusters.
 * Then for department logs, walk chronologically and deny entry-while-open /
 * exit-while-closed leftovers from races.
 */
function selectLogsToDeny(logs) {
  const denyIds = new Set();
  const sorted = [...logs].sort((a, b) => a.createdAt - b.createdAt);

  // Pass 1: near-duplicate same station+direction
  const lastKeptByStation = new Map();
  for (const log of sorted) {
    if (log.accessGranted === false) continue;
    if (log.eventType !== GATE_EVENT_TYPES.ENTRY && log.eventType !== GATE_EVENT_TYPES.EXIT) {
      continue;
    }
    const key = stationKey(log);
    const prev = lastKeptByStation.get(key);
    if (prev && log.createdAt - prev.createdAt <= WINDOW_MS) {
      denyIds.add(String(log._id));
      continue;
    }
    lastKeptByStation.set(key, log);
  }

  // Pass 2: department open/close consistency on remaining granted logs
  const openByDept = new Map();
  for (const log of sorted) {
    if (log.accessGranted === false) continue;
    if (denyIds.has(String(log._id))) continue;
    if (log.scanType !== SCAN_TYPES.DEPARTMENT) continue;

    const deptId = log.departmentId ? String(log.departmentId) : null;
    if (!deptId) continue;

    if (log.eventType === GATE_EVENT_TYPES.ENTRY) {
      if (openByDept.has(deptId)) {
        denyIds.add(String(log._id));
      } else {
        openByDept.set(deptId, log);
      }
    } else if (log.eventType === GATE_EVENT_TYPES.EXIT) {
      if (openByDept.has(deptId)) {
        openByDept.delete(deptId);
      } else {
        // Orphan exit — deny so session rebuild doesn't stay confused
        denyIds.add(String(log._id));
      }
    }
  }

  return denyIds;
}

async function cleanupRegistration(reg) {
  const logs = await GateLog.find({ registrationId: reg._id }).sort({ createdAt: 1 });
  const denyIds = selectLogsToDeny(logs);
  let denied = 0;

  for (const log of logs) {
    if (!denyIds.has(String(log._id))) continue;
    if (log.accessGranted === false) continue;
    markDenied(
      log,
      'duplicate_scan',
      'Duplicate / race punch removed by cleanupDuplicateScans'
    );
    if (!DRY_RUN) await log.save();
    denied += 1;
  }

  // Collapse duplicate active day passes per division — keep newest live one
  const passes = await Pass.find({
    registrationId: reg._id,
    passType: PASS_TYPES.DAY_PASS,
    isActive: true,
  }).sort({ createdAt: -1 });

  const byDivision = new Map();
  let deactivatedPasses = 0;
  for (const pass of passes) {
    const divId = String(pass.divisionId || '');
    if (!byDivision.has(divId)) {
      byDivision.set(divId, pass);
      continue;
    }
    pass.isActive = false;
    pass.qrPayload = {
      ...(pass.qrPayload || {}),
      divisionInside: false,
      currentDepartmentId: null,
      currentDepartmentName: null,
      updatedAt: new Date().toISOString(),
      cleanedBy: 'cleanupDuplicateScans',
    };
    pass.markModified('qrPayload');
    if (!DRY_RUN) await pass.save();
    deactivatedPasses += 1;
  }

  // Rebuild visits on remaining active passes
  let synced = 0;
  for (const pass of byDivision.values()) {
    if (!DRY_RUN) {
      await syncDepartmentVisitsFromLogs(pass, reg._id, pass.divisionId);
      // If any department is still wrongly open after orphan exits were denied,
      // syncDepartmentVisitsFromLogs will clear currentDepartmentId.
      synced += 1;
    }
  }

  return { denied, deactivatedPasses, synced, code: reg.registrationCode };
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  let registrations;
  if (TARGET_CODES.length) {
    registrations = await Registration.find({ registrationCode: { $in: TARGET_CODES } });
  } else {
    // Anyone with 2+ granted same-direction punches within 60s in the last 14 days
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const recent = await GateLog.find(
      grantedGateLogFilter({
        createdAt: { $gte: since },
        eventType: { $in: [GATE_EVENT_TYPES.ENTRY, GATE_EVENT_TYPES.EXIT] },
      })
    )
      .select('registrationId scanType eventType divisionId departmentId gateRefId createdAt')
      .sort({ createdAt: 1 })
      .lean();

    const suspect = new Set();
    const last = new Map();
    for (const log of recent) {
      if (!log.registrationId) continue;
      const key = `${log.registrationId}|${stationKey(log)}`;
      const prev = last.get(key);
      if (prev && new Date(log.createdAt) - new Date(prev) <= WINDOW_MS) {
        suspect.add(String(log.registrationId));
      }
      last.set(key, log.createdAt);
    }
    registrations = await Registration.find({ _id: { $in: [...suspect] } });
  }

  console.log(
    `${DRY_RUN ? '[DRY RUN] ' : ''}Cleaning ${registrations.length} registration(s)...`
  );

  const results = [];
  for (const reg of registrations) {
    const result = await cleanupRegistration(reg);
    results.push(result);
    console.log(
      `  ${result.code || reg._id}: denied=${result.denied} passesOff=${result.deactivatedPasses} synced=${result.synced}`
    );
  }

  // Verify WF0013 if present
  const wf = await Registration.findOne({ registrationCode: 'WF0013' });
  if (wf) {
    const pass = await getActiveDayPass(wf._id, (
      await Pass.findOne({ registrationId: wf._id, passType: PASS_TYPES.DAY_PASS }).sort({ createdAt: -1 })
    )?.divisionId);
    const openVisits = (pass?.qrPayload?.departmentVisits || []).filter((v) => !v.exitAt);
    console.log('\nWF0013 post-clean check:');
    console.log(
      JSON.stringify(
        {
          activePass: Boolean(pass),
          divisionInside: pass?.qrPayload?.divisionInside,
          currentDepartmentId: pass?.qrPayload?.currentDepartmentId || null,
          openVisits: openVisits.length,
          visits: pass?.qrPayload?.departmentVisits || [],
        },
        null,
        2
      )
    );
  }

  console.log('\nDone.', results.reduce((n, r) => n + r.denied, 0), 'logs denied');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
