/**
 * seed-admin-device.mjs
 *
 * Approves the first pending device in MongoDB as the primary admin device.
 * Run this ONCE on a fresh installation when the bootstrap UI flow cannot
 * be used (e.g. backend not yet restarted with the new bootstrap code).
 *
 * Usage:
 *   node scripts/seed-admin-device.mjs
 *
 * The script will:
 *   1. List all pending devices.
 *   2. Approve the most recently registered one.
 *   3. Mark it as isPrimaryAdminDevice = true.
 *   4. Write a BOOTSTRAP_APPROVED audit log entry.
 */

import 'dotenv/config';
import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/smas';

// ── Inline schema definitions (avoids importing full app) ─────────────────────

const deviceSchema = new mongoose.Schema({
  organizationId:     { type: String, default: 'default' },
  deviceName:         String,
  computerName:       String,
  operatingSystem:    String,
  fingerprint:        String,
  status:             String,
  isPrimaryAdminDevice: { type: Boolean, default: false },
  approvedBy:         { type: mongoose.Schema.Types.ObjectId, default: null },
  approvedByName:     { type: String, default: '' },
  approvedAt:         { type: Date, default: null },
  lastLoginAt:        { type: Date, default: null },
  loginCount:         { type: Number, default: 0 },
  adminNote:          { type: String, default: '' },
  registeredIp:       { type: String, default: '' },
  registeredAt:       { type: Date, default: Date.now },
}, { timestamps: true });

const auditSchema = new mongoose.Schema({
  deviceId:           { type: mongoose.Schema.Types.ObjectId, required: true },
  deviceName:         { type: String, default: '' },
  computerName:       { type: String, default: '' },
  fingerprint:        { type: String, default: '' },
  organizationId:     { type: String, default: 'default' },
  action:             { type: String, required: true },
  performedBy:        { type: mongoose.Schema.Types.ObjectId, default: null },
  performedByName:    { type: String, default: '' },
  performedByUsername:{ type: String, default: '' },
  ipAddress:          { type: String, default: '' },
  note:               { type: String, default: '' },
  statusAfter:        { type: String, default: '' },
  metadata:           { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true, versionKey: false });

const Device       = mongoose.model('Device',         deviceSchema);
const DeviceAuditLog = mongoose.model('DeviceAuditLog', auditSchema);

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Connecting to ${MONGO_URI} …`);
  await mongoose.connect(MONGO_URI);
  console.log('Connected.\n');

  // Show ALL devices first
  const all = await Device.find({}).lean();
  if (all.length === 0) {
    console.log('No devices registered in the database.');
    console.log('Make sure the Device Agent is running and the login page has been visited at least once.');
    await mongoose.disconnect();
    process.exit(0);
  }

  console.log('All registered devices:');
  all.forEach((d, i) => {
    console.log(`  [${i + 1}] status=${d.status.padEnd(9)} name="${d.deviceName}" computer="${d.computerName}" fp=${d.fingerprint.slice(0, 16)}…`);
  });

  // Find pending devices
  const pending = all.filter((d) => d.status === 'pending');
  const approved = all.filter((d) => d.status === 'approved');

  if (approved.length > 0) {
    console.log('\nAt least one device is already approved:');
    approved.forEach((d) => {
      console.log(`  ✓ "${d.deviceName}" approvedByName="${d.approvedByName}" isPrimary=${d.isPrimaryAdminDevice}`);
    });
    console.log('\nBootstrap is not needed. Restart the backend and the login page should work normally.');
    await mongoose.disconnect();
    process.exit(0);
  }

  if (pending.length === 0) {
    console.log('\nNo pending devices found. Nothing to approve.');
    await mongoose.disconnect();
    process.exit(0);
  }

  // Pick the most recently registered pending device
  const target = pending.sort((a, b) => new Date(b.registeredAt) - new Date(a.registeredAt))[0];

  console.log(`\nApproving device as primary admin device:`);
  console.log(`  Name        : ${target.deviceName}`);
  console.log(`  Computer    : ${target.computerName}`);
  console.log(`  OS          : ${target.operatingSystem}`);
  console.log(`  Fingerprint : ${target.fingerprint.slice(0, 16)}…`);
  console.log(`  Registered  : ${target.registeredAt}`);

  const now = new Date();

  await Device.updateOne(
    { _id: target._id },
    {
      $set: {
        status:               'approved',
        isPrimaryAdminDevice: true,
        approvedBy:           null,
        approvedByName:       'SYSTEM_BOOTSTRAP',
        approvedAt:           now,
        lastLoginAt:          now,
      },
      $inc: { loginCount: 1 },
    }
  );

  await DeviceAuditLog.create({
    deviceId:            target._id,
    deviceName:          target.deviceName || '',
    computerName:        target.computerName || '',
    fingerprint:         target.fingerprint || '',
    organizationId:      target.organizationId || 'default',
    action:              'bootstrap_approved',
    performedBy:         null,
    performedByName:     'SYSTEM_BOOTSTRAP',
    performedByUsername: 'system',
    ipAddress:           '',
    note:                'Primary admin device manually seeded via seed-admin-device.mjs script.',
    statusAfter:         'approved',
    metadata: {
      trigger:             'manual_seed',
      isPrimaryAdminDevice: true,
    },
  });

  console.log('\n✓ Device approved as primary admin device.');
  console.log('\nNext steps:');
  console.log('  1. Refresh the SAMS login page at http://localhost:3000/login');
  console.log('  2. The device gate should now show the login form.');
  console.log('  3. Log in with your Super Admin credentials.');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
