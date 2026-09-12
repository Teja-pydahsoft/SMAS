import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requirePermission, requireAnyPermission } from '../middleware/auth.js';
import {
  getScopedDivisionIds,
  resolveDivisionFilterIds,
  getScopedDivisionOptions,
  getScopedDepartmentIds,
  resolveDepartmentFilterIds,
  getScopedDepartmentOptions,
} from '../services/accessScopeService.js';
import {
  listRegistrationReports,
  getRegistrationReport,
  getDailyPassByRole,
  getDepartmentActivity,
  getAttendanceHistoryGrid,
  recalculateAttendanceHistory,
  setAttendanceStatusOverride,
} from '../services/registrationReportService.js';

const router = Router();

/**
 * Resolve the effective division filter for the current request:
 * combines the user's RBAC-allowed divisions with any `divisionId` they picked.
 * Returns `null` (no restriction) or an array of division id strings.
 */
async function resolveRequestDivisionIds(req) {
  const scopedIds = await getScopedDivisionIds(req.user);
  const requested =
    req.query.divisionIds ||
    req.query.divisionId ||
    (req.body && (req.body.divisionIds || req.body.divisionId));
  return resolveDivisionFilterIds(scopedIds, requested);
}

/**
 * Resolve the effective department filter for the current request.
 */
async function resolveRequestDepartmentIds(req) {
  const scopedIds = await getScopedDepartmentIds(req.user);
  return resolveDepartmentFilterIds(scopedIds, req.query.departmentId);
}

router.get(
  '/divisions',
  requireAnyPermission(['reports', 'attendance_excel'], 'read'),
  asyncHandler(async (req, res) => {
    const data = await getScopedDivisionOptions(req.user);
    res.json(data);
  })
);

router.get(
  '/departments',
  requirePermission('reports', 'read'),
  asyncHandler(async (req, res) => {
    const data = await getScopedDepartmentOptions(req.user);
    res.json(data);
  })
);

router.get(
  '/registrations',
  requirePermission('reports', 'read'),
  asyncHandler(async (req, res) => {
    const divisionIds = await resolveRequestDivisionIds(req);
    const departmentIds = await resolveRequestDepartmentIds(req);
    const items = await listRegistrationReports({
      search: req.query.search || '',
      limit: req.query.limit || 100,
      divisionIds,
      departmentIds,
    });
    res.json(items);
  })
);

router.get(
  '/daily-passes',
  requirePermission('reports', 'read'),
  asyncHandler(async (req, res) => {
    const divisionIds = await resolveRequestDivisionIds(req);
    const departmentIds = await resolveRequestDepartmentIds(req);
    const data = await getDailyPassByRole({
      divisionIds,
      departmentIds,
      date: req.query.date || null,
      dateFrom: req.query.dateFrom || null,
      dateTo: req.query.dateTo || null,
    });
    res.json(data);
  })
);

router.get(
  '/department-activity',
  requirePermission('reports', 'read'),
  asyncHandler(async (req, res) => {
    const divisionIds = await resolveRequestDivisionIds(req);
    const departmentIds = await resolveRequestDepartmentIds(req);
    // Empty array = requested division is outside the user's scope
    if (Array.isArray(divisionIds) && divisionIds.length === 0 && req.query.divisionId) {
      return res.status(403).json({ error: 'Division is outside your access scope' });
    }
    if (Array.isArray(departmentIds) && departmentIds.length === 0 && req.query.departmentId) {
      return res.status(403).json({ error: 'Department is outside your access scope' });
    }

    const data = await getDepartmentActivity({
      divisionIds,
      departmentIds,
      departmentId: req.query.departmentId || null,
      date: req.query.date || null,
      dateFrom: req.query.dateFrom || null,
      dateTo: req.query.dateTo || null,
      statsOnly: req.query.statsOnly === 'true' || req.query.statsOnly === '1',
      page: req.query.page || null,
      limit: req.query.limit || null,
      listDivisionId: req.query.listDivisionId || null,
    });
    res.json(data);
  })
);

router.get(
  '/attendance-history',
  requireAnyPermission(['reports', 'jattu_attendance', 'attendance_excel'], 'read'),
  asyncHandler(async (req, res) => {
    const divisionIds = await resolveRequestDivisionIds(req);
    const departmentIds = await resolveRequestDepartmentIds(req);
    const isExport = req.query.isExport === 'true' || req.query.isExport === '1';
    const data = await getAttendanceHistoryGrid({
      dateFrom: req.query.dateFrom || '',
      dateTo: req.query.dateTo || '',
      search: req.query.search || '',
      roleId: req.query.roleId || '',
      limit: req.query.limit ? parseInt(req.query.limit, 10) : (isExport ? 10000 : 50),
      page: req.query.page || 1,
      divisionIds,
      departmentIds,
      payFrequency: req.query.payFrequency || '',
      shiftName: req.query.shiftName || '',
      selectionFilters: req.query.selectionFilters || '{}',
      isExport,
    });
    res.json(data);
  })
);

router.post(
  '/attendance-history/recalculate',
  requireAnyPermission(['reports', 'jattu_attendance'], 'read'),
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const scopedIds = await getScopedDivisionIds(req.user);
    const divisionIds = resolveDivisionFilterIds(
      scopedIds,
      body.divisionIds || body.divisionId || req.query.divisionIds || req.query.divisionId
    );
    const data = await recalculateAttendanceHistory({
      dateFrom: body.dateFrom || req.query.dateFrom || '',
      dateTo: body.dateTo || req.query.dateTo || '',
      search: body.search || req.query.search || '',
      roleId: body.roleId || req.query.roleId || '',
      limit: body.limit || req.query.limit || 50,
      page: body.page || req.query.page || 1,
      divisionIds,
      registrationIds: body.registrationIds || null,
      payFrequency: body.payFrequency || req.query.payFrequency || '',
      shiftName: body.shiftName || req.query.shiftName || '',
      selectionFilters: body.selectionFilters || req.query.selectionFilters || '{}',
    });
    res.json(data);
  })
);

router.post(
  '/registrations/:registrationId/attendance-status',
  requirePermission('reports', 'write'),
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const divisionIds = await resolveRequestDivisionIds(req);
    const result = await setAttendanceStatusOverride({
      registrationId: req.params.registrationId,
      date: body.date,
      status: body.status,
      note: body.note || '',
      user: req.user,
      divisionIds,
    });
    res.json(result);
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
