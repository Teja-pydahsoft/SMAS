import SystemRole from '../models/SystemRole.js';

const JATTU_SUBPAGES = [
  'jattu_registrations',
  'jattu_entry_exit',
  'jattu_activity',
  'jattu_attendance',
];

function asPermissionObject(role) {
  return role.permissions instanceof Map
    ? Object.fromEntries(role.permissions.entries())
    : { ...(role.permissions || {}) };
}

function hasModuleKey(perms, key) {
  const value = perms[key];
  return Boolean(value && (value.read !== undefined || value.write !== undefined));
}

/**
 * Roles that already had the single JATTU Maintenance permission keep all
 * sidebar pages (Dashboard stays on `jattu`; others get their own keys).
 */
export async function migrateJattuSubpagePermissions() {
  const roles = await SystemRole.find();
  let migrated = 0;

  for (const role of roles) {
    const perms = asPermissionObject(role);
    const source = perms.jattu || {};
    if (!source.read && !source.write) continue;

    let changed = false;
    for (const key of JATTU_SUBPAGES) {
      if (hasModuleKey(perms, key)) continue;
      perms[key] = {
        read: Boolean(source.read || source.write),
        write: Boolean(source.write),
      };
      changed = true;
    }

    if (!changed) continue;
    role.permissions = perms;
    role.markModified('permissions');
    await role.save();
    migrated += 1;
  }

  return { migrated };
}
