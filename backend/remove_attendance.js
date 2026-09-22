import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config({ path: 'e:/SMAS/backend/.env' });

import Registration from 'file:///e:/SMAS/backend/src/models/Registration.js';
import GateLog from 'file:///e:/SMAS/backend/src/models/GateLog.js';

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB');

    const regCode = 'WM0230';
    let reg = await Registration.findOne({ registrationCode: regCode });
    
    if (!reg) {
        reg = await Registration.findOne({ 'selections.value': regCode });
    }
    if (!reg) {
        reg = await Registration.findOne({ displayName: { $regex: regCode, $options: 'i' } });
    }
    
    if (!reg) {
        console.log('Registration not found for code:', regCode);
        process.exit(1);
    }
    
    console.log('Found registration:', reg._id, reg.displayName);

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const result = await GateLog.deleteMany({
      registrationId: reg._id,
      createdAt: { $gte: startOfToday, $lte: endOfToday }
    });

    console.log(`Deleted ${result.deletedCount} gate logs for today.`);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
