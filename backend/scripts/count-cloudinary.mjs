import 'dotenv/config';
import mongoose from 'mongoose';

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

const regPhotos = await db.collection('registrations').countDocuments({
  photoPath: /cloudinary\.com/i,
});
const gate = await db.collection('gatelogs').countDocuments({
  photoPath: /cloudinary\.com/i,
});
const activity = await db.collection('activitysightings').countDocuments({
  photoPath: /cloudinary\.com/i,
});
const passes = await db.collection('passes').countDocuments({
  holderPhotoUrl: /cloudinary\.com/i,
});

const regs = await db
  .collection('registrations')
  .find({ formData: { $exists: true } })
  .project({ formData: 1 })
  .toArray();

let media = 0;
for (const r of regs) {
  for (const v of Object.values(r.formData || {})) {
    const p = typeof v === 'string' ? v : v?.path || v?.url || '';
    if (String(p).includes('cloudinary.com')) media += 1;
  }
}

console.log({ regPhotos, media, gate, activity, passes });
await mongoose.disconnect();
