import mongoose from 'mongoose';
import { emptyPermissions } from '../constants/index.js';

const permissionActionSchema = new mongoose.Schema(
  {
    read: { type: Boolean, default: false },
    write: { type: Boolean, default: false },
  },
  { _id: false }
);

const systemRoleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, default: '' },
    permissions: {
      type: Map,
      of: permissionActionSchema,
      default: () => new Map(Object.entries(emptyPermissions())),
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

systemRoleSchema.methods.toPermissionObject = function toPermissionObject() {
  const result = emptyPermissions();
  if (!this.permissions) return result;
  for (const [key, value] of this.permissions.entries()) {
    result[key] = { read: Boolean(value?.read), write: Boolean(value?.write) };
  }
  return result;
};

export default mongoose.model('SystemRole', systemRoleSchema);
