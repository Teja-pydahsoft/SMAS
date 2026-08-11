import VehicleActivityLog from '../models/VehicleActivityLog.js';

export const logDepartmentEntry = async (vehicle, departmentId, gateId, source, movementId, snapshotUrl = null, confidence = 0) => {
  return await VehicleActivityLog.create({
    vehicleId: vehicle._id,
    departmentId,
    gateId,
    capturedPlate: vehicle.plateNumber,
    normalizedCapturedPlate: vehicle.normalizedPlateNumber,
    confidence,
    snapshotUrl,
    decision: 'Granted',
    reason: 'Department Entry',
    metadata: { action: 'department_entry', movementId, source }
  });
};

export const logDepartmentExit = async (vehicle, departmentId, gateId, source, movementId, snapshotUrl = null, confidence = 0) => {
  return await VehicleActivityLog.create({
    vehicleId: vehicle._id,
    departmentId,
    gateId,
    capturedPlate: vehicle.plateNumber,
    normalizedCapturedPlate: vehicle.normalizedPlateNumber,
    confidence,
    snapshotUrl,
    decision: 'Granted',
    reason: 'Department Exit',
    metadata: { action: 'department_exit', movementId, source }
  });
};

export const logIdleStarted = async (session) => {
  return await VehicleActivityLog.create({
    vehicleId: session.vehicleId,
    departmentId: session.lastDepartmentId,
    decision: 'Unknown',
    reason: 'Idle Session Started',
    metadata: { action: 'idle_started', idleSessionId: session._id }
  });
};

export const logIdleCleared = async (session) => {
  return await VehicleActivityLog.create({
    vehicleId: session.vehicleId,
    departmentId: session.lastDepartmentId,
    decision: 'Unknown',
    reason: 'Idle Session Cleared',
    metadata: { action: 'idle_cleared', duration: session.idleDurationMinutes, idleSessionId: session._id }
  });
};

export const logIdleAlert = async (session, alertConfig, idleMinutes) => {
  return await VehicleActivityLog.create({
    vehicleId: session.vehicleId,
    departmentId: session.lastDepartmentId,
    decision: 'Unknown',
    reason: `Idle Alert Generated: ${alertConfig.label}`,
    metadata: { 
      action: 'idle_alert_generated', 
      idleSessionId: session._id, 
      thresholdKey: alertConfig.key,
      idleMinutes 
    }
  });
};

export const logManualOverride = async (vehicle, userId, notes, snapshotUrl = null) => {
  return await VehicleActivityLog.create({
    vehicleId: vehicle._id,
    capturedPlate: vehicle.plateNumber,
    normalizedCapturedPlate: vehicle.normalizedPlateNumber,
    snapshotUrl,
    decision: 'Granted',
    reason: `Manual Override: ${notes}`,
    metadata: { action: 'manual_override', userId }
  });
};
