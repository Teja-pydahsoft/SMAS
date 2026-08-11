import IdleSession from '../models/IdleSession.js';
import SystemSetting from '../models/SystemSetting.js';
import { logIdleAlert } from './equipmentEventService.js';

const IDLE_MONITOR_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes

export async function checkIdleSessions() {
  const settings = await SystemSetting.findOne({ singleton: 'singleton' });
  if (!settings || !settings.idleAlerts || !settings.idleAlerts.enabled) {
    return { checked: 0, alerted: 0 };
  }

  const { thresholds } = settings.idleAlerts;
  if (!thresholds || thresholds.length === 0) {
    return { checked: 0, alerted: 0 };
  }

  const activeThresholds = thresholds.filter(t => t.enabled).sort((a, b) => b.minutes - a.minutes);
  if (activeThresholds.length === 0) {
    return { checked: 0, alerted: 0 };
  }

  const now = new Date();
  
  // Find all active idle sessions
  const activeSessions = await IdleSession.find({ status: 'Active' }).populate('vehicleId');
  let alerted = 0;

  for (const session of activeSessions) {
    if (!session.vehicleId) continue;
    
    const idleMinutes = Math.floor((now.getTime() - session.startTime.getTime()) / 60000);
    
    // Find the highest threshold crossed
    const crossedThreshold = activeThresholds.find(t => idleMinutes >= t.minutes);
    if (!crossedThreshold) continue;

    // Check if we already notified for this exact threshold in this session
    if (!session.notifiedAlerts.includes(crossedThreshold.key)) {
      session.notifiedAlerts.push(crossedThreshold.key);
      await session.save();

      await logIdleAlert(session, crossedThreshold, idleMinutes);

      // Optionally, here we would push websocket notifications or push notifications
      // if settings.idleAlerts.dashboardNotifications is true.
      
      alerted++;
    }
  }

  return { checked: activeSessions.length, alerted };
}

let timer = null;

export function startIdleMonitor() {
  if (timer) return;

  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const { checked, alerted } = await checkIdleSessions();
      if (alerted > 0) {
        console.log(`Idle monitor: triggered ${alerted} alert(s) (${checked} active idle sessions checked)`);
      }
    } catch (err) {
      console.warn('Idle monitor run failed:', err.message);
    } finally {
      running = false;
    }
  };

  timer = setInterval(run, IDLE_MONITOR_INTERVAL_MS);
  timer.unref?.();
  // First sweep shortly after boot
  setTimeout(run, 10_000).unref?.();
  console.log('Idle monitor started (checks every 5 minutes)');
}
