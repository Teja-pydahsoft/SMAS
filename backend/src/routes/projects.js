import { Router } from 'express';
import mongoose from 'mongoose';
import Project from '../models/Project.js';
import ProjectAssignment from '../models/ProjectAssignment.js';
import Department from '../models/Department.js';
import Division from '../models/Division.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requirePermission } from '../middleware/auth.js';
import {
  PROJECT_TYPES,
  PROJECT_TYPE_LIST,
  PROJECT_STATUSES,
  PROJECT_STATUS_LIST,
  PROJECT_ASSIGNMENT_STATUSES,
  PROJECT_TYPE_LABELS,
  PROJECT_STATUS_LABELS,
} from '../constants/index.js';
import {
  getEligibleLabourersForProject,
  assertLabourEligibleForProject,
  getProjectAssignmentStats,
  serializeAssignedLabourers,
  getProjectActivityTimeline,
  appendProjectPhotoTimelineEvents,
} from '../services/projectService.js';
import {
  processProjectPhotoUpload,
  listProjectPhotos,
  getProjectPhotoDaySummary,
  serializeProjectPhoto,
  computeProjectProgress,
} from '../services/projectPhotoService.js';
import { todayDateStringIst } from '../utils/istTime.js';
import { createMulter } from '../utils/storage.js';
import ProjectDailyPhoto from '../models/ProjectDailyPhoto.js';
import fs from 'fs';

const router = Router();

const projectPhotoUpload = createMulter('projects', (req, file) => {
  const stamp = Date.now();
  const safe = (file.originalname || 'photo.jpg').replace(/[^\w.\-]+/g, '_');
  return `project-${stamp}-${safe}`;
});

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function validateProjectPayload(body, { existingId = null } = {}) {
  const projectName = body.projectName?.trim();
  if (!projectName) return { error: 'Project name is required' };

  const requiredDays = Number(body.requiredDays);
  if (!Number.isFinite(requiredDays) || requiredDays <= 0) {
    return { error: 'Required days must be greater than zero' };
  }

  const projectType = body.projectType || PROJECT_TYPES.UNIVERSAL;
  if (!PROJECT_TYPE_LIST.includes(projectType)) {
    return { error: 'Invalid project type' };
  }

  let departmentId = body.departmentId || null;
  let divisionId = body.divisionId || null;

  if (projectType === PROJECT_TYPES.UNIVERSAL) {
    departmentId = null;
    divisionId = null;
  } else if (projectType === PROJECT_TYPES.DEPARTMENT_SPECIFIC) {
    divisionId = null;
    if (!departmentId || !mongoose.Types.ObjectId.isValid(departmentId)) {
      return { error: 'Department is required for Department Specific projects' };
    }
    const department = await Department.findById(departmentId);
    if (!department) return { error: 'Department not found' };
    if (!department.isActive) return { error: 'Department is inactive' };
  } else if (projectType === PROJECT_TYPES.DIVISION_SPECIFIC) {
    departmentId = null;
    if (!divisionId || !mongoose.Types.ObjectId.isValid(divisionId)) {
      return { error: 'Division is required for Division Specific projects' };
    }
    const division = await Division.findById(divisionId);
    if (!division) return { error: 'Division not found' };
    if (!division.isActive) return { error: 'Division is inactive' };
  }

  const status = body.status || PROJECT_STATUSES.ACTIVE;
  if (!PROJECT_STATUS_LIST.includes(status)) {
    return { error: 'Invalid project status' };
  }

  if (status === PROJECT_STATUSES.ACTIVE) {
    const duplicateFilter = {
      projectName: new RegExp(`^${escapeRegex(projectName)}$`, 'i'),
      status: PROJECT_STATUSES.ACTIVE,
    };
    if (existingId) duplicateFilter._id = { $ne: existingId };
    const duplicate = await Project.findOne(duplicateFilter).select('_id');
    if (duplicate) {
      return { error: 'An active project with this name already exists' };
    }
  }

  return {
    data: {
      projectName,
      requiredDays,
      projectType,
      departmentId,
      divisionId,
      description: body.description?.trim() || '',
      status,
    },
  };
}

