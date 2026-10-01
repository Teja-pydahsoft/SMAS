/**
 * Script to prefill "Pay Category" for Labour registrations with the first option ('Wage').
 *
 * Usage:
 *   Dry run (default):
 *     node scripts/prefillLabourPayCategory.js
 *     or
 *     node scripts/prefillLabourPayCategory.js --dry-run
 *
 *   Execute / Apply changes:
 *     node scripts/prefillLabourPayCategory.js --execute
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import Registration from '../src/models/Registration.js';
import RegistrationForm from '../src/models/RegistrationForm.js';
import Role from '../src/models/Role.js';
import { buildDisplayInfo } from '../src/utils/displayInfo.js';

const args = process.argv.slice(2);
const isExecute = args.includes('--execute') || args.includes('--apply');
const isDryRun = !isExecute || args.includes('--dry-run');

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('Error: MONGODB_URI is not defined in .env');
    process.exit(1);
  }

  console.log('='.repeat(70));
  console.log(`MODE: ${isDryRun ? 'DRY RUN (No database writes)' : 'EXECUTE (Committing changes to database)'}`);
  console.log('='.repeat(70));

  console.log('\nConnecting to MongoDB...');
  await mongoose.connect(uri);
  console.log('Connected to MongoDB.\n');

  try {
    // 1. Find Labour Role
    const labourRole = await Role.findOne({ name: { $regex: /^labour$/i } });
    if (!labourRole) {
      console.error('Error: "Labour" role not found in database.');
      process.exit(1);
    }
    console.log(`Found Labour Role: ID = ${labourRole._id}, Name = "${labourRole.name}"`);

    // 2. Find Labour Registration Form
    const form = await RegistrationForm.findOne({ roleId: labourRole._id, isActive: true });
    if (!form) {
      console.error('Error: Active registration form for Labour role not found.');
      process.exit(1);
    }
    console.log(`Found Labour Registration Form: "${form.title}" (Version: ${form.version})`);

    // 3. Find Pay Category Field
    const payCategoryField = (form.fields || []).find(
      (f) => String(f.label || '').toLowerCase().trim() === 'pay category'
    );
    if (!payCategoryField) {
      console.error('Error: "Pay Category" field not found in Labour registration form.');
      process.exit(1);
    }
    const fieldId = payCategoryField.fieldId;
    const options = payCategoryField.options || [];
    if (!options.length) {
      console.error('Error: "Pay Category" field has no options configured.');
      process.exit(1);
    }

    const firstOption = options[0];
    console.log(`Pay Category Field ID: ${fieldId}`);
    console.log(`Configured Options: ${JSON.stringify(options)}`);
    console.log(`Target Prefill Value (first option): "${firstOption}"\n`);

    // 4. Query all Labour registrations
    const totalCount = await Registration.countDocuments({ roleId: labourRole._id });
    console.log(`Total Labour registrations in database: ${totalCount}`);

    // Break down existing values
    const existingWithValue = await Registration.find({
      roleId: labourRole._id,
      [`formData.${fieldId}`]: { $exists: true, $ne: null, $ne: '' },
    }).select(`registrationCode displayName formData.${fieldId} selections`);

    const valueCounts = {};
    for (const r of existingWithValue) {
      const val = r.formData?.[fieldId] || 'Unknown';
      valueCounts[val] = (valueCounts[val] || 0) + 1;
    }

    console.log(`Registrations with Pay Category already set: ${existingWithValue.length}`);
    for (const [val, count] of Object.entries(valueCounts)) {
      console.log(`  - "${val}": ${count}`);
    }

    // 5. Find registrations missing Pay Category
    const missingQuery = {
      roleId: labourRole._id,
      $or: [
        { [`formData.${fieldId}`]: { $exists: false } },
        { [`formData.${fieldId}`]: null },
        { [`formData.${fieldId}`]: '' },
      ],
    };

    const countNeedingPrefill = await Registration.countDocuments(missingQuery);
    console.log(`\nRegistrations NEEDING prefill: ${countNeedingPrefill}`);

    if (countNeedingPrefill === 0) {
      console.log('\nAll Labour registrations already have a Pay Category set. Nothing to update.');
      process.exit(0);
    }

    // 6. Fetch registrations needing prefill
    const registrationsToUpdate = await Registration.find(missingQuery).select(
      `_id registrationCode displayName displayPhone formData selections`
    );

    // Show sample preview of changes
    console.log('\n' + '-'.repeat(70));
    console.log(`SAMPLE PREVIEWS (First ${Math.min(5, registrationsToUpdate.length)} of ${countNeedingPrefill} records):`);
    console.log('-'.repeat(70));

    const samplePreview = registrationsToUpdate.slice(0, 5);
    for (let i = 0; i < samplePreview.length; i++) {
      const reg = samplePreview[i];
      const updatedFormData = { ...(reg.formData || {}), [fieldId]: firstOption };
      const display = buildDisplayInfo(updatedFormData, form.fields);

      console.log(`[Sample ${i + 1}] ID: ${reg._id}`);
      console.log(`  Code: ${reg.registrationCode || 'N/A'}`);
      console.log(`  Name: ${reg.displayName || 'N/A'}`);
      console.log(`  Current formData[${fieldId}]: ${reg.formData?.[fieldId] ?? '<unset>'}`);
      console.log(`  Updated formData[${fieldId}]: "${firstOption}"`);
      console.log(`  Current selections:`, JSON.stringify(reg.selections || []));
      console.log(`  Updated selections:`, JSON.stringify(display.selections || []));
      console.log('');
    }

    // 7. If DRY RUN: exit with instructions
    if (isDryRun) {
      console.log('='.repeat(70));
      console.log('DRY RUN COMPLETE — SUMMARY:');
      console.log(`- Total Labour records: ${totalCount}`);
      console.log(`- Records already populated: ${existingWithValue.length}`);
      console.log(`- Records to be prefilled with "${firstOption}": ${countNeedingPrefill}`);
      console.log('='.repeat(70));
      console.log('\n>>> NO CHANGES WERE COMMITTED TO THE DATABASE. <<<');
      console.log('To apply these changes, run the script with --execute:');
      console.log('   node scripts/prefillLabourPayCategory.js --execute\n');
      process.exit(0);
    }

    // 8. If EXECUTE: perform bulk updates
    console.log('='.repeat(70));
    console.log(`EXECUTING UPDATES ON ${countNeedingPrefill} RECORDS IN BATCHES...`);
    console.log('='.repeat(70));

    const BATCH_SIZE = 250;
    let totalUpdated = 0;
    const startTime = Date.now();

    for (let i = 0; i < registrationsToUpdate.length; i += BATCH_SIZE) {
      const batch = registrationsToUpdate.slice(i, i + BATCH_SIZE);
      const bulkOps = batch.map((reg) => {
        const updatedFormData = { ...(reg.formData || {}), [fieldId]: firstOption };
        const display = buildDisplayInfo(updatedFormData, form.fields);

        return {
          updateOne: {
            filter: { _id: reg._id },
            update: {
              $set: {
                [`formData.${fieldId}`]: firstOption,
                selections: display.selections || [],
              },
            },
          },
        };
      });

      const result = await Registration.bulkWrite(bulkOps, { ordered: false });
      totalUpdated += result.modifiedCount || 0;
      console.log(`  Processed batch ${Math.floor(i / BATCH_SIZE) + 1}: updated ${result.modifiedCount} records (cumulative: ${totalUpdated}/${countNeedingPrefill})`);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\nBulk update completed in ${duration}s. Total modified: ${totalUpdated}`);

    // 9. Post-execution verification
    console.log('\nRunning post-execution verification...');
    const remainingMissing = await Registration.countDocuments(missingQuery);
    const postCounts = await Registration.aggregate([
      { $match: { roleId: labourRole._id } },
      { $group: { _id: `$formData.${fieldId}`, count: { $sum: 1 } } },
    ]);

    console.log(`Remaining Labour registrations without Pay Category: ${remainingMissing}`);
    console.log('Post-update Pay Category distribution:');
    postCounts.forEach((c) => {
      console.log(`  - "${c._id || '<unset>'}": ${c.count}`);
    });

    console.log('\n' + '='.repeat(70));
    console.log('PREFILL SCRIPT COMPLETED SUCCESSFULLY!');
    console.log('='.repeat(70));
  } catch (err) {
    console.error('Migration failed with error:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

run();
