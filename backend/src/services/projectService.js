import mongoose from 'mongoose';
import Pass from '../models/Pass.js';
import Registration from '../models/Registration.js';
import ProjectAssignment from '../models/ProjectAssignment.js';
import ProjectDailyPhoto from '../models/ProjectDailyPhoto.js';
import {
  PASS_TYPES,
  PROJECT_TYPES,
  PROJECT_ASSIGNMENT_STATUSES,
} from '../constants/index.js';
import { buildDisplayInfo, photoUrlFromPath } from '../utils/displayInfo.js';
import {
  getActiveDivisionSession,
  getPassSessionState,
} from './attendanceService.js';

/**
 * Collect labourers currently inside the gate (live day-pass with divisionInside).
 * Returns one row per registration with session context.
 */
export async function listInsideLabourers() {
  const passes = await Pass.find({
    passType: PASS_TYPES.DAY_PASS,
    isActive: true,
    'qrPayload.divisionInside': true,
  })
    .populate('divisionId', 'name')
    .sort({ updatedAt: -1 })
    .lean();

  const byReg = new Map();
  for (const pass of passes) {
    const regId = pass.registrationId?.toString();
    if (!regId || byReg.has(regId)) continue;
    const state = getPassSessionState(pass);
    if (!state.divisionInside) continue;
    byReg.set(regId, {
      labourId: regId,
      divisionId: pass.divisionId?._id?.toString() || pass.divisionId?.toString() || null,
      divisionName: pass.qrPayload?.divisionName || pass.divisionId?.name || null,
      departmentId: state.currentDepartmentId || null,
      departmentName: state.currentDepartmentName || null,
      entryTime: state.gateEntryAt || null,
      gateStatus: 'Inside',
      pass,
    });
  }

  const regIds = [...byReg.keys()];
  if (regIds.length === 0) return [];

  const registrations = await Registration.find({
    _id: { $in: regIds },
    status: 'verified',
  })
    .select('-faceEmbedding')
    .populate('formId', 'fields')
    .lean();

  const regMap = new Map(registrations.map((r) => [r._id.toString(), r]));

  const labourers = [];
  for (const [regId, session] of byReg) {
    const reg = regMap.get(regId);
    if (!reg) continue;
    const display = buildDisplayInfo(reg.formData, reg.formId?.fields || []);
    labourers.push({
      labourId: regId,
      labourName: display.displayName || session.pass?.holderName || 'Unknown',
      registrationCode: reg.registrationCode || null,
      photoUrl: photoUrlFromPath(reg.photoPath),
      departmentId: session.departmentId,
      departmentName: session.departmentName,
      divisionId: session.divisionId,
      divisionName: session.divisionName,
      entryTime: session.entryTime,
      gateStatus: 'Inside',
    });
  }

  labourers.sort((a, b) => (a.labourName || '').localeCompare(b.labourName || ''));
  return labourers;
}

function labourMatchesProject(labour, project) {
  if (project.projectType === PROJECT_TYPES.UNIVERSAL) return true;

  if (project.projectType === PROJECT_TYPES.DEPARTMENT_SPECIFIC) {
    const projectDept = project.departmentId?._id?.toString() || project.departmentId?.toString();
    return Boolean(projectDept && labour.departmentId === projectDept);
  }

  if (project.projectType === PROJECT_TYPES.DIVISION_SPECIFIC) {
    const projectDiv = project.divisionId?._id?.toString() || project.divisionId?.toString();
    return Boolean(projectDiv && labour.divisionId === projectDiv);
  }

  return false;
}

/**
 * Eligible labourers for a project: inside gate, matching type rules, not already assigned.
 */
export async function getEligibleLabourersForProject(project, { search = '', departmentId = '', divisionId = '' } = {}) {
  const inside = await listInsideLabourers();
  const assigned = await ProjectAssignment.find({
    projectId: project._id,
    status: PROJECT_ASSIGNMENT_STATUSES.ACTIVE,
  })
    .select('labourId')
    .lean();
  const assignedSet = new Set(assigned.map((a) => a.labourId.toString()));

  const normalizedSearch = search.trim().toLowerCase();

  return inside.filter((labour) => {
    if (assignedSet.has(labour.labourId)) return false;
    if (!labourMatchesProject(labour, project)) return false;
    if (departmentId && labour.departmentId !== departmentId) return false;
    if (divisionId && labour.divisionId !== divisionId) return false;
    if (normalizedSearch) {
      const hay = `${labour.labourName || ''} ${labour.registrationCode || ''}`.toLowerCase();
      if (!hay.includes(normalizedSearch)) return false;
    }
    return true;
  });
}

/**
 * Validate a labourer can be assigned to the project (backend enforcement).
 */
