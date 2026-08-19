import SystemRole from '../models/SystemRole.js';

const PROJECT_SUBPAGES = ['project_maintenance', 'project_photo_capture', 'project_reports'];

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
 * Grant Project Management permission to roles that already manage departments,
 * so existing admins can use the new module without a manual role edit.
 */
export async function migrateProjectsPermissionsFromDepartments() {
  const roles = await SystemRole.find();
  let migrated = 0;

  for (const role of roles) {
    const perms = asPermissionObject(role);

    const departments = perms.departments || {};
    if (hasModuleKey(perms, 'projects')) continue;
    if (!departments.read && !departments.write) continue;

    perms.projects = {
      read: Boolean(departments.read || departments.write),
      write: Boolean(departments.write),
    };
    role.permissions = perms;
    role.markModified('permissions');
    await role.save();
    migrated += 1;
  }

  return { migrated };
}

/**
 * Roles that already had Project Management keep all four sidebar pages
 * (Portfolio, Maintenance, Photo Capture, Reports).
 */
export async function migrateProjectSubpagePermissions() {
  const roles = await SystemRole.find();
  let migrated = 0;

  for (const role of roles) {
    const perms = asPermissionObject(role);
    const source = perms.projects || {};
    if (!source.read && !source.write) continue;

    let changed = false;
    for (const key of PROJECT_SUBPAGES) {
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
