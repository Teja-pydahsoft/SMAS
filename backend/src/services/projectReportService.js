import mongoose from 'mongoose';
import Project from '../models/Project.js';
import ProjectAssignment from '../models/ProjectAssignment.js';
import GateLog from '../models/GateLog.js';
import ProjectDailyPhoto from '../models/ProjectDailyPhoto.js';
import {
  PROJECT_ASSIGNMENT_STATUSES,
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE_LABELS,
  SCAN_TYPES,
  GATE_EVENT_TYPES,
} from '../constants/index.js';
import { buildDisplayInfo, photoUrlFromPath } from '../utils/displayInfo.js';
import {
  todayDateString,
  startOfDay,
  endOfDay,
  getActiveDivisionSession,
} from './attendanceService.js';
import { getProjectPhotoWindow } from './projectPhotoService.js';
import {
  getProjectActivityTimeline,
  appendProjectPhotoTimelineEvents,
} from './projectService.js';
import { addDaysIst, todayDateStringIst } from '../utils/istTime.js';

function toId(value) {
  if (!value) return null;
  return value._id?.toString?.() || value.toString();
}

/** Drop empty / literal "undefined" query ids so Mongoose never casts them. */
function cleanObjectId(value) {
  if (value == null || value === '') return undefined;
  const str = String(value).trim();
  if (!str || str === 'undefined' || str === 'null') return undefined;
  if (!mongoose.Types.ObjectId.isValid(str)) return undefined;
  return str;
}

function hoursBetween(entryAt, exitAt) {
  if (!entryAt || !exitAt) return null;
  const ms = new Date(exitAt).getTime() - new Date(entryAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.round((ms / 36e5) * 100) / 100;
}

function attendanceStatus({ entryAt, exitAt, inside }) {
  if (inside) return 'Present';
  if (entryAt && exitAt) return 'Completed';
  if (entryAt) return 'Incomplete';
  return 'Absent';
}

async function loadProjectOrThrow(projectId) {
  if (!mongoose.Types.ObjectId.isValid(projectId)) {
    const err = new Error('Invalid project id');
    err.status = 400;
    throw err;
  }
  const project = await Project.findById(projectId)
    .populate('departmentId', 'name slug')
    .populate('divisionId', 'name slug')
    .populate('createdBy', 'displayName username')
    .lean();
  if (!project) {
    const err = new Error('Project not found');
    err.status = 404;
    throw err;
  }
  return project;
}

async function getProjectAssignments(projectId, { includeRemoved = false } = {}) {
  const filter = { projectId };
  if (!includeRemoved) {
    filter.status = { $ne: PROJECT_ASSIGNMENT_STATUSES.REMOVED };
  }
  return ProjectAssignment.find(filter)
    .populate({
      path: 'labourId',
      select: '-faceEmbedding',
      populate: [
        { path: 'formId', select: 'fields' },
        { path: 'roleId', select: 'name slug' },
      ],
    })
    .populate('assignedBy', 'displayName username')
    .sort({ assignedAt: -1 })
    .lean();
}

function serializeLabour(reg) {
  if (!reg) return null;
  const display = buildDisplayInfo(reg.formData, reg.formId?.fields || []);
  return {
    labourId: reg._id.toString(),
    labourName: display.displayName || 'Unknown',
    registrationCode: reg.registrationCode || null,
    photoUrl: photoUrlFromPath(reg.photoPath),
    roleName: reg.roleId?.name || null,
  };
}

function resolveDateRange(dateFrom, dateTo) {
  const today = todayDateString();
  const from = dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom) ? dateFrom : today;
  const to = dateTo && /^\d{4}-\d{2}-\d{2}$/.test(dateTo) ? dateTo : from;
  return {
    dateFrom: from <= to ? from : to,
    dateTo: from <= to ? to : from,
    fromDate: startOfDay(from <= to ? from : to),
    toDate: endOfDay(from <= to ? to : from),
  };
}

function daysInRange(dateFrom, dateTo) {
  const days = [];
  let cursor = dateFrom;
  while (cursor <= dateTo) {
    days.push(cursor);
    cursor = addDaysIst(cursor, 1);
  }
  return days;
}

/**
 * Authoritative assignment window from project_assignments.
 * assigned_at … removed_at (or today if still active).
 */
function assignmentPeriod(assignment) {
  const assignedAt = assignment?.assignedAt || assignment?.createdAt || new Date();
  const dateFrom = todayDateStringIst(assignedAt);

  let removedAt = assignment?.removedAt || null;
  if (
    !removedAt &&
    (assignment?.status === PROJECT_ASSIGNMENT_STATUSES.REMOVED ||
      assignment?.status === PROJECT_ASSIGNMENT_STATUSES.COMPLETED) &&
    assignment?.updatedAt
  ) {
    // Legacy rows before removedAt existed
    removedAt = assignment.updatedAt;
  }

  const dateTo = removedAt ? todayDateStringIst(removedAt) : todayDateString();
  const safeTo = dateTo < dateFrom ? dateFrom : dateTo;

  return {
    assignedAt,
    removedAt,
    dateFrom,
    dateTo: safeTo,
    fromDate: startOfDay(dateFrom),
    toDate: endOfDay(safeTo),
  };
}

function intersectRanges(reportRange, period) {
  if (!reportRange || !period) return null;
  const dateFrom =
    reportRange.dateFrom > period.dateFrom ? reportRange.dateFrom : period.dateFrom;
  const dateTo = reportRange.dateTo < period.dateTo ? reportRange.dateTo : period.dateTo;
  if (dateFrom > dateTo) return null;
  return {
    dateFrom,
    dateTo,
    fromDate: startOfDay(dateFrom),
    toDate: endOfDay(dateTo),
  };
}

