import Pass from '../models/Pass.js';
import {
  PASS_TYPES,
  OVERSTAY_CHECK_INTERVAL_MS,
  OVERSTAY_RENOTIFY_INTERVAL_MS,
} from '../constants/index.js';
import { resolvePassSessionEnd } from './attendanceService.js';
import { isPushConfigured, notifyDivisionAdmins } from './pushService.js';

/**
 * Find open SHIFT gate sessions whose working window (shift end + 4h grace)
 * has expired and push ONE aggregated alert per division to its admins —
 * a count with a per-shift breakdown, never individual worker names, so a
 * busy gate doesn't flood admins with dozens of notifications.
 *
 * Sessions without an assigned shift are ignored on purpose: only shift
 * workers have a defined working window worth alerting on.
 *
 * Repeats every OVERSTAY_RENOTIFY_INTERVAL_MS until gate exit is marked
 * (divisionInside=false) or the pass is deactivated.
 */
export async function checkOverstayedSessions() {
  const now = new Date();

  const openPasses = await Pass.find({
    passType: PASS_TYPES.DAY_PASS,
    isActive: true,
    'qrPayload.divisionInside': true,
    // Shift sessions only — a shift end time is what defines the working window
    'qrPayload.shiftEndTime': { $exists: true, $nin: [null, ''] },
  });

  // Group the expired sessions per division
  const byDivision = new Map();
  for (const pass of openPasses) {
    const sessionEnd = resolvePassSessionEnd(pass);
    if (!sessionEnd || sessionEnd.getTime() > now.getTime()) continue;

    const key = pass.divisionId?.toString();
    if (!key) continue;
    if (!byDivision.has(key)) byDivision.set(key, []);
    byDivision.get(key).push(pass);
  }

  let notified = 0;
  for (const [divisionKey, passes] of byDivision) {
    // Send only when at least one session hasn't been alerted recently;
    // the notification itself always carries the full current count.
    const due = passes.some((pass) => {
      const lastNotifiedAt = pass.qrPayload?.overstayNotifiedAt
        ? new Date(pass.qrPayload.overstayNotifiedAt).getTime()
        : 0;
      return now.getTime() - lastNotifiedAt >= OVERSTAY_RENOTIFY_INTERVAL_MS;
    });
    if (!due) continue;

    const divisionName = passes[0].qrPayload?.divisionName || 'the division';
    const count = passes.length;

    // Per-shift breakdown, e.g. "Night Shift: 3, Day Shift: 2"
    const shiftCounts = new Map();
    for (const pass of passes) {
      const shiftName = pass.qrPayload?.shiftName || 'Shift';
      shiftCounts.set(shiftName, (shiftCounts.get(shiftName) || 0) + 1);
    }
    const breakdown = [...shiftCounts.entries()]
      .map(([shiftName, shiftCount]) => `${shiftName}: ${shiftCount}`)
      .join(', ');

    const body =
      count === 1
        ? `1 worker is still checked in at ${divisionName} after the shift working window closed (${breakdown}). Please check them out at the gate.`
        : `${count} workers are still checked in at ${divisionName} after their shift working windows closed (${breakdown}). Please check them out at the gate.`;

    const result = await notifyDivisionAdmins(passes[0].divisionId, {
      title:
        count === 1
          ? 'Worker still inside after shift close'
          : `${count} workers still inside after shift close`,
      body,
      // Division-level tag: the browser replaces the previous overstay
      // notification for this division instead of stacking new ones.
      tag: `overstay-division-${divisionKey}`,
      url: '/entry-exit',
    });

    // Mark every counted session as notified so the next sweep stays quiet
    // until the renotify interval passes (or the group changes).
    for (const pass of passes) {
      pass.qrPayload = { ...(pass.qrPayload || {}), overstayNotifiedAt: now.toISOString() };
      pass.markModified('qrPayload');
      await pass.save();
    }

    if (result.sent > 0) notified += 1;
  }

  return { checked: openPasses.length, notified };
}

let timer = null;

export function startOverstayMonitor() {
  if (timer) return;
  if (!isPushConfigured()) {
    console.warn('Overstay monitor not started — web push is not configured');
    return;
  }

  let running = false;
  const run = async () => {
    if (running) return; // never stack sweeps if push sends are slow
    running = true;
    try {
      const { checked, notified } = await checkOverstayedSessions();
      if (notified > 0) {
        console.log(`Overstay monitor: sent ${notified} division alert(s) (${checked} open shift sessions checked)`);
      }
    } catch (err) {
      console.warn('Overstay monitor run failed:', err.message);
    } finally {
      running = false;
    }
  };

  timer = setInterval(run, OVERSTAY_CHECK_INTERVAL_MS);
  timer.unref?.();
  // First sweep shortly after boot so restarts don't delay alerts
  setTimeout(run, 15_000).unref?.();
  console.log('Overstay monitor started (checks every 5 minutes)');
}
