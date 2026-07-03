import Division from '../models/Division.js';
import Gate from '../models/Gate.js';
import Department from '../models/Department.js';
import { GATE_TYPES } from '../constants/index.js';

function gateAllowedEvents(gateType) {
  if (gateType === GATE_TYPES.ENTRY) return ['entry'];
  if (gateType === GATE_TYPES.EXIT) return ['exit'];
  return ['entry', 'exit'];
}

function normalizeId(value) {
  return (value?._id || value)?.toString?.() || String(value);
}

export async function getUserAccessScope(user) {
  const isSuperAdmin = Boolean(user.isSuperAdmin);

  const divisionFilter = { isActive: true };
  if (!isSuperAdmin) {
    const divisionIds = (user.divisionIds || []).map(normalizeId);
    if (divisionIds.length === 0) {
      return { isSuperAdmin, divisions: [] };
    }
    divisionFilter._id = { $in: divisionIds };
  }

  const divisions = await Division.find(divisionFilter).sort({ name: 1 });
  const divisionIds = divisions.map((d) => d._id);

  if (divisionIds.length === 0) {
    return { isSuperAdmin, divisions: [] };
  }

  const gateFilter = { divisionId: { $in: divisionIds }, isActive: true };
  if (!isSuperAdmin) {
    const gateIds = (user.gateIds || []).map(normalizeId);
    if (gateIds.length === 0) {
      return {
        isSuperAdmin,
        divisions: divisions.map((d) => ({
          _id: d._id,
          name: d.name,
          slug: d.slug,
          gates: [],
          departments: [],
        })),
      };
    }
    gateFilter._id = { $in: gateIds };
  }

  const gates = await Gate.find(gateFilter)
    .populate('divisionId', 'name slug isActive')
    .sort({ name: 1 });

  const departmentFilter = { divisionIds: { $in: divisionIds }, isActive: true };
  if (!isSuperAdmin) {
    const departmentIds = (user.departmentIds || []).map(normalizeId);
    if (departmentIds.length === 0) {
      return {
        isSuperAdmin,
        divisions: divisions.map((division) => ({
          _id: division._id,
          name: division.name,
          slug: division.slug,
          gates: gates
            .filter((g) => normalizeId(g.divisionId) === division._id.toString())
            .map((g) => ({
              _id: g._id,
              name: g.name,
              slug: g.slug,
              gateType: g.gateType,
              allowedEvents: gateAllowedEvents(g.gateType),
            })),
          departments: [],
        })),
      };
    }
    departmentFilter._id = { $in: departmentIds };
  }

  const departments = await Department.find(departmentFilter)
    .populate('divisionIds', 'name slug isActive')
    .sort({ name: 1 });

  const scopedDivisions = divisions.map((division) => {
    const divId = division._id.toString();
    return {
      _id: division._id,
      name: division.name,
      slug: division.slug,
      gates: gates
        .filter((g) => normalizeId(g.divisionId) === divId)
        .map((g) => ({
          _id: g._id,
          name: g.name,
          slug: g.slug,
          gateType: g.gateType,
          allowedEvents: gateAllowedEvents(g.gateType),
        })),
      departments: departments
        .filter((d) => (d.divisionIds || []).some((divRef) => normalizeId(divRef) === divId))
        .map((d) => ({
          _id: d._id,
          name: d.name,
          slug: d.slug,
        })),
    };
  });

  return {
    isSuperAdmin,
    divisions: scopedDivisions.filter((d) => d.gates.length > 0 || d.departments.length > 0),
  };
}
