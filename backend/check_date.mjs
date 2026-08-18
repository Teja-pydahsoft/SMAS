import mongoose from 'mongoose';

const MONGODB_URI = 'mongodb+srv://teampydah:TeamPydah@teampydah.y4zj6wh.mongodb.net/SMAS';

async function main() {
  await mongoose.connect(MONGODB_URI);

  const Role = mongoose.model('Role', new mongoose.Schema({ name: String }, { strict: false }), 'roles');
  const RegistrationForm = mongoose.model('RegistrationForm', new mongoose.Schema({ roleId: mongoose.Schema.Types.ObjectId, fields: Array, updatedAt: Date, createdAt: Date }, { strict: false }), 'registrationforms');

  const role = await Role.findOne({ name: /labour/i });
  const form = await RegistrationForm.findOne({ roleId: role._id, isActive: true });
  
  console.log('Created At:', form.createdAt);
  console.log('Updated At:', form.updatedAt);
  
  await mongoose.disconnect();
}

main().catch(console.error);
