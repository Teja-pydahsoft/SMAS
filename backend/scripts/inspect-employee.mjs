import mongoose from 'mongoose';

const uri = 'mongodb+srv://teampydah:TeamPydah@teampydah.y4zj6wh.mongodb.net/SMAS';
await mongoose.connect(uri);
const db = mongoose.connection.db;

// Search any string value inside formData for the employee name
const regs = await db
  .collection('registrations')
  .aggregate([
    { $addFields: { fdArr: { $objectToArray: '$formData' } } },
    {
      $match: {
        fdArr: {
          $elemMatch: { v: { $regex: 'VENKATALAKSHMI', $options: 'i' } },
        },
      },
    },
    {
      $project: {
        registrationCode: 1,
        status: 1,
        currentStage: 1,
        createdAt: 1,
        fdArr: {
          $filter: {
            input: '$fdArr',
            as: 'f',
            cond: { $eq: [{ $type: '$$f.v' }, 'string'] },
          },
        },
      },
    },
  ])
  .toArray();

console.log('Matched registrations:', regs.length);
for (const r of regs) {
  const nameFields = r.fdArr
    .filter((f) => /venkatalakshmi|patharapalli/i.test(String(f.v)))
    .map((f) => `${f.k}=${f.v}`);
  console.log({
    id: String(r._id),
    code: r.registrationCode,
    status: r.status,
    stage: r.currentStage,
    createdAt: r.createdAt,
    nameFields,
  });
}

// For each matched registration, count gate logs and passes
for (const r of regs) {
  const logs = await db
    .collection('gatelogs')
    .aggregate([
      { $match: { registrationId: r._id } },
      {
        $group: {
          _id: { scanType: '$scanType', eventType: '$eventType', granted: '$accessGranted' },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ])
    .toArray();
  const passCount = await db.collection('passes').countDocuments({ registrationId: r._id });
  console.log('\n=== Registration', r.registrationCode, String(r._id), '===');
  console.log('Total passes:', passCount);
  console.log('GateLog breakdown:', JSON.stringify(logs, null, 2));
}

await mongoose.disconnect();