function serializeProject(project, stats = null) {
  const obj = typeof project.toObject === 'function' ? project.toObject() : { ...project };
  const department = obj.departmentId && typeof obj.departmentId === 'object' ? obj.departmentId : null;
  const division = obj.divisionId && typeof obj.divisionId === 'object' ? obj.divisionId : null;
  const createdBy = obj.createdBy && typeof obj.createdBy === 'object' ? obj.createdBy : null;
  const progress = computeProjectProgress(obj);

  return {
    id: obj._id?.toString(),
    _id: obj._id,
    projectName: obj.projectName,
    requiredDays: obj.requiredDays,
    projectType: obj.projectType,
    projectTypeLabel: PROJECT_TYPE_LABELS[obj.projectType] || obj.projectType,
    departmentId: department?._id?.toString() || obj.departmentId?.toString() || null,
    department: department
      ? { _id: department._id, name: department.name, slug: department.slug }
      : null,
    divisionId: division?._id?.toString() || obj.divisionId?.toString() || null,
    division: division
      ? { _id: division._id, name: division.name, slug: division.slug }
      : null,
    description: obj.description || '',
    status: obj.status,
    statusLabel: PROJECT_STATUS_LABELS[obj.status] || obj.status,
    createdBy: createdBy
      ? {
          _id: createdBy._id,
          displayName: createdBy.displayName,
          username: createdBy.username,
        }
      : null,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
    totalAssigned: stats?.totalAssigned ?? 0,
    activeLabourers: stats?.activeLabourers ?? 0,
    completedLabourers: stats?.completedLabourers ?? 0,
    labourWorkingToday: stats?.labourWorkingToday ?? 0,
    progress: {
      startDate: progress.startDate,
      endDate: progress.endDate,
      requiredDays: progress.requiredDays,
      completedDays: progress.completedDays,
      remainingDays: progress.remainingDays,
      completionPct: progress.completionPct,
    },
  };
}

const populateProject = [
  { path: 'departmentId', select: 'name slug isActive' },
  { path: 'divisionId', select: 'name slug isActive' },
  { path: 'createdBy', select: 'displayName username' },
];

router.get(
  '/',
  requirePermission('projects', 'read'),
  asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.status) {
      filter.status = req.query.status;
    } else if (req.query.includeArchived !== 'true') {
      filter.status = { $ne: PROJECT_STATUSES.ARCHIVED };
    }
    if (req.query.projectType) filter.projectType = req.query.projectType;
    if (req.query.departmentId) filter.departmentId = req.query.departmentId;
    if (req.query.divisionId) filter.divisionId = req.query.divisionId;
    if (req.query.createdFrom || req.query.createdTo) {
      filter.createdAt = {};
      if (req.query.createdFrom) {
        filter.createdAt.$gte = new Date(`${req.query.createdFrom}T00:00:00.000+05:30`);
      }
      if (req.query.createdTo) {
        filter.createdAt.$lte = new Date(`${req.query.createdTo}T23:59:59.999+05:30`);
      }
    }
    if (req.query.search) {
      const q = escapeRegex(req.query.search.trim());
      if (q) filter.projectName = { $regex: q, $options: 'i' };
    }

    const projects = await Project.find(filter)
      .populate(populateProject)
      .sort({ createdAt: -1 });

    const statsMap = await getProjectAssignmentStats(projects.map((p) => p._id));
    res.json(projects.map((p) => serializeProject(p, statsMap.get(p._id.toString()))));
  })
);

