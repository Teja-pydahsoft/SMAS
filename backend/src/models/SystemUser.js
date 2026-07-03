import mongoose from 'mongoose';

const systemUserSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    displayName: { type: String, required: true, trim: true },
    email: { type: String, default: '', trim: true, lowercase: true },
    systemRoleId: { type: mongoose.Schema.Types.ObjectId, ref: 'SystemRole', default: null },
    isSuperAdmin: { type: Boolean, default: false },
    divisionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Division' }],
    gateIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Gate' }],
    departmentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Department' }],
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true }
);

systemUserSchema.index({ systemRoleId: 1, isActive: 1 });

export default mongoose.model('SystemUser', systemUserSchema);
