import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import RegistrationForm from '../models/RegistrationForm.js';
import Role from '../models/Role.js';
import Registration from '../models/Registration.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { FIELD_TYPES } from '../constants/index.js';

const router = Router();

function normalizeFields(fields = []) {
  return fields.map((field, index) => ({
    fieldId: field.fieldId || uuidv4(),
    label: field.label,
    type: field.type,
    required: Boolean(field.required),
    unique: Boolean(field.unique),
    placeholder: field.placeholder || '',
    options: field.options || [],
    order: field.order ?? index,
    validation: field.validation || {},
  }));
}

router.get(
  '/role/:roleId',
  asyncHandler(async (req, res) => {
    const form = await RegistrationForm.findOne({ roleId: req.params.roleId }).populate('roleId', 'name slug');
    if (!form) return res.status(404).json({ error: 'Form not found for this role' });
    res.json(form);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const form = await RegistrationForm.findById(req.params.id).populate('roleId', 'name slug');
    if (!form) return res.status(404).json({ error: 'Form not found' });
    res.json(form);
  })
);

router.get(
  '/:id/used-options',
  asyncHandler(async (req, res) => {
    const registrations = await Registration.find({ formId: req.params.id }, 'formData registrationCode');
    const usedOptions = {};

    registrations.forEach(reg => {
      const name = reg.formData?.name || reg.formData?.fullName || reg.formData?.firstName || reg.registrationCode || 'Unknown Person';

      if (reg.formData) {
        Object.entries(reg.formData).forEach(([fieldId, value]) => {
          if (!usedOptions[fieldId]) usedOptions[fieldId] = {};
          
          const values = Array.isArray(value) ? value : [value];
          values.forEach(v => {
            if (v) {
              if (!usedOptions[fieldId][v]) usedOptions[fieldId][v] = [];
              usedOptions[fieldId][v].push({
                id: reg._id,
                name: name,
                code: reg.registrationCode
              });
            }
          });
        });
      }
    });

    res.json(usedOptions);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { roleId, title, description, fields } = req.body;

    const role = await Role.findById(roleId);
    if (!role) return res.status(404).json({ error: 'Role not found' });

    const existing = await RegistrationForm.findOne({ roleId });
    if (existing) {
      return res.status(409).json({ error: 'Form already exists for this role. Use PUT to update.' });
    }

    if (!fields?.length) {
      return res.status(400).json({ error: 'At least one form field is required' });
    }

    for (const field of fields) {
      if (!FIELD_TYPES.includes(field.type)) {
        return res.status(400).json({ error: `Invalid field type: ${field.type}` });
      }
    }

    const form = await RegistrationForm.create({
      roleId,
      title: title || `${role.name} Registration`,
      description,
      fields: normalizeFields(fields),
    });

    res.status(201).json(form);
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { title, description, fields, isActive } = req.body;
    const update = { title, description, isActive };

    if (fields) {
      for (const field of fields) {
        if (!FIELD_TYPES.includes(field.type)) {
          return res.status(400).json({ error: `Invalid field type: ${field.type}` });
        }
      }
      update.fields = normalizeFields(fields);
      update.version = { $inc: 1 };
    }

    const form = await RegistrationForm.findById(req.params.id);
    if (!form) return res.status(404).json({ error: 'Form not found' });

    if (fields) {
      form.fields = normalizeFields(fields);
      form.version += 1;
    }
    if (title !== undefined) form.title = title;
    if (description !== undefined) form.description = description;
    if (isActive !== undefined) form.isActive = isActive;

    await form.save();
    res.json(form);
  })
);

router.post(
  '/:id/migrate-option',
  asyncHandler(async (req, res) => {
    const { fieldId, oldValue, newValue } = req.body;
    
    if (!fieldId || oldValue === undefined) {
      return res.status(400).json({ error: 'Missing fieldId or oldValue' });
    }

    const registrations = await Registration.find({ formId: req.params.id }, 'formData');
    let updatedCount = 0;

    for (const reg of registrations) {
      if (reg.formData && reg.formData[fieldId] !== undefined) {
        let changed = false;
        const val = reg.formData[fieldId];

        if (Array.isArray(val)) {
          if (val.includes(oldValue)) {
            reg.formData[fieldId] = val.filter(v => v !== oldValue);
            if (newValue && !reg.formData[fieldId].includes(newValue)) {
              reg.formData[fieldId].push(newValue);
            }
            changed = true;
          }
        } else if (val === oldValue) {
          reg.formData[fieldId] = newValue || '';
          changed = true;
        }

        if (changed) {
          reg.markModified('formData');
          await reg.save();
          updatedCount++;
        }
      }
    }

    res.json({ message: 'Migration successful', updatedCount });
  })
);

export default router;