function isDateInPeriod(dateStr, period) {
  if (!dateStr || !period) return false;
  return dateStr >= period.dateFrom && dateStr <= period.dateTo;
}

function labourIdOf(assignment) {
  return assignment?.labourId?._id || assignment?.labourId || null;
}

function effectiveAssignmentRange(assignment, reportRange) {
  return intersectRanges(reportRange, assignmentPeriod(assignment));
}

/**
 * Gate logs only within each labourer's assignment ∩ report date range.
 * Never returns global attendance outside the project assignment window.
 */
async function gateLogsForAssignments(
  assignments,
  reportRange,
  { divisionId, departmentId, gateId } = {}
) {
  const clauses = [];
  for (const assignment of assignments) {
    const labourId = labourIdOf(assignment);
    if (!labourId) continue;
    const effective = effectiveAssignmentRange(assignment, reportRange);
    if (!effective) continue;
    clauses.push({
      registrationId: labourId,
      createdAt: { $gte: effective.fromDate, $lte: effective.toDate },
    });
  }
  if (!clauses.length) return [];

  const filter = {
    matched: true,
    scanType: SCAN_TYPES.GATE,
    $and: [
      { $or: clauses },
      { $or: [{ accessGranted: true }, { accessGranted: { $exists: false } }] },
    ],
  };

  const cleanedDivision = cleanObjectId(divisionId);
  const cleanedDepartment = cleanObjectId(departmentId);
  const cleanedGate = cleanObjectId(gateId);
  if (cleanedDivision) filter.divisionId = cleanedDivision;
  if (cleanedDepartment) filter.departmentId = cleanedDepartment;
  if (cleanedGate) filter.gateRefId = cleanedGate;
  else if (
    gateId &&
    String(gateId) !== 'undefined' &&
    String(gateId) !== 'null' &&
    String(gateId).trim()
  ) {
    filter.gateId = gateId;
  }

  return GateLog.find(filter)
    .populate('divisionId', 'name')
    .populate('departmentId', 'name')
    .populate('gateRefId', 'name')
    .populate('scannedBy', 'displayName username')
    .sort({ createdAt: 1 })
    .lean();
}

/** Keep only logs that fall inside a specific assignment period. */
function filterLogsForAssignment(logs, assignment) {
  const period = assignmentPeriod(assignment);
  const labourId = String(toId(labourIdOf(assignment)) || '');
  return (logs || []).filter((log) => {
    if (toId(log.registrationId) !== labourId) return false;
    return isDateInPeriod(todayDateStringIst(log.createdAt), period);
  });
}

function projectProgress(project) {
  const { startDate, endDate, requiredDays } = getProjectPhotoWindow(project);
  const today = todayDateString();
  let completedDays = 0;
  if (today <= startDate) completedDays = 0;
  else if (today > endDate) completedDays = requiredDays;
  else {
    completedDays =
      Math.round(
        (new Date(`${today}T12:00:00+05:30`).getTime() -
          new Date(`${startDate}T12:00:00+05:30`).getTime()) /
          (24 * 60 * 60 * 1000)
      ) + 1;
    completedDays = Math.min(requiredDays, Math.max(0, completedDays));
  }
  const remainingDays = Math.max(0, requiredDays - completedDays);
  const completionPct = requiredDays > 0 ? Math.round((completedDays / requiredDays) * 100) : 0;
  return {
    startDate,
    endDate,
    requiredDays,
    completedDays,
    remainingDays,
    completionPct,
  };
}

function buildDayAttendance(logsForLabour, session) {
  const entry = logsForLabour.find((l) => l.eventType === GATE_EVENT_TYPES.ENTRY) || null;
  const exits = logsForLabour.filter((l) => l.eventType === GATE_EVENT_TYPES.EXIT);
  const exit = exits.length ? exits[exits.length - 1] : null;
  const entryAt = entry?.createdAt || session?.sessionState?.gateEntryAt || null;
  const exitAt = exit?.createdAt || session?.sessionState?.gateExitAt || null;
  const inside = Boolean(session?.sessionState?.divisionInside);
  const workedHours = hoursBetween(entryAt, exitAt);
  return {
    entryAt,
    exitAt,
    workedHours,
    inside,
    status: attendanceStatus({ entryAt, exitAt, inside }),
    entryPhotoUrl: photoUrlFromPath(entry?.photoPath),
    exitPhotoUrl: photoUrlFromPath(exit?.photoPath),
    entryGateName: entry?.gateRefId?.name || entry?.gateId || null,
    exitGateName: exit?.gateRefId?.name || exit?.gateId || null,
    entryOperator: entry?.scannedByName || entry?.scannedBy?.displayName || null,
    exitOperator: exit?.scannedByName || exit?.scannedBy?.displayName || null,
    entryMatchScore: entry?.matchScore ?? null,
    exitMatchScore: exit?.matchScore ?? null,
    divisionName: entry?.divisionId?.name || exit?.divisionId?.name || session?.divisionName || null,
    departmentName:
      entry?.departmentId?.name ||
      exit?.departmentId?.name ||
      session?.sessionState?.currentDepartmentName ||
      null,
    divisionId: toId(entry?.divisionId || exit?.divisionId || session?.divisionId),
    departmentId: toId(
      entry?.departmentId ||
        exit?.departmentId ||
        session?.sessionState?.currentDepartmentId
    ),
  };
}

