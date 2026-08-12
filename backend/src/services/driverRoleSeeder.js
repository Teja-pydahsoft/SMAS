import Role from '../models/Role.js';
import RegistrationForm from '../models/RegistrationForm.js';
import { FIELD_TYPES } from '../constants/index.js';

export async function seedDriverRole() {
  try {
    let driverRole = await Role.findOne({ slug: 'driver' });
    if (!driverRole) {
      driverRole = await Role.create({
        name: 'Driver',
        slug: 'driver',
        description: 'Vehicle Driver',
        isActive: true,
      });
      console.log('Created Driver role');
    }

    const existingForm = await RegistrationForm.findOne({ roleId: driverRole._id });
    if (!existingForm) {
      await RegistrationForm.create({
        roleId: driverRole._id,
        title: 'Driver Registration',
        description: 'Register a new driver',
        fields: [
          { fieldId: 'name', label: 'Full Name', type: 'text', required: true, order: 1 },
          { fieldId: 'mobileNumber', label: 'Mobile Number', type: 'phone', required: true, order: 2 },
          { fieldId: 'thumbId', label: 'Thumb ID', type: 'text', required: false, order: 3 }
        ],
        isActive: true
      });
      console.log('Created Driver registration form');
    }
  } catch (err) {
    console.error('Failed to seed driver role:', err.message);
  }
}