router.get(
  '/portfolio-summary',
  requirePermission('projects', 'read'),
  asyncHandler(async (req, res) => {
    const projects = await Project.find({ status: { $ne: PROJECT_STATUSES.ARCHIVED } })
      .select('status')
      .lean();
    const projectIds = projects.map((p) => p._id);
    const statsMap = await getProjectAssignmentStats(projectIds);

    let totalAssignedLabour = 0;
    let labourWorkingToday = 0;
    for (const id of projectIds) {
      const s = statsMap.get(id.toString());
      totalAssignedLabour += s?.activeLabourers || 0;
      labourWorkingToday += s?.labourWorkingToday || 0;
    }

    const byStatus = {
      active: 0,
      completed: 0,
      on_hold: 0,
    };
    for (const p of projects) {
      if (byStatus[p.status] != null) byStatus[p.status] += 1;
    }

    res.json({
      totalProjects: projects.length,
      active: byStatus.active,
      completed: byStatus.completed,
      onHold: byStatus.on_hold,
      totalAssignedLabour,
      labourWorkingToday,
    });
  })
);

router.post(
  '/:id/archive',
  requirePermission('projects', 'write'),
  asyncHandler(async (req, res) => {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    project.status = PROJECT_STATUSES.ARCHIVED;
    await project.save();
    const populated = await Project.findById(project._id).populate(populateProject);
    const statsMap = await getProjectAssignmentStats([project._id]);
    res.json(serializeProject(populated, statsMap.get(project._id.toString())));
  })
);

router.get(
  '/:id',
  requirePermission('projects', 'read'),
  asyncHandler(async (req, res) => {
    const project = await Project.findById(req.params.id).populate(populateProject);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const statsMap = await getProjectAssignmentStats([project._id]);
    res.json(serializeProject(project, statsMap.get(project._id.toString())));
  })
);

router.post(
  '/',
  requirePermission('projects', 'write'),
  asyncHandler(async (req, res) => {
    const validated = await validateProjectPayload(req.body);
    if (validated.error) return res.status(400).json({ error: validated.error });

    const project = await Project.create({
      ...validated.data,
      createdBy: req.user?._id || null,
    });

    const populated = await Project.findById(project._id).populate(populateProject);
    res.status(201).json(serializeProject(populated, {
      totalAssigned: 0,
      activeLabourers: 0,
      completedLabourers: 0,
    }));
  })
);

router.put(
  '/:id',
  requirePermission('projects', 'write'),
  asyncHandler(async (req, res) => {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const payload = {
      projectName: req.body.projectName ?? project.projectName,
      requiredDays: req.body.requiredDays ?? project.requiredDays,
      projectType: req.body.projectType ?? project.projectType,
      departmentId:
        req.body.departmentId !== undefined ? req.body.departmentId : project.departmentId,
      divisionId: req.body.divisionId !== undefined ? req.body.divisionId : project.divisionId,
      description: req.body.description !== undefined ? req.body.description : project.description,
      status: req.body.status ?? project.status,
    };

    const validated = await validateProjectPayload(payload, { existingId: project._id });
    if (validated.error) return res.status(400).json({ error: validated.error });

    Object.assign(project, validated.data);
    await project.save();

    if (validated.data.status === PROJECT_STATUSES.COMPLETED) {
      await ProjectAssignment.updateMany(
        { projectId: project._id, status: PROJECT_ASSIGNMENT_STATUSES.ACTIVE },
        { $set: { status: PROJECT_ASSIGNMENT_STATUSES.COMPLETED, removedAt: new Date() } }
      );
    }

    const populated = await Project.findById(project._id).populate(populateProject);
    const statsMap = await getProjectAssignmentStats([project._id]);
    res.json(serializeProject(populated, statsMap.get(project._id.toString())));
  })
);