export async function getProjectReportOverview(projectId, query = {}) {
  const project = await loadProjectOrThrow(projectId);
  const range = resolveDateRange(query.dateFrom, query.dateTo);
  const progress = projectProgress(project);
  const today = todayDateString();
  const todayRange = resolveDateRange(today, today);

  const assignments = await getProjectAssignments(projectId, { includeRemoved: true });
  const activeAssignments = assignments.filter((a) => a.status === PROJECT_ASSIGNMENT_STATUSES.ACTIVE);
  // Only labourers whose assignment covers today contribute to today's KPIs
  const activeToday = activeAssignments.filter((a) =>
    isDateInPeriod(today, assignmentPeriod(a))
  );

  const extraFilters = {
    divisionId: cleanObjectId(query.divisionId),
    departmentId: cleanObjectId(query.departmentId),
    gateId:
      cleanObjectId(query.gateId) ||
      (query.gateId && String(query.gateId) !== 'undefined' ? query.gateId : undefined),
  };

  const todayLogs = await gateLogsForAssignments(activeToday, todayRange, extraFilters);
  const logsByLabour = new Map();
  for (const log of todayLogs) {
    const id = toId(log.registrationId);
    if (!logsByLabour.has(id)) logsByLabour.set(id, []);
    logsByLabour.get(id).push(log);
  }

  let todayAttendance = 0;
  let currentlyInside = 0;
  let exitedToday = 0;

  for (const assignment of activeToday) {
    const labourId = String(toId(labourIdOf(assignment)));
    if (!labourId) continue;
    const session = await getActiveDivisionSession(labourId);
    const day = buildDayAttendance(logsByLabour.get(labourId) || [], session);
    if (day.entryAt || day.inside) todayAttendance += 1;
    if (day.inside) currentlyInside += 1;
    if (day.exitAt && !day.inside) exitedToday += 1;
  }

  // Man-days only within assignment ∩ report range (include removed assignments for past days)
  const overlapping = assignments.filter((a) => effectiveAssignmentRange(a, range));
  const rangeLogs = await gateLogsForAssignments(overlapping, range, {
    divisionId: cleanObjectId(query.divisionId),
    departmentId: cleanObjectId(query.departmentId),
  });
  const manDayKeys = new Set();
  for (const log of rangeLogs) {
    if (log.eventType !== GATE_EVENT_TYPES.ENTRY) continue;
    const day = todayDateStringIst(log.createdAt);
    manDayKeys.add(`${toId(log.registrationId)}:${day}`);
  }

  let timeline = await getProjectActivityTimeline(project);
  timeline = await appendProjectPhotoTimelineEvents(project, timeline);
  // Keep timeline events that are project-level or fall within an assignment window
  const assignmentByLabour = new Map();
  for (const a of assignments) {
    const id = toId(labourIdOf(a));
    if (!id) continue;
    if (!assignmentByLabour.has(id)) assignmentByLabour.set(id, []);
    assignmentByLabour.get(id).push(a);
  }
  timeline = timeline.filter((event) => {
    if (!event.labourId) return true;
    const list = assignmentByLabour.get(String(event.labourId)) || [];
    if (!list.length) return true;
    if (event.type === 'labour_assigned' || event.type === 'labour_removed') return true;
    const day = todayDateStringIst(event.at);
    return list.some((a) => isDateInPeriod(day, assignmentPeriod(a)));
  });
  timeline = timeline.slice(0, 40);

  return {
    project: {
      id: project._id.toString(),
      projectName: project.projectName,
      status: project.status,
      statusLabel: PROJECT_STATUS_LABELS[project.status] || project.status,
      projectType: project.projectType,
      projectTypeLabel: PROJECT_TYPE_LABELS[project.projectType] || project.projectType,
      description: project.description || '',
      department: project.departmentId
        ? { id: toId(project.departmentId), name: project.departmentId.name }
        : null,
      division: project.divisionId
        ? { id: toId(project.divisionId), name: project.divisionId.name }
        : null,
      createdBy: project.createdBy?.displayName || project.createdBy?.username || null,
      createdAt: project.createdAt,
    },
    progress,
    summary: {
      totalAssignedLabour: activeAssignments.length,
      todayAttendance,
      currentlyInside,
      exitedToday,
      totalManDays: manDayKeys.size,
      requiredDays: progress.requiredDays,
      completedDays: progress.completedDays,
      remainingDays: progress.remainingDays,
      completionPct: progress.completionPct,
    },
    timeline,
    dateRange: { dateFrom: range.dateFrom, dateTo: range.dateTo },
  };
}

