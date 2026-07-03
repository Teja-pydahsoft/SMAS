import Department from '../models/Department.js';

/**
 * Migrate legacy single divisionId field to divisionIds array.
 */
export async function migrateDepartmentsToMultiDivision() {
  const legacy = await Department.collection
    .find({ divisionId: { $exists: true, $ne: null } })
    .toArray();

  if (legacy.length === 0) return { migrated: 0 };

  let migrated = 0;
  for (const doc of legacy) {
    const divisionIds =
      Array.isArray(doc.divisionIds) && doc.divisionIds.length > 0
        ? doc.divisionIds
        : [doc.divisionId];

    await Department.collection.updateOne(
      { _id: doc._id },
      { $set: { divisionIds }, $unset: { divisionId: '' } }
    );
    migrated += 1;
  }

  try {
    await Department.collection.dropIndex('divisionId_1_slug_1');
  } catch {
    // Index may not exist
  }
  try {
    await Department.collection.dropIndex('divisionId_1_isActive_1');
  } catch {
    // Index may not exist
  }

  return { migrated };
}
