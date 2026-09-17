import mongoose from 'mongoose';
import Registration from './src/models/Registration.js';

async function run() {
  await mongoose.connect('mongodb://127.0.0.1:27017/smas');
  const regs = await Registration.find({ workingHours: { $gt: 0 } }).limit(5);
  for (const r of regs) {
    console.log(r._id, 'shiftId:', r.shiftId, 'workingHours:', r.workingHours);
  }
  process.exit(0);
}
run();
