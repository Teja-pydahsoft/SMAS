import Division from '../models/Division.js';
import Gate from '../models/Gate.js';
import Department from '../models/Department.js';
import {
  allowedEventsForGateAccess,
  allowedEventsForDepartmentAccess,
  gateAccessModesToObject,
  resolveGateAccessMode,
  resolveDepartmentAccessMode,
} from '../utils/gateAccessModes.js';

function normalizeId(value) {
  return (value?._id || value)?.toString?.() || String(value);
}

function mapGate(gate, accessMode) {
  const mode = resolveGateAccessMode(gate.gateType, accessMode);
  return {
    _id: gate._id,
    name: gate.name,
    slug: gate.slug,
    gateType: gate.gateType,
    accessMode: mode,
    allowedEvents: allowedEventsForGateAccess(gate.gateType, mode),
  };
}

function mapDepartment(department, accessMode) {
  const mode = resolveDepartmentAccessMode(accessMode);
  return {
    _id: department._id,
    name: department.name,
    slug: department.slug,
    accessMode: mode,
    allowedEvents: allowedEventsForDepartmentAccess(mode),
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

/**
 * Resolve the list of division ObjectId strings a user is allowed to see.
 * Returns `null` for super admins (meaning "no restriction / all divisions").
 * Returns an array (possibly empty) for scoped users.
 */
export async function getScopedDivisionIds(user) {
  return resolveDivisionIdsForUser(user, Boolean(user.isSuperAdmin));
}

/**
 * Combine a user's allowed divisions (`scopedIds`, null = all) with an optional
 * requested division id (e.g. from a dropdown) into the effective filter list.
 *   - returns `null`  → no restriction (query everything)
 *   - returns `[]`    → restrict to nothing (user has no access / picked an out-of-scope division)
 *   - returns [ids]   → restrict to these divisions
 */
export function resolveDivisionFilterIds(scopedIds, requestedDivisionId) {
  let requested = [];
  if (Array.isArray(requestedDivisionId)) {
    requested = requestedDivisionId
      .flatMap((id) => (typeof id === 'string' ? id.split(',') : String(id)))
      .map((id) => String(id).trim())
      .filter(Boolean);
  } else if (typeof requestedDivisionId === 'string' && requestedDivisionId.trim()) {
    const str = requestedDivisionId.trim();
    let parsed = null;
    if (str.startsWith('[') && str.endsWith(']')) {
      try {
        parsed = JSON.parse(str);
      } catch (_) {}
    }
    if (Array.isArray(parsed)) {
      requested = parsed.map((id) => String(id).trim()).filter(Boolean);
    } else {
      requested = str.split(',').map((id) => id.trim()).filter(Boolean);
    }
  }

  requested = requested.filter((id) => id !== 'all' && id !== '__all__');

  if (scopedIds === null || scopedIds === undefined) {
    return requested.length > 0 ? requested : null;
  }

  const scoped = scopedIds.map((id) => String(id));
  if (requested.length > 0) {
    return requested.filter((id) => scoped.includes(id));
  }
  return scoped;
}

/**
 * Resolve the list of department ObjectId strings a user is allowed to access/view.
 * Returns `null` for super admins (meaning "no restriction / all departments").
 * Returns an array (possibly empty) for scoped users.
 */
export async function getScopedDepartmentIds(user) {
  if (!user || Boolean(user.isSuperAdmin)) return null;

  const explicitDeptIds = (user.departmentIds || []).map(normalizeId).filter(Boolean);
  if (explicitDeptIds.length > 0) {
    return [...new Set(explicitDeptIds)];
  }

  const scopedDivIds = await getScopedDivisionIds(user);
  if (scopedDivIds === null) return null;
  if (scopedDivIds.length === 0) return [];

  const depts = await Department.find({ divisionIds: { $in: scopedDivIds }, isActive: true })
    .select('_id')
    .lean();
  return depts.map((d) => d._id.toString());
}

/**
 * Combine a user's allowed departments (`scopedIds`, null = all) with an optional
 * requested department id into the effective filter list.
 */
export function resolveDepartmentFilterIds(scopedIds, requestedDepartmentId) {
  const requested = requestedDepartmentId ? String(requestedDepartmentId).trim() : '';

  if (scopedIds === null || scopedIds === undefined) {
    return requested ? [requested] : null;
  }

  const scoped = scopedIds.map((id) => String(id));
  if (requested) {
    return scoped.includes(requested) ? [requested] : [];
  }
  return scoped;
}

/**
 * Lightweight list of departments a user may filter reports by.
 */
export async function getScopedDepartmentOptions(user) {
  const isSuperAdmin = Boolean(user.isSuperAdmin);
  const scopedIds = await getScopedDepartmentIds(user);

  const filter = { isActive: true };
  if (!isSuperAdmin) {
    if (!scopedIds || scopedIds.length === 0) {
      return { isSuperAdmin, departments: [] };
    }
    filter._id = { $in: scopedIds };
  }

  const departments = await Department.find(filter)
    .populate('divisionIds', 'name slug')
    .select('name slug divisionIds')
    .sort({ name: 1 })
    .lean();

  return {
    isSuperAdmin,
    departments: departments.map((d) => ({
      _id: d._id.toString(),
      name: d.name,
      slug: d.slug,
      divisionIds: (d.divisionIds || []).map((div) => ({
        _id: div._id?.toString() || div.toString(),
        name: div.name || '',
      })),
    })),
  };
}

/**
 * Lightweight list of the divisions a user may filter reports by.
 * Super admins get every active division; scoped users only their own.
 */
export async function getScopedDivisionOptions(user) {
  const isSuperAdmin = Boolean(user.isSuperAdmin);
  const scopedIds = await resolveDivisionIdsForUser(user, isSuperAdmin);

  const filter = { isActive: true };
  if (!isSuperAdmin) {
    if (!scopedIds || scopedIds.length === 0) {
      return { isSuperAdmin, divisions: [] };
    }
    filter._id = { $in: scopedIds };
  }

  const divisions = await Division.find(filter).select('name slug').sort({ name: 1 }).lean();
  return {
    isSuperAdmin,
    divisions: divisions.map((d) => ({
      _id: d._id.toString(),
      name: d.name,
      slug: d.slug,
    })),
  };
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
  const accessModes = gateAccessModesToObject(user.gateAccessModes);
  const departmentAccessModes = gateAccessModesToObject(user.departmentAccessModes);

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
        .map((gate) => mapGate(gate, isSuperAdmin ? 'both' : accessModes[normalizeId(gate._id)])),
      departments: departments
        .filter((department) => (department.divisionIds || []).some((divRef) => normalizeId(divRef) === divId))
        .map((department) =>
          mapDepartment(
            department,
            isSuperAdmin ? 'both' : departmentAccessModes[normalizeId(department._id)]
          )
        ),
    };
  });

  return {
    isSuperAdmin,
    divisions: scopedDivisions.filter((division) => division.gates.length > 0 || division.departments.length > 0),
  };
}
