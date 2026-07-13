import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requirePermission } from '../middleware/auth.js';
import {
  listRegistrationReports,
  getRegistrationReport,
  getDailyPassByRole,
  getAttendanceHistoryGrid,
} from '../services/registrationReportService.js';

const router = Router();

router.get(
  '/registrations',
  requirePermission('reports', 'read'),
  asyncHandler(async (req, res) => {
    const items = await listRegistrationReports({
      search: req.query.search || '',
      limit: req.query.limit || 100,
    });
    res.json(items);
  })
);

router.get(
  '/daily-passes',
  requirePermission('reports', 'read'),
  asyncHandler(async (req, res) => {
    const data = await getDailyPassByRole();
    res.json(data);
  })
);

router.get(
  '/attendance-history',
  requirePermission('reports', 'read'),
  asyncHandler(async (req, res) => {
    const data = await getAttendanceHistoryGrid({
      dateFrom: req.query.dateFrom || '',
      dateTo: req.query.dateTo || '',
      search: req.query.search || '',
      roleId: req.query.roleId || '',
      limit: req.query.limit || 500,
    });
    res.json(data);
  })
);

router.get(
  '/registrations/:registrationId',
  requirePermission('reports', 'read'),
  asyncHandler(async (req, res) => {
    const report = await getRegistrationReport(req.params.registrationId, {
      dateFrom: req.query.dateFrom || '',
      dateTo: req.query.dateTo || '',
    });
    if (!report) {
      return res.status(404).json({ error: 'Registration not found or not verified' });
    }
    res.json(report);
  })
);

export default router;
