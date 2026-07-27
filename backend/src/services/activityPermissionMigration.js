import SystemRole from '../models/SystemRole.js';

/**
 * Activity used to share the gate permission. When Activity becomes its own
 * module, copy gate read/write onto activity for roles that do not already
 * have an activity entry so existing operators keep access.
 */
export async function migrateActivityPermissionsFromGate() {
  const roles = await SystemRole.find();
  let migrated = 0;

  for (const role of roles) {
    const perms =
      role.permissions instanceof Map
        ? Object.fromEntries(role.permissions.entries())
        : { ...(role.permissions || {}) };

    const gate = perms.gate || {};
    const activity = perms.activity;
    const hasActivityKey = activity && (activity.read !== undefined || activity.write !== undefined);

    if (hasActivityKey) continue;
    if (!gate.read && !gate.write) continue;

    perms.activity = {
      read: Boolean(gate.read || gate.write),
      write: Boolean(gate.write),
    };
    role.permissions = perms;
    role.markModified('permissions');
    await role.save();
    migrated += 1;
  }

  return { migrated };
}
