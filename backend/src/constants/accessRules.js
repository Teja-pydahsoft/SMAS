export const ACCESS_FLOW_STEPS = {
  GATE_REENTRY: [
    'Check out at the current division gate',
    'Then make a new gate entry when needed',
  ],
  DEPARTMENT_SWITCH: [
    'Check out from the current department',
    'Then check in at the target department',
  ],
  DIVISION_SWITCH: [
    'Check out from the active department (if checked in)',
    'Check out at the current division gate',
    'Check in at the new division gate',
    'Check in at the target department',
  ],
  DIVISION_EXIT: [
    'Check out from the active department',
    'Then check out at the division gate',
  ],
};

export const ACCESS_RULES_SUMMARY = [
  {
    id: 'gate',
    title: 'Gate entry',
    rule: 'Only one active gate entry at a time. Complete gate exit before another gate entry.',
  },
  {
    id: 'department',
    title: 'Department check-in',
    rule: 'Only one active department at a time. Check out of the current department before checking into another.',
  },
  {
    id: 'division',
    title: 'Changing division',
    rule: 'Close the active department, check out at the division gate, then check in at the new division gate before any department check-in.',
  },
];

export function getRequiredSteps(reason, { hasActiveDepartment = false } = {}) {
  switch (reason) {
    case 'already_in_division':
      return ACCESS_FLOW_STEPS.GATE_REENTRY;
    case 'active_in_other_department':
    case 'already_in_department':
      return ACCESS_FLOW_STEPS.DEPARTMENT_SWITCH;
    case 'active_in_other_division':
      return hasActiveDepartment
        ? ACCESS_FLOW_STEPS.DIVISION_SWITCH
        : [
            'Check out at the current division gate',
            'Check in at the new division gate',
            'Check in at the target department',
          ];
    case 'department_still_active':
      return ACCESS_FLOW_STEPS.DIVISION_EXIT;
    case 'no_gate_entry':
      return ['Complete division gate entry first', 'Then check in at the department'];
    default:
      return null;
  }
}
