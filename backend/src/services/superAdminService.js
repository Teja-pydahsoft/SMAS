import bcrypt from 'bcryptjs';
import SystemUser from '../models/SystemUser.js';

export async function ensureSuperAdmin() {
  const username = (process.env.SUPER_ADMIN_USERNAME || 'superadmin').toLowerCase().trim();
  const password = process.env.SUPER_ADMIN_PASSWORD || 'superadmin123';

  let user = await SystemUser.findOne({ username }).select('+passwordHash');
  const passwordHash = await bcrypt.hash(password, 12);

  if (!user) {
    user = await SystemUser.create({
      username,
      passwordHash,
      displayName: 'Super Admin',
      isSuperAdmin: true,
      divisionIds: [],
      gateIds: [],
      departmentIds: [],
    });
    console.log(`Super admin created (username: ${username})`);
    return { created: true, username };
  }

  const updates = {
    isSuperAdmin: true,
    isActive: true,
    systemRoleId: null,
    divisionIds: [],
    gateIds: [],
    departmentIds: [],
  };

  if (process.env.SUPER_ADMIN_PASSWORD) {
    updates.passwordHash = passwordHash;
  }

  await SystemUser.updateOne({ _id: user._id }, updates);
  return { created: false, username, passwordReset: Boolean(process.env.SUPER_ADMIN_PASSWORD) };
}