export async function assertLabourEligibleForProject(project, labourId) {
  if (!mongoose.Types.ObjectId.isValid(labourId)) {
    return { ok: false, error: 'Invalid labour ID' };
  }

  const existing = await ProjectAssignment.findOne({
    projectId: project._id,
    labourId,
    status: PROJECT_ASSIGNMENT_STATUSES.ACTIVE,
  });
  if (existing) {
    return { ok: false, error: 'Labourer is already assigned to this project' };
  }

  const session = await getActiveDivisionSession(labourId);
  if (!session?.sessionState?.divisionInside) {
    return { ok: false, error: 'Labourer must be currently inside the gate' };
  }

  const labour = {
    labourId: labourId.toString(),
    divisionId: session.divisionId,
    departmentId: session.sessionState?.currentDepartmentId || null,
  };

  if (!labourMatchesProject(labour, project)) {
    if (project.projectType === PROJECT_TYPES.DEPARTMENT_SPECIFIC) {
      return {
        ok: false,
        error: 'Labourer must belong to the project department and be checked into it',
      };
    }
    if (project.projectType === PROJECT_TYPES.DIVISION_SPECIFIC) {
      return {
        ok: false,
        error: 'Labourer must belong to the project division',
      };
    }
    return { ok: false, error: 'Labourer is not eligible for this project' };
  }

  return { ok: true, session };
}

export async function getProjectAssignmentStats(projectIds) {
  const ids = (Array.isArray(projectIds) ? projectIds : [projectIds]).filter(Boolean);
  if (ids.length === 0) return new Map();

  const objectIds = ids.map((id) => new mongoose.Types.ObjectId(String(id)));

  const [rows, activeAssignments] = await Promise.all([
    ProjectAssignment.aggregate([
      {
        $match: {
          projectId: { $in: objectIds },
          status: { $ne: PROJECT_ASSIGNMENT_STATUSES.REMOVED },
        },
      },
      {
        $group: {
          _id: { projectId: '$projectId', status: '$status' },
          count: { $sum: 1 },
        },
      },
    ]),
    ProjectAssignment.find({
      projectId: { $in: objectIds },
      status: PROJECT_ASSIGNMENT_STATUSES.ACTIVE,
    })
      .select('projectId labourId')
      .lean(),
  ]);

  const insideSet = new Set();
  const labourIds = [...new Set(activeAssignments.map((a) => a.labourId?.toString()).filter(Boolean))];
  // Batch live gate status for assigned labour
  await Promise.all(
    labourIds.map(async (labourId) => {
      const session = await getActiveDivisionSession(labourId);
      if (session?.sessionState?.divisionInside) insideSet.add(labourId);
    })
  );

  const workingByProject = new Map();
  for (const a of activeAssignments) {
    const labourId = a.labourId?.toString();
    const projectId = a.projectId?.toString();
    if (!labourId || !projectId || !insideSet.has(labourId)) continue;
    workingByProject.set(projectId, (workingByProject.get(projectId) || 0) + 1);
  }

  const stats = new Map();
  for (const id of ids) {
    stats.set(String(id), {
      totalAssigned: 0,
      activeLabourers: 0,
      completedLabourers: 0,
      labourWorkingToday: 0,
    });
  }

  for (const row of rows) {
    const key = row._id.projectId.toString();
    const entry = stats.get(key) || {
      totalAssigned: 0,
      activeLabourers: 0,
      completedLabourers: 0,
      labourWorkingToday: 0,
    };
    entry.totalAssigned += row.count;
    if (row._id.status === PROJECT_ASSIGNMENT_STATUSES.ACTIVE) {
      entry.activeLabourers += row.count;
    } else if (row._id.status === PROJECT_ASSIGNMENT_STATUSES.COMPLETED) {
      entry.completedLabourers += row.count;
    }
    stats.set(key, entry);
  }

  for (const [projectId, count] of workingByProject.entries()) {
    const entry = stats.get(projectId);
    if (entry) entry.labourWorkingToday = count;
  }

  return stats;
}

export async function serializeAssignedLabourers(projectId) {
  const assignments = await ProjectAssignment.find({
    projectId,
    status: { $ne: PROJECT_ASSIGNMENT_STATUSES.REMOVED },
  })
    .populate({
      path: 'labourId',
      select: '-faceEmbedding',
      populate: { path: 'formId', select: 'fields' },
    })
    .populate('assignedBy', 'displayName username')
    .sort({ assignedAt: -1 })
    .lean();

  const result = [];
  for (const assignment of assignments) {
    const reg = assignment.labourId;
    if (!reg) continue;
    const display = buildDisplayInfo(reg.formData, reg.formId?.fields || []);
    const session = await getActiveDivisionSession(reg._id);
    const inside = Boolean(session?.sessionState?.divisionInside);

    result.push({
      assignmentId: assignment._id.toString(),
      labourId: reg._id.toString(),
      labourName: display.displayName || 'Unknown',
      registrationCode: reg.registrationCode || null,
      photoUrl: photoUrlFromPath(reg.photoPath),
      departmentId: session?.sessionState?.currentDepartmentId || null,
      departmentName: session?.sessionState?.currentDepartmentName || null,
      divisionId: session?.divisionId || null,
      divisionName: session?.divisionName || null,
      entryTime: session?.sessionState?.gateEntryAt || null,
      gateStatus: inside ? 'Inside' : 'Outside',
      assignmentStatus: assignment.status,
      assignedAt: assignment.assignedAt,
      removedAt: assignment.removedAt || null,
      assignedBy: assignment.assignedBy?.displayName || assignment.assignedBy?.username || null,
    });
  }

  return result;
}

