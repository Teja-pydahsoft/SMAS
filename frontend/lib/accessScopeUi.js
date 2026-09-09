/** Helpers for system-user access-scope pickers (divisions / gates / departments). */

export function idStr(value) {
  return String(value?._id || value || '');
}

/** When no divisions are selected, return all gates (department-only / unfiltered). */
export function filterGatesByDivisions(gates = [], divisionIds = []) {
  if (!divisionIds.length) return gates;
  const selected = new Set(divisionIds.map(String));
  return gates.filter((gate) => selected.has(idStr(gate.divisionId)));
}

/** When no divisions are selected, return all departments (department-gate-only access). */
export function filterDepartmentsByDivisions(departments = [], divisionIds = []) {
  if (!divisionIds.length) return departments;
  const selected = new Set(divisionIds.map(String));
  return departments.filter((dept) =>
    (dept.divisionIds || []).some((div) => selected.has(idStr(div)))
  );
}

/**
 * Drop gate/department picks that fall outside the selected divisions.
 * If no divisions are selected, keep current picks (department-only is allowed).
 */
export function pruneScopeForDivisions({
  gates = [],
  departments = [],
  divisionIds = [],
  gateIds = [],
  gateAccessModes = {},
  departmentIds = [],
  departmentAccessModes = {},
}) {
  if (!divisionIds.length) {
    return { gateIds, gateAccessModes, departmentIds, departmentAccessModes };
  }

  const allowedGateIds = new Set(
    filterGatesByDivisions(gates, divisionIds).map((gate) => gate._id)
  );
  const allowedDeptIds = new Set(
    filterDepartmentsByDivisions(departments, divisionIds).map((dept) => dept._id)
  );

  const nextGateIds = gateIds.filter((id) => allowedGateIds.has(id));
  const nextModes = {};
  for (const id of nextGateIds) {
    if (gateAccessModes[id]) nextModes[id] = gateAccessModes[id];
  }

  const nextDeptIds = departmentIds.filter((id) => allowedDeptIds.has(id));
  const nextDeptModes = {};
  for (const id of nextDeptIds) {
    nextDeptModes[id] = departmentAccessModes[id] || 'both';
  }

  return {
    gateIds: nextGateIds,
    gateAccessModes: nextModes,
    departmentIds: nextDeptIds,
    departmentAccessModes: nextDeptModes,
  };
}
