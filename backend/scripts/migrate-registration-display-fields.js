import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import Registration from '../src/models/Registration.js';
import RegistrationForm from '../src/models/RegistrationForm.js';
import { buildDisplayInfo } from '../src/utils/displayInfo.js';

async function migrate() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected.');

  console.log('Fetching forms...');
  const forms = await RegistrationForm.find().select('fields');
  const formsById = new Map();
  for (const form of forms) {
    formsById.set(form._id.toString(), form.fields);
  }

  console.log('Fetching registrations...');
  // Find registrations that don't have displayName populated
  const registrations = await Registration.find({ displayName: null });
  console.log(`Found ${registrations.length} registrations to migrate.`);

  let updated = 0;
  for (const reg of registrations) {
    if (!reg.formId) continue;
    const fields = formsById.get(reg.formId.toString());
    if (!fields) continue;

    const display = buildDisplayInfo(reg.formData || {}, fields);
    
    // Use updateOne to bypass mongoose hooks/validation for speed and safety
    await Registration.updateOne(
      { _id: reg._id },
      {
        $set: {
          displayName: display.displayName || null,
          displayPhone: display.displayPhone || null,
          selections: display.selections || [],
        },
      }
    );
    updated++;
    if (updated % 100 === 0) console.log(`Migrated ${updated} / ${registrations.length}`);
  }

  console.log(`Done. Migrated ${updated} registrations.`);
  process.exit(0);
}

migrate().catch(console.error);
