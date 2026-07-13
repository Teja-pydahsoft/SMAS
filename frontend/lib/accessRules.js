export const ACCESS_RULES = [
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
    id: 'checkout_timing',
    title: 'Check-out timing',
    rule: 'Gate and department check-out require at least 2 minutes after the corresponding check-in.',
  },
  {
    id: 'division',
    title: 'Changing division',
    rule: 'Close the active department → division gate check-out → new division gate check-in → department check-in.',
  },
];

export function formatRequiredSteps(steps) {
  if (!steps?.length) return null;
  return steps;
}