router.delete(
  '/:id',
  requirePermission('projects', 'write'),
  asyncHandler(async (req, res) => {
    const project = await Project.findByIdAndDelete(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    await ProjectAssignment.deleteMany({ projectId: project._id });
    res.json({ message: 'Project deleted' });
  })
);

router.get(
  '/:id/eligible-labourers',
  requirePermission('projects', 'read'),
  asyncHandler(async (req, res) => {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const labourers = await getEligibleLabourersForProject(project, {
      search: req.query.search || '',
      departmentId: req.query.departmentId || '',
      divisionId: req.query.divisionId || '',
    });

    res.json({
      projectId: project._id.toString(),
      projectType: project.projectType,
      count: labourers.length,
      labourers,
    });
  })
);

router.get(
  '/:id/assignments',
  requirePermission('projects', 'read'),
  asyncHandler(async (req, res) => {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const assignments = await serializeAssignedLabourers(project._id);
    res.json({
      projectId: project._id.toString(),
      count: assignments.length,
      assignments,
    });
  })
);

router.get(
  '/:id/activity',
  requirePermission('projects', 'read'),
  asyncHandler(async (req, res) => {
    const project = await Project.findById(req.params.id).populate('createdBy', 'displayName username');
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const events = await getProjectActivityTimeline(project);
    const withPhotos = await appendProjectPhotoTimelineEvents(project, events);
    res.json({
      projectId: project._id.toString(),
      count: withPhotos.length,
      events: withPhotos,
    });
  })
);

router.post(
  '/:id/assignments',
  requirePermission('projects', 'write'),
  asyncHandler(async (req, res) => {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.status !== PROJECT_STATUSES.ACTIVE) {
      return res.status(400).json({ error: 'Labourers can only be assigned to active projects' });
    }

    const labourIds = Array.isArray(req.body.labourIds)
      ? [...new Set(req.body.labourIds.map(String))]
      : req.body.labourId
        ? [String(req.body.labourId)]
        : [];

    if (labourIds.length === 0) {
      return res.status(400).json({ error: 'Select at least one labourer to assign' });
    }

    const assigned = [];
    const errors = [];

    for (const labourId of labourIds) {
      const check = await assertLabourEligibleForProject(project, labourId);
      if (!check.ok) {
        errors.push({ labourId, error: check.error });
        continue;
      }

      try {
        // Always create a new assignment row so prior assignedAt/removedAt periods stay intact
        const row = await ProjectAssignment.create({
          projectId: project._id,
          labourId,
          assignedBy: req.user?._id || null,
          assignedAt: new Date(),
          removedAt: null,
          status: PROJECT_ASSIGNMENT_STATUSES.ACTIVE,
        });
        assigned.push(row.labourId.toString());
      } catch (err) {
        if (err?.code === 11000) {
          errors.push({ labourId, error: 'Labourer is already assigned to this project' });
        } else {
          errors.push({ labourId, error: err.message || 'Failed to assign labourer' });
        }
      }
    }

    const assignments = await serializeAssignedLabourers(project._id);
    if (assigned.length === 0) {
      return res.status(400).json({
        error: errors[0]?.error || 'Failed to assign labourers',
        assigned,
        errors,
        assignments,
      });
    }

    res.status(201).json({
      assigned,
      errors,
      assignments,
    });
  })
);

router.delete(
  '/:id/assignments/:labourId',
  requirePermission('projects', 'write'),
  asyncHandler(async (req, res) => {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const assignment = await ProjectAssignment.findOne({
      projectId: project._id,
      labourId: req.params.labourId,
      status: PROJECT_ASSIGNMENT_STATUSES.ACTIVE,
    });

    if (!assignment) {
      return res.status(404).json({ error: 'Active assignment not found' });
    }

    assignment.status = PROJECT_ASSIGNMENT_STATUSES.REMOVED;
    assignment.removedAt = new Date();
    await assignment.save();

    res.json({ message: 'Assignment removed' });
  })
);

