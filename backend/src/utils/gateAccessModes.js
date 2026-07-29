import { GATE_TYPES, GATE_EVENT_TYPES } from '../constants/index.js';

export const GATE_ACCESS_MODES = {
  ENTRY: 'entry',
  EXIT: 'exit',
  BOTH: 'both',
};

export function gateAccessModesToObject(value) {
  if (!value) return {};
  if (value instanceof Map) return Object.fromEntries(value.entries());
  if (typeof value === 'object') return { ...value };
  return {};
}

/**
 * Resolve the effective access mode for a gate assignment.
 * Missing / invalid modes fall back to full access for the gate's type.
 */
export function resolveGateAccessMode(gateType, storedMode) {
  if (gateType === GATE_TYPES.ENTRY) return GATE_ACCESS_MODES.ENTRY;
  if (gateType === GATE_TYPES.EXIT) return GATE_ACCESS_MODES.EXIT;
  if (storedMode === GATE_ACCESS_MODES.ENTRY || storedMode === GATE_ACCESS_MODES.EXIT) {
    return storedMode;
  }
  return GATE_ACCESS_MODES.BOTH;
}

/**
 * Build allowedEvents for the access-scope picker / entry-exit selector.
 * Restricted "both" gates expose entry and/or exit instead of auto.
 */
export function allowedEventsForGateAccess(gateType, accessMode) {
  const mode = resolveGateAccessMode(gateType, accessMode);
  if (mode === GATE_ACCESS_MODES.ENTRY) return [GATE_EVENT_TYPES.ENTRY];
  if (mode === GATE_ACCESS_MODES.EXIT) return [GATE_EVENT_TYPES.EXIT];
  if (gateType === GATE_TYPES.BOTH) return [GATE_EVENT_TYPES.AUTO];
  if (gateType === GATE_TYPES.ENTRY) return [GATE_EVENT_TYPES.ENTRY];
  if (gateType === GATE_TYPES.EXIT) return [GATE_EVENT_TYPES.EXIT];
  return [GATE_EVENT_TYPES.AUTO];
}

/**
 * Whether a requested scan event is allowed for the user's mode on this gate.
 * Auto is only allowed when the user has full (both) access on a both-type gate.
 */
export function isEventAllowedForGateMode(gateType, accessMode, eventType) {
  const mode = resolveGateAccessMode(gateType, accessMode);
  if (eventType === GATE_EVENT_TYPES.AUTO) {
    return gateType === GATE_TYPES.BOTH && mode === GATE_ACCESS_MODES.BOTH;
  }
  if (eventType === GATE_EVENT_TYPES.ENTRY) {
    return mode === GATE_ACCESS_MODES.ENTRY || mode === GATE_ACCESS_MODES.BOTH;
  }
  if (eventType === GATE_EVENT_TYPES.EXIT) {
    return mode === GATE_ACCESS_MODES.EXIT || mode === GATE_ACCESS_MODES.BOTH;
  }
  return false;
}

/**
 * Normalize API gateModes input against assigned gateIds and loaded gate docs.
 * Returns a plain object suitable for storing in SystemUser.gateAccessModes.
 */
export function normalizeGateAccessModes(gateIds, gateDocs, gateModesInput) {
  const input = gateAccessModesToObject(gateModesInput);
  const byId = new Map(gateDocs.map((g) => [g._id.toString(), g]));
  const modes = {};

  for (const gateId of gateIds) {
    const id = String(gateId);
    const gate = byId.get(id);
    if (!gate) continue;
    modes[id] = resolveGateAccessMode(gate.gateType, input[id]);
  }

  return modes;
}
