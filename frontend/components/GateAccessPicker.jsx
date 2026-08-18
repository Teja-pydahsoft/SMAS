'use client';

/**
 * Checkbox list for assigning gates with optional entry/exit mode on "both" gates.
 *
 * Props:
 * - gates: gate objects with _id, name, gateType, optional divisionId
 * - selectedIds: string[] of selected gate ids
 * - modes: { [gateId]: 'entry' | 'exit' | 'both' }
 * - onChange({ gateIds, gateAccessModes })
 * - showDivision?: boolean — show division as secondary meta
 * - emptyMessage?: string
 */
const MODE_OPTIONS = [
  { value: 'entry', label: 'Entry' },
  { value: 'exit', label: 'Exit' },
  { value: 'both', label: 'Both' },
];

function typeLabel(gateType) {
  if (gateType === 'entry') return 'Entry';
  if (gateType === 'exit') return 'Exit';
  return 'Combined';
}

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

  if (gates.length === 0) {
    return <p className="scope-empty">{emptyMessage}</p>;
  }

  return (
    <div className="gate-access-picker">
      {gates.map((gate) => {
        const id = gate._id;
        const checked = selected.has(id);
        const isBoth = gate.gateType === 'both';
        const mode = modes[id] || (isBoth ? 'both' : gate.gateType === 'exit' ? 'exit' : 'entry');
        const divisionName = gate.divisionId?.name;
        const showDiv = showDivision && divisionName && divisionName !== gate.name;

        return (
          <div key={id} className={`gate-access-picker__item${checked ? ' is-selected' : ''}`}>
            <label className="gate-access-picker__gate">
              <input type="checkbox" checked={checked} onChange={() => toggleGate(gate)} />
              <span className="gate-access-picker__text">
                <span className="gate-access-picker__name">{gate.name}</span>
                <span className="gate-access-picker__meta">
                  {typeLabel(gate.gateType)}
                  {showDiv ? ` · ${divisionName}` : ''}
                </span>
              </span>
            </label>

            {isBoth && checked && (
              <div className="gate-access-picker__modes" role="group" aria-label={`${gate.name} access mode`}>
                {MODE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`gate-access-picker__mode${mode === opt.value ? ' is-active' : ''}`}
                    onClick={() => setMode(gate, opt.value)}
                    aria-pressed={mode === opt.value}
                  >
                    {opt.label}
                  </button>
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