export async function getProjectReportAttendance(projectId, query = {}) {
  const project = await loadProjectOrThrow(projectId);
  const range = resolveDateRange(query.dateFrom || query.date, query.dateTo || query.date);
  const page = Math.max(1, parseInt(query.page || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(query.limit || '25', 10)));
  const search = (query.search || '').trim().toLowerCase();
  const attendanceFilter = query.attendanceStatus || '';

  let assignments = await getProjectAssignments(projectId, { includeRemoved: true });

  const labourFilterId = cleanObjectId(query.labourId);
  const divisionFilterId = cleanObjectId(query.divisionId);
  const departmentFilterId = cleanObjectId(query.departmentId);
  const gateFilterId = cleanObjectId(query.gateId) || (
    query.gateId && !['undefined', 'null', ''].includes(String(query.gateId)) ? query.gateId : undefined
  );

  if (labourFilterId) {
    assignments = assignments.filter((a) => toId(a.labourId) === labourFilterId);
  }

  // Attendance day = end of selected range; only assignments covering that day
  const focusDate = range.dateTo;
  assignments = assignments.filter((a) => isDateInPeriod(focusDate, assignmentPeriod(a)));

  const focusRange = resolveDateRange(focusDate, focusDate);
  const logs = await gateLogsForAssignments(assignments, focusRange, {
    divisionId: divisionFilterId,
    departmentId: departmentFilterId,
    gateId: gateFilterId,
  });

  const logsByLabour = new Map();
  for (const log of logs) {
    const id = toId(log.registrationId);
    if (!logsByLabour.has(id)) logsByLabour.set(id, []);
    logsByLabour.get(id).push(log);
  }

  const rows = [];
  for (const assignment of assignments) {
    const reg = assignment.labourId;
    if (!reg) continue;
    const labour = serializeLabour(reg);
    if (
      search &&
      !`${labour.labourName} ${labour.registrationCode || ''}`.toLowerCase().includes(search)
    ) {
      continue;
    }

    const period = assignmentPeriod(assignment);
    const isActiveOnDay =
      assignment.status === PROJECT_ASSIGNMENT_STATUSES.ACTIVE && isDateInPeriod(focusDate, period);
    const session = isActiveOnDay ? await getActiveDivisionSession(reg._id) : null;
    const day = buildDayAttendance(logsByLabour.get(reg._id.toString()) || [], session);

    // Do not leak live gate session into days outside assignment / inactive assignments
    if (!isActiveOnDay) {
      day.inside = false;
      if (!day.entryAt) day.status = attendanceStatus({ entryAt: day.entryAt, exitAt: day.exitAt, inside: false });
    }

    if (divisionFilterId && day.divisionId && day.divisionId !== divisionFilterId) continue;
    if (departmentFilterId && day.departmentId && day.departmentId !== departmentFilterId) {
      continue;
    }
    if (attendanceFilter && day.status !== attendanceFilter) continue;

    rows.push({
      ...labour,
      assignmentId: assignment._id.toString(),
      assignedAt: assignment.assignedAt,
      removedAt: period.removedAt,
      date: focusDate,
      divisionName: day.divisionName,
      departmentName: day.departmentName,
      entryTime: day.entryAt,
      exitTime: day.exitAt,
      workedHours: day.workedHours,
      attendanceStatus: day.status,
      gateStatus: day.inside ? 'Inside' : day.exitAt ? 'Outside' : 'Not In',
      entryPhotoUrl: day.entryPhotoUrl,
      exitPhotoUrl: day.exitPhotoUrl,
    });
  }

  const sortKey = query.sort || 'labourName';
  const sortDir = query.sortDir === 'desc' ? -1 : 1;
  rows.sort((a, b) => {
    const av = a[sortKey] ?? '';
    const bv = b[sortKey] ?? '';
    if (av < bv) return -1 * sortDir;
    if (av > bv) return 1 * sortDir;
    return 0;
  });

  const total = rows.length;
  const start = (page - 1) * limit;
  const pageRows = rows.slice(start, start + limit);

  return {
    projectId: project._id.toString(),
    date: focusDate,
    dateRange: { dateFrom: range.dateFrom, dateTo: range.dateTo },
    total,
    page,
    limit,
    rows: pageRows,
  };
}

export async function getProjectReportHistory(projectId, query = {}) {
  const project = await loadProjectOrThrow(projectId);
  const range = resolveDateRange(
    query.dateFrom || todayDateStringIst(project.createdAt),
    query.dateTo || todayDateString()
  );

  let assignments = await getProjectAssignments(projectId, { includeRemoved: true });
  const labourFilterId = cleanObjectId(query.labourId);
  if (labourFilterId) {
    assignments = assignments.filter((a) => toId(a.labourId) === labourFilterId);
  }

  // Only assignments that overlap the report window
  assignments = assignments.filter((a) => effectiveAssignmentRange(a, range));

  const logs = await gateLogsForAssignments(assignments, range);
  const search = (query.search || '').trim().toLowerCase();

  const rows = [];
  for (const assignment of assignments) {
    const reg = assignment.labourId;
    if (!reg) continue;
    const labour = serializeLabour(reg);
    if (
      search &&
      !`${labour.labourName} ${labour.registrationCode || ''}`.toLowerCase().includes(search)
    ) {
      continue;
    }

    const period = assignmentPeriod(assignment);
    const effective = effectiveAssignmentRange(assignment, range);
    if (!effective) continue;

    const assignmentLogs = filterLogsForAssignment(logs, assignment).filter((log) => {
      const day = todayDateStringIst(log.createdAt);
      return day >= effective.dateFrom && day <= effective.dateTo;
    });

    const entryDays = new Set();
    const byLabourDay = new Map();
    for (const log of assignmentLogs) {
      const day = todayDateStringIst(log.createdAt);
      if (!byLabourDay.has(day)) byLabourDay.set(day, []);
      byLabourDay.get(day).push(log);
      if (log.eventType === GATE_EVENT_TYPES.ENTRY) entryDays.add(day);
    }

    const hours = [];
    for (const [, dayLogs] of byLabourDay) {
      const day = buildDayAttendance(dayLogs, null);
      if (day.workedHours != null) hours.push(day.workedHours);
    }

    const windowDays = Math.max(1, daysInRange(effective.dateFrom, effective.dateTo).length);
    const daysWorked = entryDays.size;
    const avgHours =
      hours.length > 0
        ? Math.round((hours.reduce((s, h) => s + h, 0) / hours.length) * 100) / 100
        : 0;
    const attendancePct = Math.round((daysWorked / windowDays) * 100);

    rows.push({
      ...labour,
      assignmentId: assignment._id.toString(),
      assignedAt: assignment.assignedAt,
      removedAt: period.removedAt,
      assignmentPeriodFrom: period.dateFrom,
      assignmentPeriodTo: period.dateTo,
      assignmentStatus: assignment.status,
      assignedBy: assignment.assignedBy?.displayName || assignment.assignedBy?.username || null,
      daysWorked,
      attendancePercentage: attendancePct,
      averageWorkingHours: avgHours,
      currentStatus: assignment.status,
    });
  }

  return {
    projectId: project._id.toString(),
    dateRange: { dateFrom: range.dateFrom, dateTo: range.dateTo },
    total: rows.length,
    rows,
  };
}

