import { Router } from 'express';
import Registration from '../models/Registration.js';
import GateLog from '../models/GateLog.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { GATE_EVENT_TYPES } from '../constants/index.js';
import { grantedGateLogFilter } from '../utils/gateLogFilters.js';
import { IST_OFFSET, todayDateStringIst } from '../utils/istTime.js';

const router = Router();
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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
    const daysSinceMonday = (dayOfWeek + 6) % 7;
    const weekStartKey = addCalendarDays(todayKey, -daysSinceMonday);
    const weekEndKey = addCalendarDays(weekStartKey, 7);
    const weekStart = istDateStart(weekStartKey);
    const weekEnd = istDateStart(weekEndKey);

    const [weeklyRegistrationCounts, dailyCounts] = await Promise.all([
      Registration.aggregate([
        { $match: { createdAt: { $gte: weekStart, $lt: weekEnd } } },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt',
                timezone: IST_OFFSET,
              },
            },
            count: { $sum: 1 },
          },
        },
      ]),
      GateLog.aggregate([
        {
          $match: grantedGateLogFilter({
            eventType: GATE_EVENT_TYPES.ENTRY,
            createdAt: { $gte: weekStart, $lt: weekEnd },
          }),
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt',
                timezone: IST_OFFSET,
              },
            },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const weeklyRegistrationCountMap = new Map(
      weeklyRegistrationCounts.map((item) => [item._id, item.count])
    );
    const dailyCountMap = new Map(dailyCounts.map((item) => [item._id, item.count]));
    const weeklyRegistrations = DAY_LABELS.map((label, index) => {
      const key = addCalendarDays(weekStartKey, index);
      return {
        key,
        label,
        count: weeklyRegistrationCountMap.get(key) || 0,
      };
    });

    const weeklyEntries = DAY_LABELS.map((label, index) => {
      const key = addCalendarDays(weekStartKey, index);
      return {
        key,
        label,
        count: dailyCountMap.get(key) || 0,
      };
    });

    res.json({
      timezone: 'Asia/Kolkata',
      weeklyRegistrations,
      weeklyEntries,
      todayEntries: dailyCountMap.get(todayKey) || 0,
    });
  })
);

export default router;
