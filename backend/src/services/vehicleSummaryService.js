import Vehicle from '../models/Vehicle.js';
import VehicleRegistration from '../models/VehicleRegistration.js';

function normalizePlateKey(plate) {
  return String(plate || '').toUpperCase().replace(/[^A-Z0-9]/g, '').toLowerCase();
}

/**
 * Fleet = Vehicle Master records.
 * Registrations = workflow/history records (can differ after deletes or manual fixes).
 */
export async function getVehicleModuleSummary() {
  const [vehicles, registrations] = await Promise.all([
    Vehicle.find({}, 'plateNumber normalizedPlateNumber').lean(),
    VehicleRegistration.find({}, 'plateNumber normalizedPlateNumber status').lean(),
  ]);

  const fleetPlates = new Set(vehicles.map((v) => normalizePlateKey(v.normalizedPlateNumber || v.plateNumber)));
  const registrationPlates = new Set(registrations.map((r) => normalizePlateKey(r.normalizedPlateNumber || r.plateNumber)));

  const fleetWithoutRegistration = vehicles.filter((v) => {
    const key = normalizePlateKey(v.normalizedPlateNumber || v.plateNumber);
    return key && !registrationPlates.has(key);
  });

  const registrationNotInFleet = registrations.filter((r) => {
    const key = normalizePlateKey(r.normalizedPlateNumber || r.plateNumber);
    return key && !fleetPlates.has(key);
  });

  const statusCounts = registrations.reduce(
    (acc, r) => {
      acc.total++;
      if (r.status === 'Pending') acc.pending++;
      else if (r.status === 'Approved') acc.approved++;
      else if (r.status === 'Rejected') acc.rejected++;
      return acc;
    },
    { total: 0, pending: 0, approved: 0, rejected: 0 }
  );

  return {
    fleetCount: vehicles.length,
    registrationTotal: statusCounts.total,
    pendingRegistrations: statusCounts.pending,
    approvedRegistrations: statusCounts.approved,
    rejectedRegistrations: statusCounts.rejected,
    fleetWithoutRegistration: fleetWithoutRegistration.length,
    registrationNotInFleet: registrationNotInFleet.length,
    isSynced: fleetWithoutRegistration.length === 0 && registrationNotInFleet.length === 0,
    orphanFleetPlates: fleetWithoutRegistration.map((v) => v.plateNumber),
  };
}
