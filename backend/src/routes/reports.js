import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requirePermission } from '../middleware/auth.js';
import {
  listRegistrationReports,
  getRegistrationReport,
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
  '/registrations/:registrationId',
  requirePermission('reports', 'read'),
  asyncHandler(async (req, res) => {
    const report = await getRegistrationReport(req.params.registrationId);
    if (!report) {
      return res.status(404).json({ error: 'Registration not found or not verified' });
    }
    res.json(report);
  })
);

export default router;
