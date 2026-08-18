const { MongoClient } = require('mongodb');

async function run() {
  const client = new MongoClient('mongodb://localhost:27017');
  try {
    await client.connect();
    const db = client.db('smas');
    
    // Inspect forms
    const forms = await db.collection('registrationforms').find({}).toArray();
    
    forms.forEach(form => {
      console.log(`Form: ${form.title}`);
      form.fields.forEach(f => {
        if (f.label.toLowerCase().includes('batch') || 
            f.label.toLowerCase().includes('labour') || 
            f.label.toLowerCase().includes('work') ||
            f.label.toLowerCase().includes('category')) {
          console.log(`  - Field: ${f.label} (fieldId: ${f.fieldId})`);
        }
      });
    });

    // Inspect one registration to see pay amount
    const reg = await db.collection('registrations').findOne({ formData: { $exists: true } });
    if (reg) {
      console.log('Sample Registration keys:', Object.keys(reg));
      console.log('Sample payAmount:', reg.payAmount);
      console.log('Sample formData keys:', Object.keys(reg.formData));
    }
  } finally {
    await client.close();
  }
}

run().catch(console.error);