router.post(
  '/:id/assignments/remove',
  requirePermission('projects', 'write'),
  asyncHandler(async (req, res) => {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const labourIds = Array.isArray(req.body.labourIds)
      ? [...new Set(req.body.labourIds.map(String))]
      : [];

    if (labourIds.length === 0) {
      return res.status(400).json({ error: 'Select at least one labourer to remove' });
    }

    const result = await ProjectAssignment.updateMany(
      {
        projectId: project._id,
        labourId: { $in: labourIds },
        status: PROJECT_ASSIGNMENT_STATUSES.ACTIVE,
      },
      { $set: { status: PROJECT_ASSIGNMENT_STATUSES.REMOVED, removedAt: new Date() } }
    );

    const assignments = await serializeAssignedLabourers(project._id);
    res.json({
      removed: result.modifiedCount,
      assignments,
    });
  })
);

router.get(
  '/:id/photo-days',
  requirePermission('projects', 'read'),
  asyncHandler(async (req, res) => {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const summary = await getProjectPhotoDaySummary(project);
    res.json({
      projectId: project._id.toString(),
      ...summary,
    });
  })
);

router.get(
  '/:id/photos',
  requirePermission('projects', 'read'),
  asyncHandler(async (req, res) => {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const photoDate = req.query.date || null;
    if (photoDate && !/^\d{4}-\d{2}-\d{2}$/.test(photoDate)) {
      return res.status(400).json({ error: 'Invalid date. Use YYYY-MM-DD' });
    }

    const photos = await listProjectPhotos(project._id, photoDate);
    res.json({
      projectId: project._id.toString(),
      photoDate,
      count: photos.length,
      photos,
    });
  })
);

router.post(
  '/:id/photos',
  requirePermission('projects', 'write'),
  projectPhotoUpload.array('photos', 12),
  asyncHandler(async (req, res) => {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length === 0) {
      return res.status(400).json({ error: 'At least one photo is required' });
    }

    const photoDate = (req.body.photoDate || todayDateStringIst()).trim();
    const uploaded = [];
    const errors = [];

    for (const file of files) {
      const filePath = file.path || null;
      try {
        const imageBuffer = file.buffer || fs.readFileSync(filePath);
        const result = await processProjectPhotoUpload({
          project,
          imageBuffer,
          filename: file.filename || file.originalname || 'project.jpg',
          photoDate,
          uploadedBy: req.user?._id || null,
          originalName: file.originalname || '',
        });

        if (result.error) {
          errors.push({ file: file.originalname, error: result.error });
        } else {
          uploaded.push({
            ...result.photo,
            facesDetected: result.facesDetected,
            matchedAssignedCount: result.matchedAssignedCount,
            storedWithoutFaces: Boolean(result.storedWithoutFaces),
            analysisWarning: result.analysisWarning || null,
            people: result.people || [],
            matchedCount: result.matchedCount ?? 0,
            unmatchedCount: result.unmatchedCount ?? 0,
            inActivityCount: result.inActivityCount ?? 0,
          });
        }
      } catch (err) {
        errors.push({ file: file.originalname, error: err.message || 'Upload failed' });
      } finally {
        // Keep S3/local stored path from processProjectPhotoUpload; remove multer temp copy if different
        if (filePath && fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
          } catch {
            // ignore
          }
        }
      }
    }

    if (uploaded.length === 0) {
      return res.status(400).json({
        error: errors[0]?.error || 'Failed to upload photos',
        uploaded,
        errors,
      });
    }

    res.status(201).json({
      photoDate,
      uploaded,
      errors,
      count: uploaded.length,
    });
  })
);

router.delete(
  '/:id/photos/:photoId',
  requirePermission('projects', 'write'),
  asyncHandler(async (req, res) => {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const photo = await ProjectDailyPhoto.findOne({
      _id: req.params.photoId,
      projectId: project._id,
    });
    if (!photo) return res.status(404).json({ error: 'Photo not found' });

    await ProjectDailyPhoto.deleteOne({ _id: photo._id });
    res.json({ message: 'Photo deleted', photo: serializeProjectPhoto(photo) });
  })
);

export default router;