/**
 * Build an activity timeline for a project from creation + assignment history.
 */
export async function getProjectActivityTimeline(project) {
  const events = [];

  events.push({
    id: `created-${project._id}`,
    type: 'project_created',
    title: 'Project created',
    description: `${project.projectName} was created`,
    at: project.createdAt,
    actor: null,
  });

  if (project.updatedAt && project.status === 'completed') {
    events.push({
      id: `completed-${project._id}`,
      type: 'project_completed',
      title: 'Project marked completed',
      description: 'Project status set to Completed',
      at: project.updatedAt,
      actor: null,
    });
  }

  if (project.updatedAt && project.status === 'on_hold') {
    events.push({
      id: `onhold-${project._id}`,
      type: 'project_on_hold',
      title: 'Project put on hold',
      description: 'Project status set to On Hold',
      at: project.updatedAt,
      actor: null,
    });
  }

  const assignments = await ProjectAssignment.find({ projectId: project._id })
    .populate({
      path: 'labourId',
      select: 'formData registrationCode formId',
      populate: { path: 'formId', select: 'fields' },
    })
    .populate('assignedBy', 'displayName username')
    .sort({ updatedAt: -1 })
    .lean();

  for (const assignment of assignments) {
    const reg = assignment.labourId;
    const display = reg
      ? buildDisplayInfo(reg.formData, reg.formId?.fields || [])
      : { displayName: 'Unknown' };
    const labourName = display.displayName || 'Unknown';
    const code = reg?.registrationCode ? ` (${reg.registrationCode})` : '';
    const actor = assignment.assignedBy?.displayName || assignment.assignedBy?.username || null;

    events.push({
      id: `assign-${assignment._id}`,
      type: 'labour_assigned',
      title: 'Labour assigned',
      description: `${labourName}${code} assigned to project`,
      at: assignment.assignedAt || assignment.createdAt,
      actor,
      labourId: reg?._id?.toString() || null,
    });

    if (assignment.status === PROJECT_ASSIGNMENT_STATUSES.REMOVED) {
      events.push({
        id: `remove-${assignment._id}`,
        type: 'labour_removed',
        title: 'Assignment removed',
        description: `${labourName}${code} removed from project`,
        at: assignment.removedAt || assignment.updatedAt,
        actor,
        labourId: reg?._id?.toString() || null,
      });
    }

    if (assignment.status === PROJECT_ASSIGNMENT_STATUSES.COMPLETED) {
      events.push({
        id: `done-${assignment._id}`,
        type: 'labour_completed',
        title: 'Assignment completed',
        description: `${labourName}${code} marked completed`,
        at: assignment.updatedAt,
        actor,
        labourId: reg?._id?.toString() || null,
      });
    }
  }

  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return events;
}

/**
 * Append project photo upload / labour-seen events into the activity timeline.
 */
export async function appendProjectPhotoTimelineEvents(project, events = []) {
  const photos = await ProjectDailyPhoto.find({ projectId: project._id })
    .populate('uploadedBy', 'displayName username')
    .sort({ createdAt: -1 })
    .lean();

  for (const photo of photos) {
    const actor = photo.uploadedBy?.displayName || photo.uploadedBy?.username || null;
    events.push({
      id: `photo-${photo._id}`,
      type: 'photo_uploaded',
      title: `Day ${photo.dayIndex} photo uploaded`,
      description: `Site photo for ${photo.photoDate} · ${photo.facesDetected || 0} face(s) · ${photo.matchedAssignedCount || 0} assigned labourer(s) recognised`,
      at: photo.createdAt,
      actor,
      photoDate: photo.photoDate,
      dayIndex: photo.dayIndex,
      photoId: photo._id.toString(),
    });

    for (const detection of photo.detections || []) {
      if (!detection.assignedToProject || !detection.matched) continue;
      events.push({
        id: `seen-${photo._id}-${detection.labourId}`,
        type: 'labour_seen_on_site',
        title: 'Labour seen on project site',
        description: `${detection.labourName || 'Labourer'}${detection.registrationCode ? ` (${detection.registrationCode})` : ''} recognised in Day ${photo.dayIndex} photo`,
        at: photo.createdAt,
        actor,
        labourId: detection.labourId?.toString?.() || detection.labourId || null,
        photoDate: photo.photoDate,
        dayIndex: photo.dayIndex,
        photoId: photo._id.toString(),
      });
    }
  }

  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return events;
}