export async function getProjectReportLabourDetail(projectId, labourId, query = {}) {
  const assignment = await ProjectAssignment.findOne({ projectId, labourId })
    .sort({ assignedAt: -1 })
    .select('_id')
    .lean();
  if (!assignment) {
    const err = new Error('Labour assignment not found on this project');
    err.status = 404;
    throw err;
  }
  return getProjectReportLabourByAssignment(assignment._id.toString(), query);
}

/**
 * Labour report for a specific project assignment (authoritative period filter).
 * Optional query.section: overview | attendance | gate | faces | assignment | all
 */
export async function getProjectReportLabourByAssignment(assignmentId, query = {}) {
  if (!mongoose.Types.ObjectId.isValid(assignmentId)) {
    const err = new Error('Invalid assignment id');
    err.status = 400;
    throw err;
  }

  const assignment = await ProjectAssignment.findById(assignmentId)
    .populate({
      path: 'labourId',
      select: '-faceEmbedding',
      populate: [
        { path: 'formId', select: 'fields' },
        { path: 'roleId', select: 'name' },
      ],
    })
    .populate('assignedBy', 'displayName username')
    .populate({
      path: 'projectId',
      populate: [
        { path: 'departmentId', select: 'name' },
        { path: 'divisionId', select: 'name' },
        { path: 'createdBy', select: 'displayName username' },
      ],
    })
    .lean();

  if (!assignment?.labourId || !assignment?.projectId) {
    const err = new Error('Assignment not found');
    err.status = 404;
    throw err;
  }

  const project = assignment.projectId;
  const labour = serializeLabour(assignment.labourId);
  const period = assignmentPeriod(assignment);
  const reportRange = resolveDateRange(
    query.dateFrom || period.dateFrom,
    query.dateTo || period.dateTo
  );
  const effective = intersectRanges(reportRange, period);
  const section = (query.section || 'all').toLowerCase();

  const projectInfo = {
    id: project._id.toString(),
    projectName: project.projectName,
    status: project.status,
    statusLabel: PROJECT_STATUS_LABELS[project.status] || project.status,
    projectType: project.projectType,
    projectTypeLabel: PROJECT_TYPE_LABELS[project.projectType] || project.projectType,
    department: project.departmentId
      ? { id: toId(project.departmentId), name: project.departmentId.name }
      : null,
    division: project.divisionId
      ? { id: toId(project.divisionId), name: project.divisionId.name }
      : null,
  };

  const assignmentInfo = {
    id: assignment._id.toString(),
    status: assignment.status,
    assignedAt: assignment.assignedAt,
    removedAt: period.removedAt,
    periodFrom: period.dateFrom,
    periodTo: period.dateTo,
    assignedBy: assignment.assignedBy?.displayName || assignment.assignedBy?.username || null,
    projectName: project.projectName,
    departmentName: projectInfo.department?.name || null,
    divisionName: projectInfo.division?.name || null,
  };

  const header = {
    labour,
    project: projectInfo,
    assignment: assignmentInfo,
    departmentName: projectInfo.department?.name || null,
    divisionName: projectInfo.division?.name || null,
    currentStatus: assignment.status,
  };

  const emptyPayload = {
    header,
    overview: null,
    attendanceHistory: [],
    gateActivity: [],
    faceCaptureRecords: [],
    projectAssignment: assignmentInfo,
    summary: null,
    dateRange: effective
      ? { dateFrom: effective.dateFrom, dateTo: effective.dateTo }
      : { dateFrom: period.dateFrom, dateTo: period.dateTo },
    generatedAt: new Date().toISOString(),
  };

  if (!effective) {
    return emptyPayload;
  }

  const needLogs =
    section === 'all' ||
    section === 'overview' ||
    section === 'attendance' ||
    section === 'gate' ||
    section === 'faces' ||
    section === 'export';

  let logs = [];
  if (needLogs) {
    logs = await gateLogsForAssignments([assignment], effective);
  }

  const byDay = new Map();
  for (const log of logs) {
    const day = todayDateStringIst(log.createdAt);
    if (day < effective.dateFrom || day > effective.dateTo) continue;
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(log);
  }

  const attendanceHistory = [...byDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, dayLogs]) => {
      const day = buildDayAttendance(dayLogs, null);
      return {
        date,
        entryTime: day.entryAt,
        exitTime: day.exitAt,
        workedHours: day.workedHours,
        attendanceStatus: day.status,
        status: day.status,
        entryPhotoUrl: day.entryPhotoUrl,
        exitPhotoUrl: day.exitPhotoUrl,
      };
    });

  const gateActivity = [...byDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, dayLogs]) => {
      const entries = dayLogs.filter((l) => l.eventType === GATE_EVENT_TYPES.ENTRY);
      const exits = dayLogs.filter((l) => l.eventType === GATE_EVENT_TYPES.EXIT);
      const entry = entries[0] || null;
      const exit = exits.length ? exits[exits.length - 1] : null;
      const remarks = [entry?.remark, exit?.remark].filter((r) => r && String(r).trim()).join('; ');
      return {
        date,
        gate: entry?.gateRefId?.name || entry?.gateId || exit?.gateRefId?.name || exit?.gateId || null,
        entry: entry?.createdAt || null,
        exit: exit?.createdAt || null,
        operator:
          entry?.scannedByName ||
          entry?.scannedBy?.displayName ||
          exit?.scannedByName ||
          exit?.scannedBy?.displayName ||
          null,
        remarks: remarks || '',
        entryPhotoUrl: photoUrlFromPath(entry?.photoPath),
        exitPhotoUrl: photoUrlFromPath(exit?.photoPath),
      };
    });

  let faceCaptureRecords = [];
  if (section === 'all' || section === 'faces' || section === 'overview' || section === 'export') {
    faceCaptureRecords = [...byDay.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, dayLogs]) => {
        const entries = dayLogs.filter((l) => l.eventType === GATE_EVENT_TYPES.ENTRY);
        const exits = dayLogs.filter((l) => l.eventType === GATE_EVENT_TYPES.EXIT);
        const entry = entries[0] || null;
        const exit = exits.length ? exits[exits.length - 1] : null;
        return {
          id: `${toId(assignment.labourId)}:${date}`,
          date,
          registeredPhotoUrl: labour.photoUrl,
          entryCapture: entry
            ? {
                photoUrl: photoUrlFromPath(entry.photoPath),
                at: entry.createdAt,
                gateName: entry.gateRefId?.name || entry.gateId || null,
                operator: entry.scannedByName || entry.scannedBy?.displayName || null,
                camera: entry.gateRefId?.name || entry.gateId || null,
                matchScore: entry.matchScore ?? null,
                verified: Boolean(entry.matched && entry.accessGranted),
              }
            : null,
          exitCapture: exit
            ? {
                photoUrl: photoUrlFromPath(exit.photoPath),
                at: exit.createdAt,
                gateName: exit.gateRefId?.name || exit.gateId || null,
                operator: exit.scannedByName || exit.scannedBy?.displayName || null,
                camera: exit.gateRefId?.name || exit.gateId || null,
                matchScore: exit.matchScore ?? null,
                verified: Boolean(exit.matched && exit.accessGranted),
              }
            : null,
          captureTime: entry?.createdAt || exit?.createdAt || null,
          verificationStatus:
            entry || exit
              ? Boolean(
                  (entry && entry.matched && entry.accessGranted) ||
                    (exit && exit.matched && exit.accessGranted)
                )
                ? 'Verified'
                : 'Unverified'
              : '—',
          camera: entry?.gateRefId?.name || entry?.gateId || exit?.gateRefId?.name || exit?.gateId || null,
          similarityScore: entry?.matchScore ?? exit?.matchScore ?? null,
        };
      });
  }

  const daysWorked = attendanceHistory.filter(
    (d) => d.entryTime || d.attendanceStatus === 'Present' || d.attendanceStatus === 'Completed'
  ).length;
  const windowDays = Math.max(1, daysInRange(effective.dateFrom, effective.dateTo).length);
  const attendancePercentage = Math.round((daysWorked / windowDays) * 100);
  const totalHours = attendanceHistory.reduce((s, d) => s + (Number(d.workedHours) || 0), 0);
  const avgHours =
    daysWorked > 0 ? Math.round((totalHours / daysWorked) * 100) / 100 : 0;

  const summary = {
    daysWorked,
    windowDays,
    attendancePercentage,
    totalWorkedHours: Math.round(totalHours * 100) / 100,
    averageWorkingHours: avgHours,
    gateDays: gateActivity.length,
    faceCaptureDays: faceCaptureRecords.length,
    periodFrom: period.dateFrom,
    periodTo: period.dateTo,
  };

  const overview = {
    labour,
    project: projectInfo,
    assignment: assignmentInfo,
    summary,
    recentAttendance: attendanceHistory.slice(0, 5),
    recentGateActivity: gateActivity.slice(0, 5),
  };

  const payload = {
    header,
    overview,
    attendanceHistory,
    gateActivity,
    faceCaptureRecords,
    projectAssignment: assignmentInfo,
    summary,
    dateRange: { dateFrom: effective.dateFrom, dateTo: effective.dateTo },
    generatedAt: new Date().toISOString(),
  };

  if (section === 'overview') {
    return {
      header,
      overview,
      summary,
      dateRange: payload.dateRange,
      generatedAt: payload.generatedAt,
    };
  }
  if (section === 'attendance') {
    return {
      header,
      attendanceHistory,
      summary,
      dateRange: payload.dateRange,
      generatedAt: payload.generatedAt,
    };
  }
  if (section === 'gate') {
    return {
      header,
      gateActivity,
      dateRange: payload.dateRange,
      generatedAt: payload.generatedAt,
    };
  }
  if (section === 'faces') {
    return {
      header,
      faceCaptureRecords,
      dateRange: payload.dateRange,
      generatedAt: payload.generatedAt,
    };
  }
  if (section === 'assignment') {
    return {
      header,
      projectAssignment: assignmentInfo,
      dateRange: payload.dateRange,
      generatedAt: payload.generatedAt,
    };
  }

  return payload;
}

