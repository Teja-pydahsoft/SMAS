import { Router } from 'express';
import mongoose from 'mongoose';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requirePermission } from '../middleware/auth.js';
import {
  getProjectReportOverview,
  getProjectReportAttendance,
  getProjectReportHistory,
  getProjectReportLabourDetail,
  getProjectReportLabourByAssignment,
  getProjectReportFaces,
  getProjectReportAnalytics,
  getProjectReportFilterOptions,
} from '../services/projectReportService.js';
import Project from '../models/Project.js';

const router = Router();

async function labourReportHandler(req, res) {
  try {
    res.json(await getProjectReportLabourByAssignment(req.params.assignmentId, req.query));
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message || 'Failed to load labour report' });
  }
}

router.get(
  '/projects',
  requirePermission('project_reports', 'read'),
  asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    const departmentId = req.query.departmentId;
    const divisionId = req.query.divisionId;
    if (
      departmentId &&
      departmentId !== 'undefined' &&
      departmentId !== 'null' &&
      mongoose.Types.ObjectId.isValid(departmentId)
    ) {
      filter.departmentId = departmentId;
    }
    if (
      divisionId &&
      divisionId !== 'undefined' &&
      divisionId !== 'null' &&
      mongoose.Types.ObjectId.isValid(divisionId)
    ) {
      filter.divisionId = divisionId;
    }
    const projects = await Project.find(filter)
      .select('projectName status projectType requiredDays departmentId divisionId createdAt')
      .populate('departmentId', 'name')
      .populate('divisionId', 'name')
      .sort({ createdAt: -1 })
      .lean();
    res.json(
      projects.map((p) => ({
        id: p._id.toString(),
        projectName: p.projectName,
        status: p.status,
        projectType: p.projectType,
        requiredDays: p.requiredDays,
        departmentName: p.departmentId?.name || null,
        divisionName: p.divisionId?.name || null,
        createdAt: p.createdAt,
      }))
    );
  })
);

router.get(
  '/overview',
  requirePermission('project_reports', 'read'),
  asyncHandler(async (req, res) => {
    if (!req.query.projectId) return res.status(400).json({ error: 'projectId is required' });
    try {
      res.json(await getProjectReportOverview(req.query.projectId, req.query));
    } catch (err) {
      return res.status(err.status || 500).json({ error: err.message || 'Failed to load overview' });
    }
  })
);

router.get(
  '/attendance',
  requirePermission('project_reports', 'read'),
  asyncHandler(async (req, res) => {
    if (!req.query.projectId) return res.status(400).json({ error: 'projectId is required' });
    try {
      res.json(await getProjectReportAttendance(req.query.projectId, req.query));
    } catch (err) {
      return res.status(err.status || 500).json({ error: err.message || 'Failed to load attendance' });
    }
  })
);

router.get(
  '/history',
  requirePermission('project_reports', 'read'),
  asyncHandler(async (req, res) => {
    if (!req.query.projectId) return res.status(400).json({ error: 'projectId is required' });
    try {
      res.json(await getProjectReportHistory(req.query.projectId, req.query));
    } catch (err) {
      return res.status(err.status || 500).json({ error: err.message || 'Failed to load history' });
    }
  })
);

router.get(
  '/history/:labourId',
  requirePermission('project_reports', 'read'),
  asyncHandler(async (req, res) => {
    if (!req.query.projectId) return res.status(400).json({ error: 'projectId is required' });
    try {
      res.json(
        await getProjectReportLabourDetail(req.query.projectId, req.params.labourId, req.query)
      );
    } catch (err) {
      return res.status(err.status || 500).json({ error: err.message || 'Failed to load labour detail' });
    }
  })
);

router.get(
  '/labour/:assignmentId',
  requirePermission('project_reports', 'read'),
  asyncHandler(labourReportHandler)
);

router.get(
  '/labour/:assignmentId/excel',
  requirePermission('project_reports', 'read'),
  asyncHandler(async (req, res) => {
    try {
      const data = await getProjectReportLabourByAssignment(req.params.assignmentId, {
        ...req.query,
        section: 'all',
      });
      res.json({
        format: 'excel',
        generatedAt: new Date().toISOString(),
        data,
      });
    } catch (err) {
      return res.status(err.status || 500).json({ error: err.message || 'Failed to prepare Excel export' });
    }
  })
);

router.get(
  '/labour/:assignmentId/pdf',
  requirePermission('project_reports', 'read'),
  asyncHandler(async (req, res) => {
    try {
      const data = await getProjectReportLabourByAssignment(req.params.assignmentId, {
        ...req.query,
        section: 'all',
      });
      res.json({
        format: 'pdf',
        generatedAt: new Date().toISOString(),
        data,
      });
    } catch (err) {
      return res.status(err.status || 500).json({ error: err.message || 'Failed to prepare PDF export' });
    }
  })
);

router.get(
  '/faces',
  requirePermission('project_reports', 'read'),
  asyncHandler(async (req, res) => {
    if (!req.query.projectId) return res.status(400).json({ error: 'projectId is required' });
    try {
      res.json(await getProjectReportFaces(req.query.projectId, req.query));
    } catch (err) {
      return res.status(err.status || 500).json({ error: err.message || 'Failed to load face records' });
    }
  })
);

router.get(
  '/analytics',
  requirePermission('project_reports', 'read'),
  asyncHandler(async (req, res) => {
    if (!req.query.projectId) return res.status(400).json({ error: 'projectId is required' });
    try {
      res.json(await getProjectReportAnalytics(req.query.projectId, req.query));
    } catch (err) {
      return res.status(err.status || 500).json({ error: err.message || 'Failed to load analytics' });
    }
  })
);

router.get(
  '/filters',
  requirePermission('project_reports', 'read'),
  asyncHandler(async (req, res) => {
    if (!req.query.projectId) return res.status(400).json({ error: 'projectId is required' });
    try {
      res.json(await getProjectReportFilterOptions(req.query.projectId));
    } catch (err) {
      return res.status(err.status || 500).json({ error: err.message || 'Failed to load filters' });
    }
  })
);

router.get(
  '/export',
  requirePermission('project_reports', 'read'),
  asyncHandler(async (req, res) => {
    if (!req.query.projectId) return res.status(400).json({ error: 'projectId is required' });
    const type = req.query.type || 'summary';
    try {
      let payload;
      if (type === 'attendance') {
        payload = await getProjectReportAttendance(req.query.projectId, {
          ...req.query,
          limit: 5000,
          page: 1,
        });
      } else if (type === 'history' || type === 'labour') {
        payload = await getProjectReportHistory(req.query.projectId, req.query);
      } else if (type === 'faces') {
        payload = await getProjectReportFaces(req.query.projectId, req.query);
      } else if (type === 'complete') {
        const [overview, attendance, history, faces, analytics] = await Promise.all([
          getProjectReportOverview(req.query.projectId, req.query),
          getProjectReportAttendance(req.query.projectId, { ...req.query, limit: 5000, page: 1 }),
          getProjectReportHistory(req.query.projectId, req.query),
          getProjectReportFaces(req.query.projectId, req.query),
          getProjectReportAnalytics(req.query.projectId, req.query),
        ]);
        payload = { overview, attendance, history, faces, analytics };
      } else {
        payload = await getProjectReportOverview(req.query.projectId, req.query);
      }
      res.json({ type, generatedAt: new Date().toISOString(), data: payload });
    } catch (err) {
      return res.status(err.status || 500).json({ error: err.message || 'Failed to export report' });
    }
  })
);

export default router;
