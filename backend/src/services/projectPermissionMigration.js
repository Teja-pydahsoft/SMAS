import SystemRole from '../models/SystemRole.js';

/**
 * Grant Project Management permission to roles that already manage departments,
 * so existing admins can use the new module without a manual role edit.
 */
export async function migrateProjectsPermissionsFromDepartments() {
  const roles = await SystemRole.find();
  let migrated = 0;

  for (const role of roles) {
    const perms =
      role.permissions instanceof Map
        ? Object.fromEntries(role.permissions.entries())
        : { ...(role.permissions || {}) };

    const departments = perms.departments || {};
    const projects = perms.projects;
    const hasProjectsKey = projects && (projects.read !== undefined || projects.write !== undefined);

    if (hasProjectsKey) continue;
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
