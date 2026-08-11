import express from 'express';
import asyncHandler from 'express-async-handler';
import IdleSession from '../models/IdleSession.js';
import EquipmentMovement from '../models/EquipmentMovement.js';
import SystemSetting from '../models/SystemSetting.js';
import VehicleActivityLog from '../models/VehicleActivityLog.js';
import VehicleRegistration from '../models/VehicleRegistration.js';
import Vehicle from '../models/Vehicle.js';

const router = express.Router();

// GET /api/equipment/idle-monitoring/settings
router.get(
  '/settings',
  asyncHandler(async (req, res) => {
    let settings = await SystemSetting.findOne({ singleton: 'singleton' });
    if (!settings) {
      settings = await SystemSetting.create({
        singleton: 'singleton',
        idleAlerts: {
          enabled: true,
          dashboardNotifications: true,
          thresholds: [
            { key: '1h', label: '1 Hour', minutes: 60, enabled: true },
            { key: '2h', label: '2 Hours', minutes: 120, enabled: true },
            { key: '4h', label: '4 Hours', minutes: 240, enabled: true },
            { key: 'shift', label: 'Entire Shift', minutes: 480, enabled: true }
          ]
        }
      });
    }
    res.json(settings.idleAlerts);
  })
);

// PUT /api/equipment/idle-monitoring/settings
router.put(
  '/settings',
  asyncHandler(async (req, res) => {
    const { enabled, dashboardNotifications, thresholds } = req.body;
    let settings = await SystemSetting.findOne({ singleton: 'singleton' });
    if (!settings) settings = new SystemSetting({ singleton: 'singleton' });

    settings.idleAlerts = {
      enabled,
      dashboardNotifications,
      thresholds
    };
    await settings.save();
    res.json(settings.idleAlerts);
  })
);

// GET /api/equipment/idle-monitoring/dashboard
router.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    const activeMovements = await EquipmentMovement.countDocuments({ status: 'Inside' });
    const activeIdleSessions = await IdleSession.find({ status: 'Active' }).populate('vehicleId');
    
    let idle1h = 0;
    let idle2h = 0;
    let idle4h = 0;
    let idleShift = 0;
    
    const now = new Date();
    
    // For "Top Idle Equipment" we sort by duration
    const idleList = activeIdleSessions.map(session => {
      const minutes = Math.floor((now.getTime() - session.startTime.getTime()) / 60000);
      
      if (minutes >= 480) idleShift++;
      else if (minutes >= 240) idle4h++;
      else if (minutes >= 120) idle2h++;
      else if (minutes >= 60) idle1h++;

      return {
        session,
        minutes
      };
    });

    idleList.sort((a, b) => b.minutes - a.minutes);
    const topIdle = idleList.slice(0, 10);

    // Recent Events (from VehicleActivityLog)
    const recentEvents = await VehicleActivityLog.find({ 
      'metadata.action': { $in: ['department_entry', 'department_exit', 'idle_started', 'idle_cleared', 'idle_alert_generated', 'manual_override'] } 
    })
      .sort({ timestamp: -1 })
      .limit(15)
      .populate('vehicleId')
      .populate('departmentId');

    const totalEquipment = activeMovements + activeIdleSessions.length;
    const utilization = totalEquipment > 0 ? Math.round((activeMovements / totalEquipment) * 100) : 0;

    res.json({
      activeWorking: activeMovements,
      activeIdle: activeIdleSessions.length,
      utilization,
      buckets: {
        '1h': idle1h,
        '2h': idle2h,
        '4h': idle4h,
        'shift': idleShift
      },
      topIdle,
      recentEvents
    });
  })
);

// GET /api/equipment/idle-monitoring/reports
router.get(
  '/reports',
  asyncHandler(async (req, res) => {
    const idleSessions = await IdleSession.find()
      .sort({ startTime: -1 })
      .populate('vehicleId')
      .populate('lastDepartmentId');
      
    // Transform to flat data for enterprise report table
    const reportData = idleSessions.map(s => {
      const now = new Date();
      const end = s.status === 'Active' ? now : s.clearedAt;
      const duration = Math.floor((end.getTime() - s.startTime.getTime()) / 60000);

      return {
        _id: s._id,
        vehicleNumber: s.vehicleId?.plateNumber || 'Unknown',
        type: s.vehicleId?.typeId || 'Unknown', // Ideally populate this too, but for simplicity
        status: s.status,
        lastDepartment: s.lastDepartmentId?.name || 'Unknown',
        outTime: s.startTime,
        durationMinutes: duration,
        clearedAt: s.clearedAt,
        shift: 'N/A' // Shift data could be extracted if we track operator shifts
      };
    });
    
    res.json(reportData);
  })
);

// GET /api/equipment/idle-monitoring/timeline/:vehicleId
router.get(
  '/timeline/:vehicleId',
  asyncHandler(async (req, res) => {
    const { vehicleId } = req.params;
    
    const events = [];

    // 1. Registration
    const reg = await VehicleRegistration.findOne({ normalizedPlateNumber: (await Vehicle.findById(vehicleId)).normalizedPlateNumber });
    if (reg) {
      events.push({
        type: 'registration',
        timestamp: reg.createdAt,
        title: 'Vehicle Registered',
        details: `Approved on ${reg.reviewedAt}`
      });
    }

    // 2. Movements
    const movements = await EquipmentMovement.find({ vehicleId }).populate('departmentId');
    for (const m of movements) {
      events.push({
        type: 'movement_in',
        timestamp: m.inTime,
        title: 'Department Entry',
        details: `Entered ${m.departmentId?.name || 'Unknown'} (Source: ${m.movementSource})`
      });
      if (m.outTime) {
        events.push({
          type: 'movement_out',
          timestamp: m.outTime,
          title: 'Department Exit',
          details: `Exited ${m.departmentId?.name || 'Unknown'}`
        });
      }
    }

    // 3. Idle Sessions
    const idleSessions = await IdleSession.find({ vehicleId });
    for (const s of idleSessions) {
      events.push({
        type: 'idle_start',
        timestamp: s.startTime,
        title: 'Idle Started',
        details: 'Timer activated upon department exit'
      });
      if (s.clearedAt) {
        events.push({
          type: 'idle_cleared',
          timestamp: s.clearedAt,
          title: 'Idle Cleared',
          details: `Total Idle Time: ${s.idleDurationMinutes} minutes`
        });
      }
    }

    // 4. Alerts
    const alerts = await VehicleActivityLog.find({ vehicleId, 'metadata.action': 'idle_alert_generated' });
    for (const a of alerts) {
      events.push({
        type: 'idle_alert',
        timestamp: a.timestamp,
        title: 'Idle Alert Triggered',
        details: a.reason
      });
    }

    events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    res.json(events);
  })
);

export default router;
