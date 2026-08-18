import express from 'express';
import mongoose from 'mongoose';
import RateMaster from '../models/RateMaster.js';
import RateMasterAuditLog from '../models/RateMasterAuditLog.js';
import Registration from '../models/Registration.js';
import RegistrationForm from '../models/RegistrationForm.js';
import Role from '../models/Role.js';
import PaySlip from '../models/PaySlip.js';
import AttendanceOverride from '../models/AttendanceOverride.js';
import AttendanceOverrideAuditLog from '../models/AttendanceOverrideAuditLog.js';
import { buildDisplayInfo } from '../utils/displayInfo.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import {
  buildLockedDateSet,
  isRangeFullyLocked,
  overlappingLockedSlipFilter,
} from '../utils/paySlipLock.js';
import { getRegistrationReport } from '../services/registrationReportService.js';

const router = express.Router();

function formValueByLabels(formData, fields, labels) {
  const wanted = labels.map((label) => label.toLowerCase());
  for (const field of fields || []) {
    const label = String(field.label || '').toLowerCase().trim();
    if (!wanted.some((wantedLabel) => label === wantedLabel || label.includes(wantedLabel))) continue;
    const value = formData?.[field.fieldId];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return '';
}

/**
 * Helper to fetch the Labour form and resolve field IDs for Batch and Work Category.
 */
async function resolveLabourFields() {
  // Try finding role by name 'Labour'
  const role = await Role.findOne({ name: /labour/i });
  if (!role) {
    throw new Error('Labour role not found');
  }

  const form = await RegistrationForm.findOne({ roleId: role._id, isActive: true });
  if (!form) {
    throw new Error('Active Labour form not found');
  }

  let batchFieldId = null;
  let workCategoryFieldId = null;
  let labourTypeFieldId = null;

  for (const field of form.fields) {
    const labelLower = field.label.toLowerCase();
    if (labelLower === 'batch' || labelLower === 'batch name') {
      batchFieldId = field.fieldId;
    }
    if (labelLower === 'work category') {
      workCategoryFieldId = field.fieldId;
    }
    if (labelLower === 'labour type') {
      labourTypeFieldId = field.fieldId;
    }
  }

  if (!batchFieldId || !workCategoryFieldId || !labourTypeFieldId) {
    throw new Error('Could not resolve Batch, Work Category, or Labour Type fields in Labour form');
  }

  return { batchFieldId, workCategoryFieldId, labourTypeFieldId, roleId: role._id, fields: form.fields || [] };
}

function isBlankFormValue(value) {
  return value == null || String(value).trim() === '';
}

function labourerDisplayName(reg, fields = []) {
  const display = buildDisplayInfo(reg.formData || {}, fields);
  return display.displayName
    || String(reg.formData?.Name || reg.formData?.['Full Name'] || '').trim()
    || reg.registrationCode
    || 'Unknown';
}

/**
 * Builds the MongoDB query to find matching registrations based on a rule.
 */
function buildMatchingQuery(rule, batchFieldId, workCategoryFieldId, labourTypeFieldId, roleId) {
  const query = {
    roleId,
    [`formData.${labourTypeFieldId}`]: rule.labourType
  };

  return query;
}

// GET /api/payroll/rate-master/combinations
router.get('/rate-master/combinations', authenticate, requirePermission('payroll_rate_master', 'read'), async (req, res) => {
  try {
    const { batchFieldId, workCategoryFieldId, labourTypeFieldId, roleId, fields } = await resolveLabourFields();

    const registrations = await Registration.find({ roleId })
      .select('registrationCode formData payAmount workingHours')
      .lean();

    const comboCounts = new Map();
    const notApplicableLabourers = [];
    const applicableLabourers = [];

    for (const reg of registrations) {
      const batchName = String(reg.formData?.[batchFieldId] ?? '').trim();
      const labourType = String(reg.formData?.[labourTypeFieldId] ?? '').trim();
      const workCategory = String(reg.formData?.[workCategoryFieldId] ?? '').trim();
      const missing = [];
      if (isBlankFormValue(batchName)) missing.push('Batch');
      if (isBlankFormValue(labourType)) missing.push('Labour Type');
      if (isBlankFormValue(workCategory)) missing.push('Work Category');

      const baseLabourer = {
        id: String(reg._id),
        name: labourerDisplayName(reg, fields),
        code: reg.registrationCode || 'Unknown',
        batchName: batchName || '',
        labourType: labourType || '',
        workCategory: workCategory || '',
        payAmount: Number(reg.payAmount || 0),
        workingHours: Number(reg.workingHours || 0)
      };

      if (missing.length) {
        notApplicableLabourers.push({ ...baseLabourer, missing });
        continue;
      }

      applicableLabourers.push(baseLabourer);

      const key = `${batchName}|${labourType}|${workCategory}`;
      const existing = comboCounts.get(key);
      if (existing) {
        existing.labourCount += 1;
      } else {
        comboCounts.set(key, { batchName, labourType, workCategory, labourCount: 1 });
      }
    }

    const formattedCombinations = [];
    for (const combo of comboCounts.values()) {
      const mostRecentRM = await RateMaster.findOne({
        status: 'Applied',
        'rules.batchName': combo.batchName,
        'rules.labourType': combo.labourType,
        'rules.workCategory': combo.workCategory
      }).sort({ appliedAt: -1, createdAt: -1 });

      let currentRate = 0;
      let currentHours = 0;
      if (mostRecentRM) {
        const matchedRule = mostRecentRM.rules.find((r) =>
          r.batchName === combo.batchName &&
          r.labourType === combo.labourType &&
          r.workCategory === combo.workCategory
        );
        if (matchedRule) {
          currentRate = matchedRule.amount;
          currentHours = matchedRule.hours;
        }
      }

      formattedCombinations.push({
        ...combo,
        currentRate,
        currentHours
      });
    }

    formattedCombinations.sort((a, b) => {
      if (a.batchName !== b.batchName) return a.batchName.localeCompare(b.batchName);
      if (a.labourType !== b.labourType) return a.labourType.localeCompare(b.labourType);
      return a.workCategory.localeCompare(b.workCategory);
    });

    notApplicableLabourers.sort((a, b) => {
      const nameCmp = String(a.name || '').localeCompare(String(b.name || ''));
      if (nameCmp !== 0) return nameCmp;
      return String(a.code || '').localeCompare(String(b.code || ''));
    });

    const rateByKey = new Map();
    for (const combo of formattedCombinations) {
      rateByKey.set(`${combo.batchName}|${combo.labourType}|${combo.workCategory}`, combo);
    }
    for (const labourer of applicableLabourers) {
      const combo = rateByKey.get(`${labourer.batchName}|${labourer.labourType}|${labourer.workCategory}`);
      labourer.currentRate = combo?.currentRate || labourer.payAmount || 0;
      labourer.currentHours = combo?.currentHours || labourer.workingHours || 0;
    }
    applicableLabourers.sort((a, b) => {
      const nameCmp = String(a.name || '').localeCompare(String(b.name || ''));
      if (nameCmp !== 0) return nameCmp;
      return String(a.code || '').localeCompare(String(b.code || ''));
    });

    res.json({
      combinations: formattedCombinations,
      applicableLabourers,
      notApplicableLabourers
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/payroll/rate-master
router.get('/rate-master', authenticate, requirePermission('payroll_rate_master', 'read'), async (req, res) => {
  try {
    const rateMasters = await RateMaster.find().sort({ createdAt: -1 });
    res.json(rateMasters);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/payroll/rate-master/preview
router.post('/rate-master/preview', authenticate, requirePermission('payroll_rate_master', 'write'), async (req, res) => {
  try {
    const { rules } = req.body;
    if (!rules || !Array.isArray(rules)) {
      return res.status(400).json({ error: 'Rules array is required' });
    }

    for (const rule of rules) {
      if (rule.amount == null || rule.amount <= 0) {
        return res.status(400).json({ error: `Invalid rate amount (${rule.amount}) for combination: ${rule.batchName} - ${rule.labourType} - ${rule.workCategory}. Amount must be greater than 0.` });
      }
      if (rule.hours == null || rule.hours <= 0) {
        return res.status(400).json({ error: `Invalid working hours (${rule.hours}) for combination: ${rule.batchName} - ${rule.labourType} - ${rule.workCategory}. Hours must be greater than 0.` });
      }
    }

    const { batchFieldId, workCategoryFieldId, roleId } = await resolveLabourFields();
    
    const affectedLabourers = [];
    let affectedCount = 0;

    for (const rule of rules) {
      const query = buildMatchingQuery(rule, batchFieldId, workCategoryFieldId, roleId);
      const matches = await Registration.find(query).select('registrationCode formData payAmount payFrequency gender workingHours');
      
      for (const match of matches) {
        affectedLabourers.push({
          id: match._id,
          name: match.formData?.['Name'] || match.formData?.['Full Name'] || match.registrationCode || 'Unknown',
          code: match.registrationCode,
          batch: match.formData?.[batchFieldId],
          workCategory: match.formData?.[workCategoryFieldId],
          labourType: rule.labourType,
          oldRate: match.payAmount || 0,
          newRate: rule.amount,
          oldHours: match.workingHours || 0,
          newHours: rule.hours,
          difference: rule.amount - (match.payAmount || 0)
        });
      }
    }

    res.json({
      affectedCount: affectedLabourers.length,
      affectedLabourers
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/payroll/rate-master/:id/apply
router.post('/rate-master/:id/apply', authenticate, requirePermission('payroll_rate_master', 'write'), async (req, res) => {
  // Use session for transaction if replica set allows
  const session = await mongoose.startSession();
  
  try {
    let transactionResult = null;
    let fallbackExecuted = false;

    // We will attempt transaction. If Mongo is standalone, transaction fails, we fallback to non-transaction.
    const applyLogic = async (sess) => {
      const rm = await RateMaster.findById(req.params.id).session(sess);
      if (!rm) throw new Error('Rate Master not found');

      const { batchFieldId, workCategoryFieldId, labourTypeFieldId, roleId } = await resolveLabourFields();

      // Check unique combinations
      const combos = new Set();
      for (const rule of rm.rules) {
        const key = `${rule.batchName}|${rule.labourType}|${rule.workCategory}`;
        if (combos.has(key)) {
          throw new Error(`Duplicate rule detected: ${key}`);
        }
        combos.add(key);
      }

      let affectedCount = 0;
      const opts = sess ? { session: sess } : {};

      for (const rule of rm.rules) {
        const query = buildMatchingQuery(rule, batchFieldId, workCategoryFieldId, labourTypeFieldId, roleId);
        const matches = await Registration.find(query).session(sess);
        
        for (const match of matches) {
          const oldAmount = match.payAmount || 0;
          const oldHours = match.workingHours || 0;
          
          if (oldAmount === rule.amount && oldHours === rule.hours && match.shiftId === null) continue;

          match.payAmount = rule.amount;
          match.workingHours = rule.hours;
          match.shiftId = null; // Decouple from shift
          await match.save(opts);
          
          const audit = new RateMasterAuditLog({
            registrationId: match._id,
            rateMasterId: rm._id,
            rateMasterDocNo: rm.docNo,
            oldPayAmount: oldAmount,
            newPayAmount: rule.amount,
            oldHours: oldHours,
            newHours: rule.hours,
            effectiveDate: rm.effectiveDate,
            appliedBy: req.user.username || req.user.email
          });
          await audit.save(opts);
          affectedCount++;
        }
      }

      rm.status = 'Applied';
      rm.appliedBy = req.user.username || req.user.email;
      rm.appliedAt = new Date();
      await rm.save(opts);

      return { success: true, affectedCount };
    };

    try {
      session.startTransaction();
      transactionResult = await applyLogic(session);
      await session.commitTransaction();
    } catch (txError) {
      if (txError.message.includes('Transaction') || txError.message.includes('replica set')) {
        // Fallback for standalone mongo
        fallbackExecuted = true;
      } else {
        await session.abortTransaction();
        throw txError;
      }
    } finally {
      session.endSession();
    }

    if (fallbackExecuted) {
      transactionResult = await applyLogic(null);
    }

    res.json(transactionResult);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/payroll/rate-master
router.post('/rate-master', authenticate, requirePermission('payroll_rate_master', 'write'), async (req, res) => {
  try {
    const { docNo, effectiveDate, rules } = req.body;
    
    // Validate rules uniqueness and amount
    const combos = new Set();
    for (const rule of rules) {
      if (rule.amount == null || rule.amount <= 0) {
        return res.status(400).json({ error: `Invalid rate amount (${rule.amount}) for combination: ${rule.batchName} - ${rule.labourType} - ${rule.workCategory}. Amount must be greater than 0.` });
      }
      if (rule.hours == null || rule.hours <= 0) {
        return res.status(400).json({ error: `Invalid working hours (${rule.hours}) for combination: ${rule.batchName} - ${rule.labourType} - ${rule.workCategory}. Hours must be greater than 0.` });
      }

      const key = `${rule.batchName}|${rule.labourType}|${rule.workCategory}`;
      if (combos.has(key)) {
        return res.status(400).json({ error: `Duplicate rule combination detected: ${rule.batchName} - ${rule.labourType} - ${rule.workCategory}` });
      }
      combos.add(key);
    }

    const rm = new RateMaster({
      docNo,
      effectiveDate,
      rules,
      status: 'Draft'
    });
    
    await rm.save();
    res.json(rm);
  } catch (error) {
    // Check for duplicate docNo
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Doc No already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/payroll/rate-master/:id
router.put('/rate-master/:id', authenticate, requirePermission('payroll_rate_master', 'write'), async (req, res) => {
  try {
    const { docNo, effectiveDate, rules } = req.body;
    
    const rm = await RateMaster.findById(req.params.id);
    if (!rm) return res.status(404).json({ error: 'Rate Master not found' });
    
    // Validate rules uniqueness and amount
    const combos = new Set();
    for (const rule of rules) {
      if (rule.amount == null || rule.amount <= 0) {
        return res.status(400).json({ error: `Invalid rate amount (${rule.amount}) for combination: ${rule.batchName} - ${rule.labourType} - ${rule.workCategory}. Amount must be greater than 0.` });
      }
      if (rule.hours == null || rule.hours <= 0) {
        return res.status(400).json({ error: `Invalid working hours (${rule.hours}) for combination: ${rule.batchName} - ${rule.labourType} - ${rule.workCategory}. Hours must be greater than 0.` });
      }

      const key = `${rule.batchName}|${rule.labourType}|${rule.workCategory}`;
      if (combos.has(key)) {
        return res.status(400).json({ error: `Duplicate rule combination detected: ${rule.batchName} - ${rule.labourType} - ${rule.workCategory}` });
      }
      combos.add(key);
    }

    if (docNo) rm.docNo = docNo;
    if (effectiveDate) rm.effectiveDate = effectiveDate;
    if (rules) rm.rules = rules;
    
    await rm.save();
    res.json(rm);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Doc No already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

// GET /api/payroll/rate-master/:id/view
router.get('/rate-master/:id/view', authenticate, requirePermission('payroll_rate_master', 'read'), async (req, res) => {
  try {
    const rm = await RateMaster.findById(req.params.id);
    if (!rm) return res.status(404).json({ error: 'Rate Master not found' });

    let batchFieldId = 'Batch Name';
    let workCategoryFieldId = 'Work Category';
    let labourTypeFieldId = 'Labour Type';
    try {
      const fields = await resolveLabourFields();
      batchFieldId = fields.batchFieldId;
      workCategoryFieldId = fields.workCategoryFieldId;
      labourTypeFieldId = fields.labourTypeFieldId;
    } catch (e) {
      // ignore, fallback to default keys
    }

    const auditLogs = await RateMasterAuditLog.find({ rateMasterId: rm._id }).populate({
      path: 'registrationId',
      select: 'registrationCode formData payFrequency gender'
    });

    const affectedLabourers = auditLogs.reduce((acc, log) => {
      const reg = log.registrationId || {};
      
      if (!reg.formData || !reg.formData[batchFieldId] || !reg.formData[workCategoryFieldId] || !reg.formData[labourTypeFieldId]) {
        return acc; // Registration is missing required fields, ignore
      }

      const batchName = reg.formData[batchFieldId];
      const workCategory = reg.formData[workCategoryFieldId];
      const labourType = reg.formData[labourTypeFieldId];

      acc.push({
        id: reg._id || log._id,
        name: reg.formData?.['Name'] || reg.formData?.['Full Name'] || reg.registrationCode || 'Unknown',
        code: reg.registrationCode || 'Unknown',
        batch: reg.formData?.[batchFieldId] || 'Unknown',
        workCategory: reg.formData?.[workCategoryFieldId] || 'Unknown',
        labourType,
        oldRate: log.oldPayAmount || 0,
        newRate: log.newPayAmount || 0,
        oldHours: log.oldHours || 0,
        newHours: log.newHours || 0
      });

      return acc;
    }, []);

    res.json({
      rateMaster: rm,
      affectedLabourers
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- NEW RATE MASTER LABOURERS LIST ---
router.get('/rate-master/labourers', authenticate, requirePermission('payroll_rate_master', 'read'), async (req, res) => {
  try {
    const { batchFieldId, workCategoryFieldId, labourTypeFieldId } = await resolveLabourFields();
    if (!batchFieldId || !workCategoryFieldId || !labourTypeFieldId) {
      return res.json([]);
    }
    
    // Fetch all active labourers
    const registrations = await Registration.find({ 'roleId': { $ne: null } })
      .populate('roleId')
      .populate('formId', 'fields');
    const labourers = registrations.filter(r => r.roleId && r.roleId.name.match(/labour/i));
    
    // Also fetch their active locked pay slips
    const lockedPaySlips = await PaySlip.find({ status: 'Locked', registrationId: { $in: labourers.map(l => l._id) } }).lean();
    
    const result = labourers.map(reg => {
      const locks = lockedPaySlips.filter(p => p.registrationId.toString() === reg._id.toString());
      const display = buildDisplayInfo(reg.formData || {}, reg.formId?.fields || []);
      return {
        id: reg._id,
        name: display.displayName || reg.registrationCode || 'Unknown',
        code: reg.registrationCode || 'Unknown',
        photoPath: reg.photoPath || null,
        batchName: reg.formData?.[batchFieldId] || '-',
        workCategory: reg.formData?.[workCategoryFieldId] || '-',
        labourType: reg.formData?.[labourTypeFieldId] || '-',
        workingHours: reg.workingHours,
        payAmount: reg.payAmount,
        locks: locks.map(l => ({ id: l._id, fromDate: l.fromDate, toDate: l.toDate, totalHours: l.totalHours, amount: l.amount }))
      };
    });
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- PAY SLIP GENERATION & LOCKING ---

// Generate Pay Slips
router.post('/pay-slips/generate', authenticate, requirePermission('payroll_rate_master', 'write'), async (req, res) => {
  try {
    const { fromDate, toDate, registrations } = req.body;
    if (!fromDate || !toDate || !Array.isArray(registrations)) {
      return res.status(400).json({ error: 'fromDate, toDate, and registrations array are required.' });
    }

    const registrationIds = registrations
      .map((reg) => reg?.registrationId)
      .filter(Boolean);

    const existingLocked = await PaySlip.find(
      overlappingLockedSlipFilter(registrationIds, fromDate, toDate)
    )
      .select({ registrationId: 1, fromDate: 1, toDate: 1 })
      .lean();

    const slipsByReg = new Map();
    for (const slip of existingLocked) {
      const id = String(slip.registrationId);
      if (!slipsByReg.has(id)) slipsByReg.set(id, []);
      slipsByReg.get(id).push(slip);
    }

    const fullyLockedIdSet = new Set();
    let overlappingLockedCount = 0;
    for (const [id, slips] of slipsByReg) {
      const lockedDates = buildLockedDateSet(slips, fromDate, toDate);
      if (isRangeFullyLocked(lockedDates, fromDate, toDate)) {
        fullyLockedIdSet.add(id);
      } else if (lockedDates.size > 0) {
        overlappingLockedCount += 1;
      }
    }

    const registrationsToGenerate = registrations.filter(
      (reg) => reg?.registrationId && !fullyLockedIdSet.has(String(reg.registrationId))
    );

    for (const reg of registrationsToGenerate) {
      await PaySlip.updateOne(
        { registrationId: reg.registrationId, fromDate, toDate },
        {
          $set: {
            totalHours: reg.totalHours || 0,
            amount: reg.amount || 0,
            status: 'Locked',
            generatedBy: req.user._id
          }
        },
        { upsert: true }
      );
    }

    const skippedCount = registrations.length - registrationsToGenerate.length;

    if (registrationsToGenerate.length === 0) {
      return res.status(409).json({
        error: 'Pay slip already generated and locked for the selected period (or overlapping locked days cover the whole range).',
        generatedCount: 0,
        skippedCount,
      });
    }

    const overlapNote = overlappingLockedCount > 0
      ? ` Locked days from earlier slips were excluded for ${overlappingLockedCount} ${overlappingLockedCount === 1 ? 'person' : 'people'}.`
      : '';

    const message = skippedCount > 0
      ? `Generated and locked pay slips for ${registrationsToGenerate.length} registrations. Skipped ${skippedCount} already fully locked for this period.${overlapNote}`
      : `Generated and locked pay slips for ${registrationsToGenerate.length} registrations.${overlapNote}`;

    res.json({
      success: true,
      message,
      generatedCount: registrationsToGenerate.length,
      skippedCount,
      overlappingLockedCount,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Unlock Pay Slip
router.post('/pay-slips/:id/unlock', authenticate, requirePermission('system_access', 'write'), async (req, res) => {
  try {
    // Only super admin level access (or explicit permission) can unlock
    const paySlip = await PaySlip.findByIdAndUpdate(req.params.id, { status: 'Unlocked' }, { new: true });
    if (!paySlip) {
      return res.status(404).json({ error: 'Pay slip not found.' });
    }
    res.json({ success: true, paySlip });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function dayPayAmount(rate, day) {
  if (rate == null || Number.isNaN(Number(rate)) || !day || day.status === 'blank') return null;
  const factor = typeof day.payFactor === 'number' ? day.payFactor : 0;
  return Math.round(Number(rate) * factor * 100) / 100;
}

// Day-by-day details for one generated pay slip
router.get('/pay-slips/:id/details', authenticate, requirePermission('payroll_rate_master', 'read'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid pay slip id.' });
    }

    const paySlip = await PaySlip.findById(req.params.id)
      .populate({
        path: 'registrationId',
        select: 'formData registrationCode formId photoPath payAmount workingHours',
        populate: { path: 'formId', select: 'fields' },
      })
      .populate('generatedBy', 'name username')
      .lean();

    if (!paySlip) {
      return res.status(404).json({ error: 'Pay slip not found.' });
    }

    const registrationId = paySlip.registrationId?._id || paySlip.registrationId;
    const report = await getRegistrationReport(String(registrationId), {
      dateFrom: paySlip.fromDate,
      dateTo: paySlip.toDate,
    });
    const rate = report?.details?.payAmount ?? paySlip.registrationId?.payAmount ?? null;
    const days = (report?.attendanceRange?.days || [])
      .filter((day) => day.status !== 'blank')
      .map((day) => ({
        date: day.date,
        status: day.status,
        code: day.code,
        label: day.label,
        checkIn: day.checkIn || null,
        lastActivityAt: day.lastActivityAt || null,
        lastActivityType: day.lastActivityType || null,
        activityHours: day.activityHours ?? null,
        shiftName: day.shiftName || null,
        shiftStartTime: day.shiftStartTime || null,
        shiftEndTime: day.shiftEndTime || null,
        shiftTotalHours: day.shiftTotalHours ?? null,
        payFactor: typeof day.payFactor === 'number' ? day.payFactor : 0,
        amount: dayPayAmount(rate, day),
      }));

    const display = buildDisplayInfo(
      paySlip.registrationId?.formData || {},
      paySlip.registrationId?.formId?.fields || []
    );
    const formData = paySlip.registrationId?.formData || {};
    const fields = paySlip.registrationId?.formId?.fields || [];
    let batchName = formValueByLabels(formData, fields, ['batch', 'batch name']);
    let workCategory = formValueByLabels(formData, fields, ['work category', 'category', 'department', 'section']);
    let labourType = formValueByLabels(formData, fields, ['labour type', 'labor type']);
    try {
      const labourFields = await resolveLabourFields();
      if (labourFields.batchFieldId && formData[labourFields.batchFieldId]) {
        batchName = String(formData[labourFields.batchFieldId]);
      }
      if (labourFields.workCategoryFieldId && formData[labourFields.workCategoryFieldId]) {
        workCategory = String(formData[labourFields.workCategoryFieldId]);
      }
      if (labourFields.labourTypeFieldId && formData[labourFields.labourTypeFieldId]) {
        labourType = String(formData[labourFields.labourTypeFieldId]);
      }
    } catch {
      // Non-labour roles still print with form labels above.
    }
    const village =
      formValueByLabels(formData, fields, ['village', 'villege', 'gram', 'colony', 'area']) ||
      batchName ||
      '';
    const paymentDays =
      report?.attendanceRange?.payment?.paymentDays ??
      report?.attendanceRange?.summary?.present ??
      0;

    res.json({
      paySlip: {
        id: paySlip._id,
        fromDate: paySlip.fromDate,
        toDate: paySlip.toDate,
        totalHours: paySlip.totalHours,
        amount: paySlip.amount,
        status: paySlip.status,
        createdAt: paySlip.createdAt,
        generatedByName: paySlip.generatedBy?.name || paySlip.generatedBy?.username || null,
      },
      labourer: {
        id: String(registrationId),
        name: display.displayName || paySlip.registrationId?.registrationCode || 'Unknown',
        code: paySlip.registrationId?.registrationCode || 'Unknown',
        photoPath: paySlip.registrationId?.photoPath || null,
        payAmount: rate,
        village,
        batchName: batchName || '',
        workCategory: workCategory || '',
        labourType: labourType || '',
      },
      days,
      summary: report?.attendanceRange?.summary || null,
      paymentDays,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get generated pay slips
router.get('/pay-slips', authenticate, requirePermission('payroll_rate_master', 'read'), async (req, res) => {
  try {
    const { fromDate, toDate, registrationId } = req.query;
    
    let query = {};
    if (fromDate && toDate) {
      query.fromDate = { $lte: toDate };
      query.toDate = { $gte: fromDate };
    }
    
    if (registrationId) {
      query.registrationId = registrationId;
    }
    
    const paySlips = await PaySlip.find(query)
      .populate({
        path: 'registrationId',
        select: 'formData registrationCode formId',
        populate: { path: 'formId', select: 'fields' },
      })
      .sort({ createdAt: -1 })
      .lean();
      
    res.json(paySlips.map(ps => ({
      ...ps,
      registrationName:
        buildDisplayInfo(
          ps.registrationId?.formData || {},
          ps.registrationId?.formId?.fields || []
        ).displayName ||
        ps.registrationId?.registrationCode ||
        'Unknown',
      registrationCode: ps.registrationId?.registrationCode || 'Unknown'
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/attendance-change-history', authenticate, requirePermission('payroll_rate_master', 'read'), async (req, res) => {
  try {
    const { search = '', dateFrom = '', dateTo = '', batch = '', limit = 200 } = req.query;
    const { batchFieldId } = await resolveLabourFields();
    const query = {};
    if (dateFrom && dateTo) {
      query.date = { $gte: dateFrom, $lte: dateTo };
    } else if (dateFrom) {
      query.date = { $gte: dateFrom };
    } else if (dateTo) {
      query.date = { $lte: dateTo };
    }

    const logs = await AttendanceOverrideAuditLog.find(query)
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(limit) || 200, 1000))
      .populate({
        path: 'registrationId',
        select: 'formData registrationCode formId photoPath',
        populate: { path: 'formId', select: 'fields' },
      })
      .lean();

    const currentOverrides = await AttendanceOverride.find(query)
      .sort({ updatedAt: -1 })
      .limit(Math.min(Number(limit) || 200, 1000))
      .populate({
        path: 'registrationId',
        select: 'formData registrationCode formId photoPath',
        populate: { path: 'formId', select: 'fields' },
      })
      .lean();

    const normalizedSearch = String(search || '').trim().toLowerCase();
    const auditRows = logs
      .map((log) => {
        const display = buildDisplayInfo(
          log.registrationId?.formData || {},
          log.registrationId?.formId?.fields || []
        );
        return {
          id: log._id,
          registrationId: log.registrationId?._id || null,
          employeeName: display.displayName || log.registrationId?.registrationCode || 'Unknown',
          registrationCode: log.registrationId?.registrationCode || 'Unknown',
          photoPath: log.registrationId?.photoPath || null,
          batchName: batchFieldId ? (log.registrationId?.formData?.[batchFieldId] || '-') : '-',
          date: log.date,
          action: log.action,
          previousStatus: log.previousStatus || 'AUTO',
          previousNote: log.previousNote || '',
          nextStatus: log.nextStatus || 'AUTO',
          nextNote: log.nextNote || '',
          changedByName: log.changedByName || 'System',
          createdAt: log.createdAt,
          source: 'audit',
        };
      });

    const auditKeys = new Set(auditRows.map((row) => `${row.registrationId || ''}|${row.date}`));

    const currentRows = currentOverrides
      .map((row) => {
        const display = buildDisplayInfo(
          row.registrationId?.formData || {},
          row.registrationId?.formId?.fields || []
        );
        return {
          id: `current-${row._id}`,
          registrationId: row.registrationId?._id || null,
          employeeName: display.displayName || row.registrationId?.registrationCode || 'Unknown',
          registrationCode: row.registrationId?.registrationCode || 'Unknown',
          photoPath: row.registrationId?.photoPath || null,
          batchName: batchFieldId ? (row.registrationId?.formData?.[batchFieldId] || '-') : '-',
          date: row.date,
          action: 'set',
          previousStatus: '',
          previousNote: '',
          nextStatus: row.status || 'AUTO',
          nextNote: row.note || '',
          changedByName: row.updatedByName || 'System',
          createdAt: row.updatedAt || row.createdAt,
          source: 'current',
        };
      })
      .filter((row) => !auditKeys.has(`${row.registrationId || ''}|${row.date}`));

    const rows = [...auditRows, ...currentRows]
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .filter((row) => {
        if (batch && row.batchName !== batch) return false;
        if (!normalizedSearch) return true;
        return (
          row.employeeName.toLowerCase().includes(normalizedSearch) ||
          row.registrationCode.toLowerCase().includes(normalizedSearch) ||
          row.changedByName.toLowerCase().includes(normalizedSearch) ||
          row.date.includes(normalizedSearch)
        );
      });

    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