export async function getProjectReportFaces(projectId, query = {}) {
  const project = await loadProjectOrThrow(projectId);
  const range = resolveDateRange(
    query.dateFrom || todayDateStringIst(project.createdAt),
    query.dateTo || todayDateString()
  );

  let assignments = await getProjectAssignments(projectId, { includeRemoved: true });
  const labourFilterId = cleanObjectId(query.labourId);
  if (labourFilterId) {
    assignments = assignments.filter((a) => toId(a.labourId) === labourFilterId);
  }
  assignments = assignments.filter((a) => effectiveAssignmentRange(a, range));

  const labourMap = new Map();
  for (const a of assignments) {
    if (!a.labourId) continue;
    const id = a.labourId._id.toString();
    if (!labourMap.has(id)) labourMap.set(id, serializeLabour(a.labourId));
  }

  const logs = await gateLogsForAssignments(assignments, range, {
    gateId: cleanObjectId(query.gateId) || query.gateId,
    divisionId: cleanObjectId(query.divisionId),
  });

  // Index assignments by labour for per-day membership checks
  const assignmentsByLabour = new Map();
  for (const a of assignments) {
    const id = toId(labourIdOf(a));
    if (!id) continue;
    if (!assignmentsByLabour.has(id)) assignmentsByLabour.set(id, []);
    assignmentsByLabour.get(id).push(a);
  }

  const byLabourDay = new Map();
  for (const log of logs) {
    const id = toId(log.registrationId);
    const day = todayDateStringIst(log.createdAt);
    const covers = (assignmentsByLabour.get(id) || []).some((a) => {
      const effective = effectiveAssignmentRange(a, range);
      return effective && day >= effective.dateFrom && day <= effective.dateTo;
    });
    if (!covers) continue;
    const key = `${id}:${day}`;
    if (!byLabourDay.has(key)) byLabourDay.set(key, []);
    byLabourDay.get(key).push(log);
  }

  const records = [];
  for (const [key, dayLogs] of byLabourDay) {
    const [labourId, date] = key.split(':');
    const labour = labourMap.get(labourId);
    if (!labour) continue;
    const entries = dayLogs.filter((l) => l.eventType === GATE_EVENT_TYPES.ENTRY);
    const exits = dayLogs.filter((l) => l.eventType === GATE_EVENT_TYPES.EXIT);
    const entry = entries[0] || null;
    const exit = exits[exits.length - 1] || null;

    const captures = dayLogs.map((log) => ({
      id: log._id.toString(),
      type: log.eventType,
      at: log.createdAt,
      photoUrl: photoUrlFromPath(log.photoPath),
      gateName: log.gateRefId?.name || log.gateId || null,
      operator: log.scannedByName || log.scannedBy?.displayName || null,
      matchScore: log.matchScore,
      verified: Boolean(log.matched && log.accessGranted),
    }));

    records.push({
      id: key,
      date,
      labour,
      registeredPhotoUrl: labour.photoUrl,
      entryCapture: entry
        ? {
            photoUrl: photoUrlFromPath(entry.photoPath),
            at: entry.createdAt,
            gateName: entry.gateRefId?.name || entry.gateId || null,
            operator: entry.scannedByName || entry.scannedBy?.displayName || null,
            matchScore: entry.matchScore,
            verified: Boolean(entry.matched && entry.accessGranted),
          }
        : null,
      exitCapture: exit
        ? {
            photoUrl: photoUrlFromPath(exit.photoPath),
            at: exit.createdAt,
            gateName: exit.gateRefId?.name || exit.gateId || null,
            operator: exit.scannedByName || exit.scannedBy?.displayName || null,
            matchScore: exit.matchScore,
            verified: Boolean(exit.matched && exit.accessGranted),
          }
        : null,
      captures: captures.sort((a, b) => new Date(a.at) - new Date(b.at)),
    });
  }

  records.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return (a.labour.labourName || '').localeCompare(b.labour.labourName || '');
  });

  return {
    projectId: project._id.toString(),
    dateRange: { dateFrom: range.dateFrom, dateTo: range.dateTo },
    total: records.length,
    records,
  };
}

