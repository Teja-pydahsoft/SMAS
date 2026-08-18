import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { recalculateAttendanceHistory } from '../src/services/registrationReportService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/smas';

async function run() {
  console.log('Connecting to database...');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected.');

  // Default to the current month if no dates are provided
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
  
  const args = process.argv.slice(2);
  const dateFrom = args[0] || year + '-' + month + '-01';
  const dateTo = args[1] || year + '-' + month + '-' + lastDay;

  console.log('\nStarting massive recalculation for ALL employees...');
  console.log('Date Range: ' + dateFrom + ' to ' + dateTo);
  console.log('This will iterate through every single gate pass in the database within this range.');
  console.log('It will apply the latest Shift Rules (Grace Periods, Multi-shift thresholds, Rebucketing logic).');
  
  try {
    const result = await recalculateAttendanceHistory({
      dateFrom,
      dateTo,
      limit: 1,
      page: 1,
    });

    const stats = result.recalculation || {};
    
    console.log('\n✅ Recalculation Complete!');
    console.log('-------------------------------------------------');
    console.log('Passes Updated in Database : ' + stats.passesUpdated);
    console.log('Total Payroll Calculated   : ₹' + stats.totalPayroll);
    console.log('Present Days (P)           : ' + stats.presentDays);
    console.log('Double Shifts (DS) / Multi : Computed and applied internally!');
    console.log('-------------------------------------------------\n');

  } catch (err) {
    console.error('\n❌ Error during recalculation:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from database.');
    process.exit(0);
  }
}

run();
