import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requirePermission } from '../middleware/auth.js';
import {
  getScopedDivisionIds,
  resolveDivisionFilterIds,
  getScopedDivisionOptions,
} from '../services/accessScopeService.js';
import {
  listRegistrationReports,
  getRegistrationReport,
  getDailyPassByRole,
  getAttendanceHistoryGrid,
  recalculateAttendanceHistory,
} from '../services/registrationReportService.js';

const router = Router();

/**
 * Resolve the effective division filter for the current request:
 * combines the user's RBAC-allowed divisions with any `divisionId` they picked.
 * Returns `null` (no restriction) or an array of division id strings.
 */
async function resolveRequestDivisionIds(req) {
  const scopedIds = await getScopedDivisionIds(req.user);
  return resolveDivisionFilterIds(scopedIds, req.query.divisionId);
}

router.get(
  '/divisions',
  requirePermission('reports', 'read'),
  asyncHandler(async (req, res) => {
    const data = await getScopedDivisionOptions(req.user);
    res.json(data);
  })
);

router.get(
  '/registrations',
  requirePermission('reports', 'read'),
  asyncHandler(async (req, res) => {
    const divisionIds = await resolveRequestDivisionIds(req);
    const items = await listRegistrationReports({
      search: req.query.search || '',
      limit: req.query.limit || 100,
      divisionIds,
    });
    res.json(items);
  })
);

router.get(
  '/daily-passes',
  requirePermission('reports', 'read'),
  asyncHandler(async (req, res) => {
    const divisionIds = await resolveRequestDivisionIds(req);
    const data = await getDailyPassByRole({
      divisionIds,
      date: req.query.date || null,
    });
    res.json(data);
  })
);

router.get(
  '/attendance-history',
  requirePermission('reports', 'read'),
  asyncHandler(async (req, res) => {
    const divisionIds = await resolveRequestDivisionIds(req);
    const data = await getAttendanceHistoryGrid({
      dateFrom: req.query.dateFrom || '',
      dateTo: req.query.dateTo || '',
      search: req.query.search || '',
      roleId: req.query.roleId || '',
      limit: req.query.limit || 500,
      divisionIds,
    });
    res.json(data);
  })
);

router.post(
  '/attendance-history/recalculate',
  requirePermission('reports', 'read'),
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const scopedIds = await getScopedDivisionIds(req.user);
    const divisionIds = resolveDivisionFilterIds(
      scopedIds,
      body.divisionId || req.query.divisionId
    );
    const data = await recalculateAttendanceHistory({
      dateFrom: body.dateFrom || req.query.dateFrom || '',
      dateTo: body.dateTo || req.query.dateTo || '',
      search: body.search || req.query.search || '',
      roleId: body.roleId || req.query.roleId || '',
      limit: body.limit || req.query.limit || 500,
      divisionIds,
    });
    res.json(data);
  })
);

router.get(
  '/registrations/:registrationId',
  requirePermission('reports', 'read'),
  asyncHandler(async (req, res) => {
    const divisionIds = await resolveRequestDivisionIds(req);
    const report = await getRegistrationReport(req.params.registrationId, {
      dateFrom: req.query.dateFrom || '',
      dateTo: req.query.dateTo || '',
      divisionIds,
    });
    if (!report) {
      return res.status(404).json({ error: 'Registration not found or not verified' });
    }
    res.json(report);
  })
);

export default router;