export async function getProjectReportAnalytics(projectId, query = {}) {
  const project = await loadProjectOrThrow(projectId);
  const range = resolveDateRange(
    query.dateFrom || todayDateStringIst(project.createdAt),
    query.dateTo || todayDateString()
  );
  const days = daysInRange(range.dateFrom, range.dateTo);

  const assignments = (await getProjectAssignments(projectId, { includeRemoved: true })).filter(
    (a) => effectiveAssignmentRange(a, range)
  );
  const activeAssignments = assignments.filter(
    (a) => a.status === PROJECT_ASSIGNMENT_STATUSES.ACTIVE
  );

  const logs = await gateLogsForAssignments(assignments, range);

  const assignmentsByLabour = new Map();
  for (const a of assignments) {
    const id = toId(labourIdOf(a));
    if (!id) continue;
    if (!assignmentsByLabour.has(id)) assignmentsByLabour.set(id, []);
    assignmentsByLabour.get(id).push(a);
  }

  const labourAssignedOn = (labourId, date) =>
    (assignmentsByLabour.get(String(labourId)) || []).some((a) => {
      const effective = effectiveAssignmentRange(a, range);
      return effective && date >= effective.dateFrom && date <= effective.dateTo;
    });

  const dailyAttendance = days.map((date) => {
    const dayLogs = logs.filter((l) => {
      const d = todayDateStringIst(l.createdAt);
      return d === date && labourAssignedOn(toId(l.registrationId), date);
    });
    const present = new Set(
      dayLogs
        .filter((l) => l.eventType === GATE_EVENT_TYPES.ENTRY)
        .map((l) => toId(l.registrationId))
    );
    const entries = dayLogs.filter((l) => l.eventType === GATE_EVENT_TYPES.ENTRY).length;
    const exits = dayLogs.filter((l) => l.eventType === GATE_EVENT_TYPES.EXIT).length;
    const assignedCount = [...assignmentsByLabour.keys()].filter((id) =>
      labourAssignedOn(id, date)
    ).length;
    return {
      date,
      present: present.size,
      entries,
      exits,
      assigned: assignedCount,
    };
  });

  const deptCounts = new Map();
  const divCounts = new Map();
  for (const log of logs) {
    if (log.eventType !== GATE_EVENT_TYPES.ENTRY) continue;
    const day = todayDateStringIst(log.createdAt);
    if (!labourAssignedOn(toId(log.registrationId), day)) continue;
    const dept = log.departmentId?.name || 'Unassigned';
    const div = log.divisionId?.name || 'Unassigned';
    deptCounts.set(dept, (deptCounts.get(dept) || 0) + 1);
    divCounts.set(div, (divCounts.get(div) || 0) + 1);
  }

  const today = todayDateString();
  let inside = 0;
  let outside = 0;
  for (const a of activeAssignments) {
    if (!isDateInPeriod(today, assignmentPeriod(a))) continue;
    const id = labourIdOf(a);
    if (!id) continue;
    const session = await getActiveDivisionSession(id);
    if (session?.sessionState?.divisionInside) inside += 1;
    else outside += 1;
  }

  const hoursTrend = days.map((date) => {
    const dayLogs = logs.filter((l) => {
      const d = todayDateStringIst(l.createdAt);
      return d === date && labourAssignedOn(toId(l.registrationId), date);
    });
    const byLabour = new Map();
    for (const log of dayLogs) {
      const id = toId(log.registrationId);
      if (!byLabour.has(id)) byLabour.set(id, []);
      byLabour.get(id).push(log);
    }
    let totalHours = 0;
    let n = 0;
    for (const [, labourLogs] of byLabour) {
      const day = buildDayAttendance(labourLogs, null);
      if (day.workedHours != null) {
        totalHours += day.workedHours;
        n += 1;
      }
    }
    return {
      date,
      averageHours: n ? Math.round((totalHours / n) * 100) / 100 : 0,
    };
  });

  const photoCounts = await ProjectDailyPhoto.aggregate([
    {
      $match: {
        projectId: project._id,
        photoDate: { $gte: range.dateFrom, $lte: range.dateTo },
      },
    },
    { $group: { _id: '$photoDate', count: { $sum: 1 }, faces: { $sum: '$facesDetected' } } },
    { $sort: { _id: 1 } },
  ]);
  const photoByDate = new Map(photoCounts.map((r) => [r._id, r]));
  const faceCaptureTrend = days.map((date) => ({
    date,
    photos: photoByDate.get(date)?.count || 0,
    faces: photoByDate.get(date)?.faces || 0,
  }));

  const presentTotal = dailyAttendance.reduce((s, d) => s + d.present, 0);
  const possible = Math.max(
    1,
    dailyAttendance.reduce((s, d) => s + (d.assigned || 0), 0)
  );
  const attendancePercentage = Math.round((presentTotal / possible) * 100);
  const progress = projectProgress(project);

  return {
    projectId: project._id.toString(),
    dateRange: { dateFrom: range.dateFrom, dateTo: range.dateTo },
    dailyAttendanceTrend: dailyAttendance,
    departmentDistribution: [...deptCounts.entries()].map(([name, count]) => ({ name, count })),
    divisionDistribution: [...divCounts.entries()].map(([name, count]) => ({ name, count })),
    workingHoursTrend: hoursTrend,
    insideVsOutside: { inside, outside },
    entryVsExit: {
      entries: logs.filter((l) => l.eventType === GATE_EVENT_TYPES.ENTRY).length,
      exits: logs.filter((l) => l.eventType === GATE_EVENT_TYPES.EXIT).length,
    },
    dailyFaceCaptureCount: faceCaptureTrend,
    attendancePercentage,
    projectUtilization: {
      assigned: activeAssignments.length,
      manDays: presentTotal,
      possibleManDays: possible,
      utilizationPct: attendancePercentage,
    },
    projectCompletionTrend: days.map((date) => {
      const { startDate, requiredDays } = progress;
      let completed = 0;
      if (date < startDate) completed = 0;
      else {
        completed =
          Math.round(
            (new Date(`${date}T12:00:00+05:30`).getTime() -
              new Date(`${startDate}T12:00:00+05:30`).getTime()) /
              (24 * 60 * 60 * 1000)
          ) + 1;
        completed = Math.min(requiredDays, Math.max(0, completed));
      }
      return {
        date,
        completedDays: completed,
        pct: requiredDays ? Math.round((completed / requiredDays) * 100) : 0,
      };
    }),
  };
}

