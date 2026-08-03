import fs from 'fs';
import path from 'path';
import ProjectAssignment from '../models/ProjectAssignment.js';
import ProjectDailyPhoto from '../models/ProjectDailyPhoto.js';
import Registration from '../models/Registration.js';
import ActivitySighting from '../models/ActivitySighting.js';
import {
  PROJECT_ASSIGNMENT_STATUSES,
  PROJECT_STATUSES,
} from '../constants/index.js';
import { todayDateStringIst, addDaysIst } from '../utils/istTime.js';
import { uploadDir } from '../utils/storage.js';
import { isObjectStorageEnabled, uploadPhoto } from './objectStorage.js';
import { extractFaceEmbeddingsMulti, searchFaceEmbeddings } from './aiClient.js';
import {
  persistActivityFaceBuffer,
  cropAndSaveActivityFace,
} from '../utils/activityFaceCrop.js';
import { normalizeEmbedMultiFaces } from '../utils/normalizeEmbedMultiFaces.js';
import { buildDisplayInfo, photoUrlFromPath } from '../utils/displayInfo.js';
import { getActiveDivisionSession } from './attendanceService.js';
import { REGISTRATION_STATUS } from '../constants/index.js';

const MATCH_THRESHOLD = parseFloat(process.env.FACE_MATCH_THRESHOLD || '0.42');
const MIN_MATCH_MARGIN = parseFloat(process.env.FACE_MATCH_MIN_MARGIN || '0.05');
const SEARCH_TOP_K = parseInt(process.env.FACE_SEARCH_TOP_K || '5', 10);

/**
 * IST project photo window: day 1 = createdAt date, through requiredDays.
 */
export function getProjectPhotoWindow(project) {
  const startDate = todayDateStringIst(project.createdAt || new Date());
  const requiredDays = Math.max(1, Number(project.requiredDays) || 1);
  const endDate = addDaysIst(startDate, requiredDays - 1);
  return { startDate, endDate, requiredDays };
}

/** Calendar progress through the project photo / work window (IST). */
export function computeProjectProgress(project) {
  const { startDate, endDate, requiredDays } = getProjectPhotoWindow(project);
  const today = todayDateStringIst();
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

export function buildProjectPhotoDays(project, photoCountsByDate = {}) {
  const { startDate, endDate, requiredDays } = getProjectPhotoWindow(project);
  const today = todayDateStringIst();
  const days = [];

  for (let i = 0; i < requiredDays; i += 1) {
    const date = addDaysIst(startDate, i);
    days.push({
      dayIndex: i + 1,
      photoDate: date,
      photoCount: photoCountsByDate[date] || 0,
      isToday: date === today,
      isFuture: date > today,
      isPast: date < today,
      inWindow: date >= startDate && date <= endDate,
    });
  }

  return { startDate, endDate, requiredDays, today, days };
}

export function assertPhotoDateInWindow(project, photoDate) {
  const { startDate, endDate } = getProjectPhotoWindow(project);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(photoDate)) {
    return { error: 'Invalid photo date' };
  }
  if (photoDate < startDate || photoDate > endDate) {
    return {
      error: `Photo date must be between ${startDate} and ${endDate} (project day window)`,
    };
  }
  const dayIndex =
    Math.round(
      (new Date(`${photoDate}T12:00:00+05:30`).getTime() -
        new Date(`${startDate}T12:00:00+05:30`).getTime()) /
        (24 * 60 * 60 * 1000)
    ) + 1;
  return { dayIndex, startDate, endDate };
}

async function persistProjectFullPhoto(imageBuffer, filenameHint) {
  const filename = `${filenameHint}.jpg`;

  if (isObjectStorageEnabled()) {
    try {
      const result = await uploadPhoto(imageBuffer, 'projects', filename, 'image/jpeg');
      return result.url;
    } catch (err) {
      console.error('Object storage project photo upload failed, falling back to local:', err.message);
    }
  }

  const dir = path.join(uploadDir, 'projects');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const photoPath = path.join(dir, filename);
  fs.writeFileSync(photoPath, imageBuffer);
  return photoPath;
}

