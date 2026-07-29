'use client';

/**
 * Checkbox list for assigning gates with optional entry/exit mode on "both" gates.
 *
 * Props:
 * - gates: gate objects with _id, name, gateType, optional divisionId
 * - selectedIds: string[] of selected gate ids
 * - modes: { [gateId]: 'entry' | 'exit' | 'both' }
 * - onChange({ gateIds, gateAccessModes })
 * - showDivision?: boolean — append division name in the label
 * - emptyMessage?: string
 */
export default function GateAccessPicker({
  gates = [],
  selectedIds = [],
  modes = {},
  onChange,
  showDivision = true,
  emptyMessage = 'No gates available.',
}) {
  const selected = new Set(selectedIds.map(String));

  function emit(nextIds, nextModes) {
    const cleaned = {};
    for (const id of nextIds) {
      cleaned[id] = nextModes[id] || 'both';
    }
    onChange({ gateIds: nextIds, gateAccessModes: cleaned });
  }

  function toggleGate(gate) {
    const id = gate._id;
    const isOn = selected.has(id);
    if (isOn) {
      emit(
        selectedIds.filter((g) => g !== id),
        modes
      );
      return;
    }
    const defaultMode =
      gate.gateType === 'entry' ? 'entry' : gate.gateType === 'exit' ? 'exit' : 'both';
    emit([...selectedIds, id], { ...modes, [id]: defaultMode });
  }

  function setMode(gate, mode) {
    const id = gate._id;
    const nextModes = { ...modes, [id]: mode };
    if (!selected.has(id)) {
      emit([...selectedIds, id], nextModes);
      return;
    }
    emit(selectedIds, nextModes);
  }

  function modeLabel(gateType) {
    if (gateType === 'entry') return 'entry';
    if (gateType === 'exit') return 'exit';
    return 'both';
  }

  if (gates.length === 0) {
    return <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{emptyMessage}</p>;
  }

  return (
    <div className="checkbox-group gate-access-picker">
      {gates.map((gate) => {
        const id = gate._id;
        const checked = selected.has(id);
        const isBoth = gate.gateType === 'both';
        const mode = modes[id] || (isBoth ? 'both' : modeLabel(gate.gateType));
        const divisionName = gate.divisionId?.name;

        return (
          <div key={id} className={`gate-access-picker__item${checked ? ' is-selected' : ''}`}>
            <label className="checkbox-option gate-access-picker__gate">
              <input type="checkbox" checked={checked} onChange={() => toggleGate(gate)} />
              <span>
                {gate.name}
                <span className="gate-access-picker__meta">
                  ({modeLabel(gate.gateType)}
                  {showDivision && divisionName ? ` · ${divisionName}` : ''})
                </span>
              </span>
            </label>

            {isBoth && checked && (
              <div className="gate-access-picker__modes" role="group" aria-label={`${gate.name} access mode`}>
                {[
                  { value: 'entry', label: 'Entry only' },
                  { value: 'exit', label: 'Exit only' },
                  { value: 'both', label: 'Entry & exit' },
                ].map((opt) => (
                  <label key={opt.value} className="gate-access-picker__mode">
                    <input
                      type="radio"
                      name={`gate-mode-${id}`}
                      value={opt.value}
                      checked={mode === opt.value}
                      onChange={() => setMode(gate, opt.value)}
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function gateModeBadgeLabel(gate, modes = {}) {
  const id = gate?._id || gate;
  const gateType = gate?.gateType;
  const mode = modes[id] || (gateType === 'entry' || gateType === 'exit' ? gateType : 'both');
  if (mode === 'entry') return 'entry';
  if (mode === 'exit') return 'exit';
  return gateType === 'both' ? 'entry & exit' : gateType || 'both';
}
