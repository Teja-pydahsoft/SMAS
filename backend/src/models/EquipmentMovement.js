import mongoose from 'mongoose';

const equipmentMovementSchema = new mongoose.Schema(
  {
    vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
    divisionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Division', required: false },
    inTime: { type: Date, required: true, default: Date.now },
    outTime: { type: Date, required: false },
    enteredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'SystemUser', required: false },
    exitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'SystemUser', required: false },
    gateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Gate', required: false },
    status: { type: String, enum: ['Inside', 'Exited'], default: 'Inside' },
    movementSource: { type: String, enum: ['manual', 'camera', 'rfid', 'qr', 'api'], default: 'manual' },
    snapshotUrl: { type: String, required: false },
    outSnapshotUrl: { type: String, required: false },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

equipmentMovementSchema.index({ vehicleId: 1, status: 1 });
equipmentMovementSchema.index({ departmentId: 1 });
equipmentMovementSchema.index({ inTime: -1 });

export default mongoose.model('EquipmentMovement', equipmentMovementSchema);
