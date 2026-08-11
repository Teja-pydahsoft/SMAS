import VehicleType from '../models/VehicleType.js';

export async function seedVehicleTypes() {
  const defaultTypes = [
    'Hydra',
    'Bull',
    'Forklift',
    'Tractor',
    'Magic Vehicle',
    'Other Logistics Equipment'
  ];

  try {
    const count = await VehicleType.countDocuments();
    if (count === 0) {
      console.log('Seeding default Vehicle Types...');
      const typesToInsert = defaultTypes.map(name => ({
        name,
        description: `Default system type: ${name}`,
        isActive: true,
        metadata: { isSystem: true }
      }));
      await VehicleType.insertMany(typesToInsert);
      console.log(`Successfully seeded ${defaultTypes.length} default Vehicle Types.`);
    }
  } catch (err) {
    console.error('Error seeding Vehicle Types:', err.message);
  }
}
