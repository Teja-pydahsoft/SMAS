import Division from '../models/Division.js';
import Gate from '../models/Gate.js';
import Department from '../models/Department.js';
import { GATE_TYPES } from '../constants/index.js';

function gateAllowedEvents(gateType) {
  if (gateType === GATE_TYPES.ENTRY) return ['entry'];
  if (gateType === GATE_TYPES.EXIT) return ['exit'];
  return ['auto'];
}

function normalizeId(value) {
  return (value?._id || value)?.toString?.() || String(value);
}

function mapGate(gate) {
  return {
    _id: gate._id,
    name: gate.name,
    slug: gate.slug,
    gateType: gate.gateType,
    allowedEvents: gateAllowedEvents(gate.gateType),
  };
}

function mapDepartment(department) {
  return {
    _id: department._id,
    name: department.name,
    slug: department.slug,
  };
}

async function resolveDivisionIdsForUser(user, isSuperAdmin) {
  if (isSuperAdmin) return null;

  const explicitDivisionIds = (user.divisionIds || []).map(normalizeId).filter(Boolean);
  if (explicitDivisionIds.length > 0) {
    return [...new Set(explicitDivisionIds)];
  }

  const derived = new Set();
  const gateIds = (user.gateIds || []).map(normalizeId).filter(Boolean);
  const departmentIds = (user.departmentIds || []).map(normalizeId).filter(Boolean);

  if (gateIds.length > 0) {
    const gates = await Gate.find({ _id: { $in: gateIds }, isActive: true }).select('divisionId');
    gates.forEach((gate) => {
      const divId = normalizeId(gate.divisionId);
      if (divId) derived.add(divId);
    });
  }

  if (departmentIds.length > 0) {
    const departments = await Department.find({ _id: { $in: departmentIds }, isActive: true }).select('divisionIds');
    departments.forEach((department) => {
      (department.divisionIds || []).forEach((divRef) => {
        const divId = normalizeId(divRef);
        if (divId) derived.add(divId);
      });
    });
  }

  return [...derived];
}

export async function getUserAccessScope(user) {
  const isSuperAdmin = Boolean(user.isSuperAdmin);

  if (!isSuperAdmin) {
    const assignedGateIds = (user.gateIds || []).map(normalizeId).filter(Boolean);
    const assignedDepartmentIds = (user.departmentIds || []).map(normalizeId).filter(Boolean);
    if (assignedGateIds.length === 0 && assignedDepartmentIds.length === 0) {
      return { isSuperAdmin, divisions: [] };
    }
  }

  const scopedDivisionIds = await resolveDivisionIdsForUser(user, isSuperAdmin);
  if (!isSuperAdmin && scopedDivisionIds.length === 0) {
    return { isSuperAdmin, divisions: [] };
  }

  const divisionFilter = { isActive: true };
  if (!isSuperAdmin) {
    divisionFilter._id = { $in: scopedDivisionIds };
  }

  const divisions = await Division.find(divisionFilter).sort({ name: 1 });
  const divisionIds = divisions.map((d) => d._id);

  if (divisionIds.length === 0) {
    return { isSuperAdmin, divisions: [] };
  }

  const assignedGateIds = !isSuperAdmin
    ? (user.gateIds || []).map(normalizeId).filter(Boolean)
    : null;
  const assignedDepartmentIds = !isSuperAdmin
    ? (user.departmentIds || []).map(normalizeId).filter(Boolean)
    : null;

  let gates = [];
  if (isSuperAdmin || assignedGateIds.length > 0) {
    const gateFilter = { divisionId: { $in: divisionIds }, isActive: true };
    if (!isSuperAdmin) {
      gateFilter._id = { $in: assignedGateIds };
    }
    gates = await Gate.find(gateFilter)
      .populate('divisionId', 'name slug isActive')
      .sort({ name: 1 });
  }

  let departments = [];
  if (isSuperAdmin || assignedDepartmentIds.length > 0) {
    const departmentFilter = { divisionIds: { $in: divisionIds }, isActive: true };
    if (!isSuperAdmin) {
      departmentFilter._id = { $in: assignedDepartmentIds };
    }
    departments = await Department.find(departmentFilter)
      .populate('divisionIds', 'name slug isActive')
      .sort({ name: 1 });
  }

  const scopedDivisions = divisions.map((division) => {
    const divId = division._id.toString();
    return {
      _id: division._id,
      name: division.name,
      slug: division.slug,
      gates: gates
        .filter((gate) => normalizeId(gate.divisionId) === divId)
        .map(mapGate),
      departments: departments
        .filter((department) => (department.divisionIds || []).some((divRef) => normalizeId(divRef) === divId))
        .map(mapDepartment),
    };
  });

  return {
    isSuperAdmin,
    divisions: scopedDivisions.filter((division) => division.gates.length > 0 || division.departments.length > 0),
  };
}
