'use client';

import { PERMISSION_MODULES } from '@/lib/auth/permissions';

export default function PermissionMatrix({ permissions, onChange, readOnly = false }) {
  function toggle(module, action) {
    if (readOnly) return;
    const current = permissions[module] || { read: false, write: false };
    const next = { ...current, [action]: !current[action] };
    if (action === 'write' && next.write) next.read = true;
    if (action === 'read' && !next.read) next.write = false;
    onChange({ ...permissions, [module]: next });
  }

  return (
    <div className="table-scroll">
      <table className="reg-table permission-matrix">
        <thead>
          <tr>
            <th>Module</th>
            <th>Read</th>
            <th>Write</th>
          </tr>
        </thead>
        <tbody>
          {PERMISSION_MODULES.map(({ key, label }) => {
            const value = permissions[key] || { read: false, write: false };
            return (
              <tr key={key}>
                <td className="name-cell">{label}</td>
                <td>
                  <label className="permission-check">
                    <input
                      type="checkbox"
                      checked={Boolean(value.read)}
                      onChange={() => toggle(key, 'read')}
                      disabled={readOnly}
                    />
                  </label>
                </td>
                <td>
                  <label className="permission-check">
                    <input
                      type="checkbox"
                      checked={Boolean(value.write)}
                      onChange={() => toggle(key, 'write')}
                      disabled={readOnly}
                    />
                  </label>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
