import mongoose from 'mongoose';

const systemSettingSchema = new mongoose.Schema(
  {
    singleton: {
      type: String,
      default: 'singleton',
      required: true,
      unique: true,
    },
    idleAlerts: {
      enabled: { type: Boolean, default: true },
      dashboardNotifications: { type: Boolean, default: true },
      thresholds: [
        {
          key: { type: String, required: true },
          label: { type: String, required: true },
          minutes: { type: Number, required: true },
          enabled: { type: Boolean, default: true },
        },
      ],
    },
  },
  { timestamps: true }
);

export default mongoose.model('SystemSetting', systemSettingSchema);
