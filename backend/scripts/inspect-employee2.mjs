import mongoose from 'mongoose';

const uri = 'mongodb+srv://teampydah:TeamPydah@teampydah.y4zj6wh.mongodb.net/SMAS';
await mongoose.connect(uri);
const db = mongoose.connection.db;

const ids = [
  '6a562745bb5aa3b5222daf3b', // WF0009
  '6a57c1e8c87204a1a6778857', // WF0037
  '6a5b0e6f0052430dc9b1a384', // WF0128
].map((s) => new mongoose.Types.ObjectId(s));

const fmt = (d) =>
  new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });

for (const id of ids) {
  const logs = await db
    .collection('gatelogs')
    .find({ registrationId: id })
    .sort({ createdAt: 1 })
    .toArray();
  console.log('\n=== registration', String(id), '— gate logs:', logs.length, '===');
  for (const l of logs) {
    console.log(
      fmt(l.createdAt),
      '|',
      l.scanType,
      l.eventType,
      '| granted:',
      l.accessGranted,
      '| score:',
      l.matchScore?.toFixed?.(3),
      '| meta:',
      JSON.stringify(l.metadata || {}).slice(0, 120)
    );
  }

  const passes = await db
    .collection('passes')
    .find({ registrationId: id })
    .sort({ createdAt: 1 })
    .toArray();
  console.log('--- passes:', passes.length, '---');
  for (const p of passes) {
    console.log(
      fmt(p.createdAt),
      '| validDate:',
      p.validDate,
      '| active:',
      p.isActive,
      '| inside:',
      p.qrPayload?.divisionInside,
      '| code:',
      p.passCode
    );
  }
}

await mongoose.disconnect();