async function resolveFaceCrop(imageBuffer, faceBox, thumbnailB64) {
  if (thumbnailB64) {
    try {
      const buf = Buffer.from(thumbnailB64, 'base64');
      if (buf.length) {
        const saved = await persistActivityFaceBuffer(
          buf,
          `project-face-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        );
        if (saved) {
          return {
            photoPath: saved.photoPath,
            faceCropDataUrl: saved.dataUrl || `data:image/jpeg;base64,${thumbnailB64}`,
          };
        }
      }
    } catch (err) {
      console.warn('Failed to persist project face thumbnail:', err.message);
    }
  }
  const cropped = await cropAndSaveActivityFace(imageBuffer, faceBox);
  if (!cropped) return { photoPath: null, faceCropDataUrl: null };
  return { photoPath: cropped.photoPath, faceCropDataUrl: cropped.dataUrl };
}

async function getAssignedLabourIdSet(projectId) {
  const rows = await ProjectAssignment.find({
    projectId,
    status: PROJECT_ASSIGNMENT_STATUSES.ACTIVE,
  })
    .select('labourId')
    .lean();
  return new Set(rows.map((r) => r.labourId.toString()));
}

/**
 * Process one uploaded image for a project day: store full frame, match faces
 * against assigned labourers, and record ActivitySighting rows for matches.
 */
export async function processProjectPhotoUpload({
  project,
  imageBuffer,
  filename = 'project.jpg',
  photoDate,
  uploadedBy = null,
  originalName = '',
}) {
  if (project.status !== PROJECT_STATUSES.ACTIVE) {
    return { error: 'Photos can only be uploaded for active projects' };
  }

  const windowCheck = assertPhotoDateInWindow(project, photoDate);
  if (windowCheck.error) return { error: windowCheck.error };

  const assignedIds = await getAssignedLabourIdSet(project._id);
  const hint = `project-${project._id}-${photoDate}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const photoPath = await persistProjectFullPhoto(imageBuffer, hint);

  // Always keep the project photo for the selected project/day, even when
  // face analysis fails or no persons are detected in the frame.
  let faces = [];
  let analysisWarning = null;
  let rawFaceCount = 0;
  try {
    const facesResult = await extractFaceEmbeddingsMulti(imageBuffer, filename, 'image/jpeg');
    rawFaceCount = Array.isArray(facesResult?.faces) ? facesResult.faces.length : 0;
    // Route-side cleanup — do not change AI server; drop weak / overlapping detections
    faces = normalizeEmbedMultiFaces(facesResult);
  } catch (err) {
    analysisWarning = err.message || 'Face analysis failed';
    faces = [];
  }

  const bestByRegistration = new Map();
  const unmatchedFaces = [];

  for (const face of faces) {
    const thumbnailB64 = face?.thumbnail_jpeg_b64 || null;
    if (!face?.embedding?.length) {
      unmatchedFaces.push({ faceBox: face?.face_box || null, thumbnailB64 });
      continue;
    }

    const searchResult = await searchFaceEmbeddings(face.embedding, {
      topK: SEARCH_TOP_K,
      threshold: MATCH_THRESHOLD,
      minMargin: MIN_MATCH_MARGIN,
    });
    const best = searchResult?.best;
    if (!best?.id || best.similarity < MATCH_THRESHOLD || searchResult.ambiguous) {
      unmatchedFaces.push({ faceBox: face.face_box || null, thumbnailB64 });
      continue;
    }

    const existing = bestByRegistration.get(best.id);
    if (!existing || best.similarity > existing.similarity) {
      bestByRegistration.set(best.id, {
        similarity: best.similarity,
        faceBox: face.face_box || null,
        thumbnailB64,
      });
    }
  }

  const detections = [];
  const people = [];
  let matchedAssignedCount = 0;

  for (const [regId, info] of bestByRegistration.entries()) {
    const reg = await Registration.findById(regId)
      .select('-faceEmbedding')
      .populate('formId', 'fields')
      .populate('roleId', 'name slug isShiftBased')
      .lean();

    if (!reg || reg.status !== REGISTRATION_STATUS.VERIFIED) {
      unmatchedFaces.push({ faceBox: info.faceBox, thumbnailB64: info.thumbnailB64 });
      continue;
    }

    const display = buildDisplayInfo(reg.formData, reg.formId?.fields || []);
    const faceImage = await resolveFaceCrop(imageBuffer, info.faceBox, info.thumbnailB64);
    const assignedToProject = assignedIds.has(regId);
    const activeSession = await getActiveDivisionSession(regId);
    const inActivity = Boolean(activeSession?.sessionState?.divisionInside);

    let activitySightingId = null;
    if (assignedToProject) {
      matchedAssignedCount += 1;
      const sighting = await ActivitySighting.create({
        registrationId: reg._id,
        roleId: reg.roleId?._id || reg.roleId || null,
        matched: true,
        matchScore: info.similarity,
        inActivity,
        photoPath: faceImage.photoPath || '',
        faceBox: info.faceBox,
        sightingDate: photoDate,
        metadata: {
          source: 'project_photo',
          projectId: project._id.toString(),
          projectName: project.projectName,
          dayIndex: windowCheck.dayIndex,
          divisionId: activeSession?.divisionId || null,
          divisionName: activeSession?.divisionName || null,
        },
      });
      activitySightingId = sighting._id;
    }

    detections.push({
      labourId: reg._id,
      matched: true,
      registered: true,
      assignedToProject,
      matchScore: info.similarity,
      labourName: display.displayName || 'Unknown',
      registrationCode: reg.registrationCode || null,
      faceBox: info.faceBox,
      facePhotoPath: faceImage.photoPath || '',
      photoPath: reg.photoPath || '',
      inActivity,
      activitySightingId,
      roleName: reg.roleId?.name || null,
      divisionName: activeSession?.divisionName || null,
      gateStatus: inActivity ? 'inside' : 'outside',
    });

    people.push({
      registered: true,
      assignedToProject,
      inActivity,
      registrationId: String(regId),
      registrationCode: reg.registrationCode || null,
      displayName: display.displayName || 'Unknown',
      photoUrl: reg.photoPath ? photoUrlFromPath(reg.photoPath) : null,
      faceCropDataUrl: faceImage.faceCropDataUrl || null,
      facePhotoUrl: faceImage.photoPath ? photoUrlFromPath(faceImage.photoPath) : null,
      roleName: reg.roleId?.name || null,
      matchScore: info.similarity,
      faceBox: info.faceBox,
      divisionName: activeSession?.divisionName || null,
      gateStatus: inActivity ? 'inside' : 'outside',
      statusLabel: !assignedToProject
        ? 'Registered · not on this project'
        : inActivity
          ? 'Gate in'
          : 'Registered · not in gate',
    });
  }

  for (let index = 0; index < unmatchedFaces.length; index += 1) {
    const face = unmatchedFaces[index];
    const faceImage = await resolveFaceCrop(imageBuffer, face.faceBox, face.thumbnailB64);
    detections.push({
      labourId: null,
      matched: false,
      registered: false,
      assignedToProject: false,
      matchScore: null,
      labourName: 'Non registered person',
      registrationCode: null,
      faceBox: face.faceBox || null,
      facePhotoPath: faceImage.photoPath || '',
      photoPath: '',
      inActivity: false,
      activitySightingId: null,
      roleName: null,
      divisionName: null,
      gateStatus: null,
    });

    people.push({
      registered: false,
      assignedToProject: false,
      inActivity: false,
      registrationId: null,
      registrationCode: null,
      displayName: 'Non registered person',
      photoUrl: faceImage.photoPath ? photoUrlFromPath(faceImage.photoPath) : null,
      faceCropDataUrl: faceImage.faceCropDataUrl || null,
      facePhotoUrl: faceImage.photoPath ? photoUrlFromPath(faceImage.photoPath) : null,
      roleName: null,
      matchScore: null,
      faceBox: face.faceBox || null,
      divisionName: null,
      gateStatus: null,
      statusLabel: 'Not registered',
      unmatchedKey: `unmatched-${index}`,
    });
  }

  people.sort((a, b) => {
    const rank = (p) => {
      if (!p.registered) return 3;
      if (!p.assignedToProject) return 2;
      return p.inActivity ? 0 : 1;
    };
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    return (b.matchScore || 0) - (a.matchScore || 0);
  });

  const facesDetected = people.length;

  const doc = await ProjectDailyPhoto.create({
    projectId: project._id,
    photoDate,
    dayIndex: windowCheck.dayIndex,
    photoPath,
    originalName: originalName || filename,
    uploadedBy,
    facesDetected,
    matchedAssignedCount,
    detections,
    metadata: {
      storedWithoutFaces: facesDetected === 0,
      analysisWarning: analysisWarning || null,
      rawFaceCount,
      filteredFaceCount: faces.length,
    },
  });

  return {
    photo: serializeProjectPhoto(doc),
    matchedAssignedCount,
    facesDetected,
    storedWithoutFaces: facesDetected === 0,
    analysisWarning,
    people,
    matchedCount: people.filter((p) => p.registered).length,
    unmatchedCount: people.filter((p) => !p.registered).length,
    inActivityCount: people.filter((p) => p.registered && p.inActivity).length,
  };
}

export function serializeProjectPhoto(doc) {
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  return {
    id: obj._id?.toString(),
    _id: obj._id,
    projectId: obj.projectId?.toString?.() || obj.projectId,
    photoDate: obj.photoDate,
    dayIndex: obj.dayIndex,
    photoUrl: photoUrlFromPath(obj.photoPath),
    photoPath: obj.photoPath,
    originalName: obj.originalName || '',
    facesDetected: obj.facesDetected || 0,
    matchedAssignedCount: obj.matchedAssignedCount || 0,
    storedWithoutFaces: Boolean(obj.metadata?.storedWithoutFaces) || (obj.facesDetected || 0) === 0,
    analysisWarning: obj.metadata?.analysisWarning || null,
    uploadedBy: obj.uploadedBy,
    createdAt: obj.createdAt,
    detections: (obj.detections || []).map((d) => ({
      labourId: d.labourId?.toString?.() || d.labourId || null,
      matched: Boolean(d.matched),
      registered: d.registered != null ? Boolean(d.registered) : Boolean(d.matched),
      assignedToProject: Boolean(d.assignedToProject),
      matchScore: d.matchScore,
      labourName: d.labourName || '',
      registrationCode: d.registrationCode || null,
      faceBox: d.faceBox || null,
      facePhotoUrl: photoUrlFromPath(d.facePhotoPath),
      photoUrl: photoUrlFromPath(d.photoPath),
      inActivity: Boolean(d.inActivity),
      activitySightingId: d.activitySightingId?.toString?.() || null,
      roleName: d.roleName || null,
      divisionName: d.divisionName || null,
      gateStatus: d.gateStatus || (d.inActivity ? 'inside' : d.matched ? 'outside' : null),
    })),
  };
}

export async function listProjectPhotos(projectId, photoDate = null) {
  const filter = { projectId };
  if (photoDate) filter.photoDate = photoDate;
  const rows = await ProjectDailyPhoto.find(filter)
    .populate('uploadedBy', 'displayName username')
    .sort({ photoDate: -1, createdAt: -1 })
    .lean();
  return rows.map((row) => ({
    ...serializeProjectPhoto(row),
    uploadedByName: row.uploadedBy?.displayName || row.uploadedBy?.username || null,
  }));
}

export async function getProjectPhotoDaySummary(project) {
  const counts = await ProjectDailyPhoto.aggregate([
    { $match: { projectId: project._id } },
    { $group: { _id: '$photoDate', photoCount: { $sum: 1 }, matchedAssigned: { $sum: '$matchedAssignedCount' } } },
  ]);
  const byDate = {};
  const matchedByDate = {};
  for (const row of counts) {
    byDate[row._id] = row.photoCount;
    matchedByDate[row._id] = row.matchedAssigned;
  }
  const calendar = buildProjectPhotoDays(project, byDate);
  return {
    ...calendar,
    days: calendar.days.map((d) => ({
      ...d,
      matchedAssigned: matchedByDate[d.photoDate] || 0,
    })),
  };
}
