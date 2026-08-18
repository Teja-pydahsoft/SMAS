import { Router } from 'express';
import mongoose from 'mongoose';
import Registration from '../models/Registration.js';
import GateLog from '../models/GateLog.js';
import Pass from '../models/Pass.js';
import RegistrationForm from '../models/RegistrationForm.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { GATE_EVENT_TYPES } from '../constants/index.js';
import { grantedGateLogFilter } from '../utils/gateLogFilters.js';
import { IST_OFFSET, todayDateStringIst } from '../utils/istTime.js';

const router = Router();
const DAY_LABELS = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

const SERIES_COLORS = [
  '#2563EB', // Blue
  '#22C55E', // Green
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#8B5CF6', // Purple
  '#06B6D4', // Cyan
  '#EC4899', // Pink
  '#10B981', // Emerald
  '#F43F5E', // Rose
  '#6366F1'  // Indigo
];

function calendarDate(date) {
  return date.toISOString().slice(0, 10);
}

function addCalendarDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return calendarDate(date);
}

function istDateStart(dateString) {
  return new Date(`${dateString}T00:00:00.000${IST_OFFSET}`);
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const todayKey = todayDateStringIst();
    const todayCalendar = new Date(`${todayKey}T00:00:00.000Z`);
    const dayOfWeek = todayCalendar.getUTCDay();
    const daysSinceSaturday = (dayOfWeek + 1) % 7;
    const weekStartKey = addCalendarDays(todayKey, -daysSinceSaturday);
    const weekEndKey = addCalendarDays(weekStartKey, 7);
    const weekStart = istDateStart(weekStartKey);
    const weekEnd = istDateStart(weekEndKey);

    const { roleIds } = req.query;

    // 1. Resolve role ID filter
    let roleIdFilter = {};
    if (roleIds && roleIds.trim()) {
      roleIdFilter = { roleId: { $in: roleIds.split(',').filter(Boolean).map(id => new mongoose.Types.ObjectId(id)) } };
    }

    // 2. Fetch RegistrationForms for dynamic fields mapping
    const forms = await RegistrationForm.find();
    const batchFields = [];
    const labourTypeFields = [];
    forms.forEach(form => {
      form.fields.forEach(field => {
        if (field.label && field.label.toLowerCase() === 'batch') {
          batchFields.push(field.fieldId);
        }
        if (field.label && field.label.toLowerCase() === 'labour type') {
          labourTypeFields.push(field.fieldId);
        }
      });
    });

    // 3. Find matching registrations in roleIdFilter
    const matchingRegs = await Registration.find(roleIdFilter)
      .select('_id roleId formData status createdAt')
      .populate('roleId', 'name');

    const regIds = matchingRegs.map(r => r._id);
    const regMap = new Map(matchingRegs.map(r => [r._id.toString(), r]));

    // 4. Fetch passes to map registrations to divisions
    const passes = await Pass.find({
      registrationId: { $in: regIds },
      isActive: true
    }).select('registrationId divisionId');
    
    const regToDivisionMap = new Map();
    passes.forEach(p => {
      if (p.divisionId) regToDivisionMap.set(p.registrationId.toString(), p.divisionId.toString());
    });

    // 5. Fetch gate logs this week
    const gateLogsThisWeek = await GateLog.find(
      grantedGateLogFilter({
        registrationId: { $in: regIds },
        eventType: GATE_EVENT_TYPES.ENTRY,
        createdAt: { $gte: weekStart, $lt: weekEnd }
      })
    ).select('registrationId roleId divisionId createdAt');

    // 6. Fetch name mappings
    const [allDivisions, allRoles] = await Promise.all([
      mongoose.connection.db.collection('divisions').find().toArray(),
      mongoose.connection.db.collection('roles').find().toArray()
    ]);
    const divisionNames = new Map(allDivisions.map(d => [d._id.toString(), d.name]));
    const roleNames = new Map(allRoles.map(r => [r._id.toString(), r.name]));

    // 7. Generic breakdown compiler function
    function compileBreakdownSeries(breakdownBy) {
      const categories = new Set();
      const regCountsByCategory = {};
      const logCountsByCategory = {};
      const totalCountsByCategory = {};

      function getCategoryLabel(reg) {
        if (breakdownBy === 'division') {
          const divId = regToDivisionMap.get(reg._id.toString());
          return divId ? (divisionNames.get(divId) || 'Unknown Division') : 'No Division';
        }
        if (breakdownBy === 'batch') {
          let val = '';
          for (const fId of batchFields) {
            if (reg.formData?.[fId]) {
              val = reg.formData[fId];
              break;
            }
          }
          return val || 'No Batch';
        }
        if (breakdownBy === 'labourType') {
          let val = '';
          for (const fId of labourTypeFields) {
            if (reg.formData?.[fId]) {
              val = reg.formData[fId];
              break;
            }
          }
          return val || 'No Labour Type';
        }
        return 'Total';
      }

      function getLogCategoryLabel(log) {
        if (breakdownBy === 'division') {
          const divId = log.divisionId?.toString() || regToDivisionMap.get(log.registrationId?.toString());
          return divId ? (divisionNames.get(divId) || 'Unknown Division') : 'No Division';
        }
        const reg = log.registrationId ? regMap.get(log.registrationId.toString()) : null;
        if (!reg) return 'Unknown';
        return getCategoryLabel(reg);
      }

      matchingRegs.forEach(reg => {
        const cat = getCategoryLabel(reg);
        categories.add(cat);
        totalCountsByCategory[cat] = (totalCountsByCategory[cat] || 0) + 1;
        
        if (reg.createdAt >= weekStart && reg.createdAt < weekEnd) {
          const istTime = new Date(reg.createdAt.getTime() + 5.5 * 60 * 60 * 1000);
          const dateKey = istTime.toISOString().slice(0, 10);
          regCountsByCategory[cat] = regCountsByCategory[cat] || {};
          regCountsByCategory[cat][dateKey] = (regCountsByCategory[cat][dateKey] || 0) + 1;
        }
      });

      gateLogsThisWeek.forEach(log => {
        const istTime = new Date(log.createdAt.getTime() + 5.5 * 60 * 60 * 1000);
        const dateKey = istTime.toISOString().slice(0, 10);
        const cat = getLogCategoryLabel(log);
        categories.add(cat);
        logCountsByCategory[cat] = logCountsByCategory[cat] || {};
        logCountsByCategory[cat][dateKey] = (logCountsByCategory[cat][dateKey] || 0) + 1;
      });

      const categoryColors = {};
      Array.from(categories).sort().forEach((cat, idx) => {
        categoryColors[cat] = SERIES_COLORS[idx % SERIES_COLORS.length];
      });

      const weeklyRegistrationsSeries = Object.entries(regCountsByCategory).map(([cat, counts]) => {
        const data = DAY_LABELS.map((label, index) => {
          const key = addCalendarDays(weekStartKey, index);
          return counts[key] || 0;
        });
        return {
          label: cat,
          data,
          color: categoryColors[cat]
        };
      });

      const weeklyEntriesSeries = Object.entries(logCountsByCategory).map(([cat, counts]) => {
        const data = DAY_LABELS.map((label, index) => {
          const key = addCalendarDays(weekStartKey, index);
          return counts[key] || 0;
        });
        return {
          label: cat,
          data,
          color: categoryColors[cat]
        };
      });

      const distributionSeries = Object.entries(totalCountsByCategory).map(([label, value]) => ({
        label,
        value,
        color: categoryColors[label] || '#CCCCCC'
      })).sort((a, b) => b.value - a.value);

      return {
        weeklyRegistrationsSeries,
        weeklyEntriesSeries,
        distributionSeries
      };
    }

    // Compile all breakdowns
    const divisionBreakdown = compileBreakdownSeries('division');
    const batchBreakdown = compileBreakdownSeries('batch');
    const labourTypeBreakdown = compileBreakdownSeries('labourType');

    // 8. Overall metrics and status counts
    const statusCounts = {
      verified: 0,
      pending_verification: 0,
      rejected: 0,
      in_progress: 0,
    };
    matchingRegs.forEach(reg => {
      if (reg.status in statusCounts) {
        statusCounts[reg.status]++;
      }
    });

    const todayStart = new Date(`${todayKey}T00:00:00.000${IST_OFFSET}`);
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    const todayLogs = await GateLog.find({
      registrationId: { $in: regIds },
      matched: true,
      createdAt: { $gte: todayStart, $lt: todayEnd }
    }).select('eventType');

    let todayEntries = 0;
    let todayExits = 0;
    todayLogs.forEach(l => {
      if (l.eventType === GATE_EVENT_TYPES.ENTRY) todayEntries++;
      if (l.eventType === GATE_EVENT_TYPES.EXIT) todayExits++;
    });
    const insideNow = Math.max(todayEntries - todayExits, 0);

    // 9. Accuracy
    const accuracyResult = await GateLog.aggregate([
      {
        $match: {
          registrationId: { $in: regIds },
          matched: true,
          matchScore: { $ne: null }
        }
      },
      {
        $group: {
          _id: null,
          avgScore: { $avg: '$matchScore' },
          count: { $sum: 1 }
        }
      }
    ]);
    const avgAcc = accuracyResult.length && accuracyResult[0].count > 0
      ? Math.round(accuracyResult[0].avgScore * 100)
      : 99;
    const scoredLogsCount = accuracyResult.length ? accuracyResult[0].count : 0;

    res.json({
      timezone: 'Asia/Kolkata',
      todayEntries,
      todayExits,
      insideNow,
      statusCounts,
      avgAcc,
      scoredLogsCount,
      totalRegistrations: matchingRegs.length,
      division: divisionBreakdown,
      batch: batchBreakdown,
      labourType: labourTypeBreakdown
    });
  })
);

export default router;