export async function getProjectReportFilterOptions(projectId) {
  const project = await loadProjectOrThrow(projectId);
  const assignments = await getProjectAssignments(projectId, { includeRemoved: true });
  const labours = assignments
    .filter((a) => a.labourId)
    .map((a) => serializeLabour(a.labourId))
    .filter((v, i, arr) => arr.findIndex((x) => x.labourId === v.labourId) === i)
    .sort((a, b) => (a.labourName || '').localeCompare(b.labourName || ''));

  const supervisors = [];
  const seen = new Set();
  for (const a of assignments) {
    const id = toId(a.assignedBy);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    supervisors.push({
      id,
      name: a.assignedBy?.displayName || a.assignedBy?.username || 'Supervisor',
    });
  }
  if (project.createdBy) {
    const id = toId(project.createdBy);
    if (id && !seen.has(id)) {
      supervisors.push({
        id,
        name: project.createdBy.displayName || project.createdBy.username || 'Creator',
      });
    }
  }

  const assignmentClauses = assignments
    .map((a) => {
      const labourId = labourIdOf(a);
      if (!labourId) return null;
      const period = assignmentPeriod(a);
      return {
        registrationId: labourId,
        createdAt: { $gte: period.fromDate, $lte: period.toDate },
      };
    })
    .filter(Boolean);

  let gateDocs = [];
  if (assignmentClauses.length) {
    const gates = await GateLog.distinct('gateRefId', {
      matched: true,
      scanType: SCAN_TYPES.GATE,
      gateRefId: { $ne: null },
      $and: [
        { $or: assignmentClauses },
        { $or: [{ accessGranted: true }, { accessGranted: { $exists: false } }] },
      ],
    });
    const Gate = (await import('../models/Gate.js')).default;
    gateDocs = await Gate.find({ _id: { $in: gates } }).select('name').lean();
  }

  return {
    projectId: project._id.toString(),
    labours,
    supervisors,
    gates: gateDocs.map((g) => ({ id: g._id.toString(), name: g.name })),
    statuses: Object.entries(PROJECT_STATUS_LABELS).map(([value, label]) => ({ value, label })),
  };
}
