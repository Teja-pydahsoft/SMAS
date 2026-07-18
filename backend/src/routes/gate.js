import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import Registration from '../models/Registration.js';
import GateLog from '../models/GateLog.js';
import Gate from '../models/Gate.js';
import Department from '../models/Department.js';
import Pass from '../models/Pass.js';
import Shift from '../models/Shift.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { REGISTRATION_STATUS, GATE_EVENT_TYPES, GATE_TYPES, SCAN_TYPES } from '../constants/index.js';
import {
  extractFaceEmbedding,
  compareFaceEmbeddings,
  searchFaceEmbeddings,
} from '../services/aiClient.js';
import { loadRegistrationContext, formatPassResponse } from '../services/passService.js';
import { buildDisplayInfo, photoUrlFromPath } from '../utils/displayInfo.js';
import {
  getActiveDayPass,
  getPassSessionState,
  validateGateScan,
  validateDepartmentScan,
  createOrRefreshDayPass,
  updateDayPassAfterDepartmentScan,
  updateDayPassAfterGateExit,
  syncDepartmentVisitsFromLogs,
  madeGateEntryToday,
  isPersonInsideTargetDivision,
  resolveAutoGateEventType,
  resolveAutoDepartmentEventType,
  isOppositeGateEvent,
  GATE_DENIAL_REASONS,
  todayDateString,
} from '../services/attendanceService.js';
import { resolveDayPassValidUntil, startOfDayIst, endOfDayIst } from '../utils/istTime.js';
import { getRequiredSteps } from '../constants/accessRules.js';
import { rebuildFaceIndexFromDb } from '../services/faceIndexService.js';
import { createMulter } from '../utils/storage.js';
import {
  isCloudinaryEnabled,
  uploadToCloudinary,
} from '../services/cloudinaryService.js';
import { hasDivisionScope, hasDepartmentScope, hasGateScope } from '../middleware/auth.js';
import { getScopedDivisionIds, resolveDivisionFilterIds } from '../services/accessScopeService.js';
import { grantedGateLogFilter } from '../utils/gateLogFilters.js';

const router = Router();
const MATCH_THRESHOLD = parseFloat(process.env.FACE_MATCH_THRESHOLD || '0.42');
const MIN_MATCH_MARGIN = parseFloat(process.env.MIN_MATCH_MARGIN || '0.05');
const SEARCH_TOP_K = parseInt(process.env.SEARCH_TOP_K || '5', 10);
const EMBEDDING_SIZE = parseInt(process.env.FACE_EMBEDDING_SIZE || '512', 10);

const upload = createMulter('gate', (req, file) => {
  return `gate-${Date.now()}${path.extname(file.originalname) || '.jpg'}`;
});

async function finalizeGateLog(log) {
  if (!log) return log;
  log.accessGranted = true;
  log.matched = true;
  await log.save();
  return log;
}

/**
 * Persist a rejected scan attempt for the audit trail instead of discarding it.
 * The log keeps accessGranted=false plus the denial reason, so audit views can
 * show every attempted entry/exit while attendance queries (granted-only) skip it.
 */
async function markGateLogDenied(log, reason, error) {
  if (!log?._id) return null;
  try {
    log.accessGranted = false;
    log.metadata = {
      ...(log.metadata || {}),
      denialReason: reason || 'denied',
      denialError: error || '',
    };
    log.markModified('metadata');
    await log.save();
    return log;
  } catch (err) {
    console.error('Failed to persist denied gate log:', err.message);
    return null;
  }
}

router.get(
  '/logs',
  asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.registrationId) filter.registrationId = req.query.registrationId;
    if (req.query.eventType) filter.eventType = req.query.eventType;
    if (req.query.departmentId) filter.departmentId = req.query.departmentId;
    if (req.query.gateRefId) filter.gateRefId = req.query.gateRefId;
    if (req.query.scanType) filter.scanType = req.query.scanType;
    if (req.query.matched === 'true') filter.matched = true;
    if (req.query.matched === 'false') filter.matched = false;
    if (req.query.successOnly !== 'false') {
      filter.matched = true;
      filter.$or = [{ accessGranted: true }, { accessGranted: { $exists: false } }];
    } else if (req.query.status === 'granted') {
      filter.$or = [{ accessGranted: true }, { accessGranted: { $exists: false } }];
    } else if (req.query.status === 'denied') {
      filter.accessGranted = false;
    }

    if (req.query.dateFrom || req.query.dateTo) {
      filter.createdAt = {};
      if (req.query.dateFrom) filter.createdAt.$gte = startOfDayIst(req.query.dateFrom);
      if (req.query.dateTo) filter.createdAt.$lte = endOfDayIst(req.query.dateTo);
    }

    // RBAC division scoping: non-super-admins only see logs from their own
    // divisions; the optional `divisionId` query narrows within that scope.
    const scopedIds = req.user ? await getScopedDivisionIds(req.user) : null;
    const divisionIds = resolveDivisionFilterIds(scopedIds, req.query.divisionId);
    if (Array.isArray(divisionIds)) {
      filter.divisionId = { $in: divisionIds };
    }

    const logs = await GateLog.find(filter)
      .populate({
        path: 'registrationId',
        select: 'registrationCode formData formId photoPath',
        populate: { path: 'formId', select: 'fields' },
      })
      .populate('roleId', 'name slug')
      .populate('divisionId', 'name slug')
      .populate('departmentId', 'name slug')
      .populate('gateRefId', 'name gateType slug')
      .sort({ createdAt: -1 })
      .limit(parseInt(req.query.limit || '100', 10));

    const items = logs.map((log) => {
      const obj = log.toObject();
      const reg = obj.registrationId;
      const display = reg
        ? buildDisplayInfo(reg.formData, reg.formId?.fields || [])
        : null;
      return {
        ...obj,
        holderName: display?.displayName || null,
        holderPhotoUrl: reg?.photoPath ? photoUrlFromPath(reg.photoPath) : null,
        denialReason: obj.metadata?.denialReason || null,
        denialError: obj.metadata?.denialError || null,
      };
    });

    res.json(items);
  })
);

router.get(
  '/status/:registrationId',
  asyncHandler(async (req, res) => {
    const [lastEntry, lastExit] = await Promise.all([
      GateLog.findOne(
        grantedGateLogFilter({
          registrationId: req.params.registrationId,
          eventType: GATE_EVENT_TYPES.ENTRY,
        })
      ).sort({ createdAt: -1 }),
      GateLog.findOne(
        grantedGateLogFilter({
          registrationId: req.params.registrationId,
          eventType: GATE_EVENT_TYPES.EXIT,
        })
      ).sort({ createdAt: -1 }),
    ]);

    const isInside =
      lastEntry && (!lastExit || lastEntry.createdAt > lastExit.createdAt);

    res.json({ isInside, lastEntry, lastExit });
  })
);

router.post(
  '/reindex',
  asyncHandler(async (req, res) => {
    const result = await rebuildFaceIndexFromDb();
    res.json({
      ok: true,
      message:
        result.indexed > 0
          ? `Indexed ${result.indexed} verified face(s)`
          : 'No 512-d face embeddings found. Verify users and re-upload photos.',
      ...result,
    });
  })
);

// ─── Attach shift to an existing gate log after entry ────────────────────────
router.patch(
  '/logs/:id/shift',
  asyncHandler(async (req, res) => {
    const { shiftId, shiftName } = req.body;
    if (!shiftId || !shiftName) {
      return res.status(400).json({ error: 'shiftId and shiftName are required' });
    }

    const log = await GateLog.findById(req.params.id);
    if (!log) return res.status(404).json({ error: 'Gate log not found' });

    const shift = await Shift.findById(shiftId).select('name startTime endTime');
    if (!shift) return res.status(404).json({ error: 'Shift not found' });

    const resolvedShiftName = shiftName || shift.name || '';
    const shiftStartTime = shift.startTime || '';
    const shiftEndTime = shift.endTime || '';

    log.metadata = {
      ...(log.metadata || {}),
      shiftId,
      shiftName: resolvedShiftName,
      shiftStartTime,
      shiftEndTime,
    };
    log.markModified('metadata');
    await log.save();

    // Also patch the day pass with shift details. The working window becomes
    // shift end + 4h grace once the shift is known.
    const workDate = todayDateString(log.createdAt || new Date());
    const dayPass = log.registrationId
      ? await Pass.findOne({
          registrationId: log.registrationId,
          passType: 'day_pass',
          isActive: true,
          validDate: workDate,
        })
      : null;

    if (dayPass) {
      const entryAt =
        dayPass.qrPayload?.gateEntryAt ||
        dayPass.validFrom ||
        log.createdAt ||
        new Date();
      const validUntil = resolveDayPassValidUntil({
        entryAt,
        fallbackDate: log.createdAt || new Date(),
        validDate: dayPass.validDate || workDate,
        startTime: shiftStartTime,
        endTime: shiftEndTime,
      });

      dayPass.validUntil = validUntil;
      dayPass.qrPayload = {
        ...(dayPass.qrPayload || {}),
        shiftId,
        shiftName: resolvedShiftName,
        shiftStartTime,
        shiftEndTime,
        validUntil: validUntil.toISOString(),
      };
      dayPass.markModified('qrPayload');
      await dayPass.save();
    }

    res.json({ ok: true, log });
  })
);

// ─── Attach remark to a department check-in log ──────────────────────────────
router.patch(
  '/logs/:id/remark',
  asyncHandler(async (req, res) => {
    const remark = typeof req.body?.remark === 'string' ? req.body.remark.trim() : '';

    const log = await GateLog.findById(req.params.id);
    if (!log) return res.status(404).json({ error: 'Gate log not found' });

    if (log.scanType !== SCAN_TYPES.DEPARTMENT || log.eventType !== GATE_EVENT_TYPES.ENTRY) {
      // Allow legacy QR dept check-ins that stored scanType as "qr"
      const isLegacyDeptCheckIn =
        log.scanType === SCAN_TYPES.QR &&
        log.departmentId &&
        log.eventType === GATE_EVENT_TYPES.ENTRY;
      if (!isLegacyDeptCheckIn) {
        return res.status(400).json({ error: 'Remarks can only be added on department check-in' });
      }
    }

    log.remark = remark;
    await log.save();

    res.json({ ok: true, log });
  })
);

async function formatRegistrationForScan(registrationDoc) {
  // lean + no faceEmbedding: the 512-float embedding is useless to the client
  // and dominates the payload/hydration cost otherwise.
  const obj = await Registration.findById(registrationDoc._id)
    .select('-faceEmbedding')
    .populate('roleId', 'name slug isShiftBased')
    .populate('formId', 'fields')
    .lean();
  if (!obj) return null;
  const display = buildDisplayInfo(obj.formData, obj.formId?.fields || []);
  return {
    ...obj,
    displayName: display.displayName,
    displayPhone: display.displayPhone,
    formDetails: display.details,
    photoUrl: photoUrlFromPath(obj.photoPath),
  };
}

function buildScanDenialResponse({
  scanType,
  matchScore,
  registration,
  log,
  error,
  reason,
  sessionState,
  dayPass,
  hasGateEntry,
  activeDepartment,
  activeDivision,
  requiredSteps,
  securityReview = false,
  requestedEventType = null,
  suggestedEventType = null,
  resolvedEventType = null,
  personInside = null,
}) {
  return {
    matched: true,
    denied: true,
    scanType,
    matchScore,
    registration,
    log,
    error,
    reason,
    hasGateEntry,
    activeDepartment,
    activeDivision,
    sessionState,
    dayPass,
    requiredSteps,
    securityReview,
    requestedEventType,
    suggestedEventType,
    resolvedEventType,
    personInside,
  };
}

async function respondScanDenial(res, options) {
  const { log, reason, error, ...rest } = options;
  const savedLog = await markGateLogDenied(log, reason, error);
  return res.status(400).json(buildScanDenialResponse({ ...rest, reason, error, log: savedLog }));
}

async function identifyFromPhoto(file, registrationId) {
  const filePath = file.path || null;
  const imageBuffer = file.buffer || fs.readFileSync(filePath);
  const filename = file.filename || file.originalname || 'photo.jpg';

  const { embedding, face_detected } = await extractFaceEmbedding(
    imageBuffer,
    filename,
    'image/jpeg'
  );

  if (!face_detected || !embedding?.length) {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return { error: 'No face detected in the photo' };
  }

  // Kick off the audit-photo upload in parallel with face matching instead of
  // blocking the scan on it — it only produces the stored photo path.
  const uploadPromise = isCloudinaryEnabled()
    ? uploadToCloudinary(imageBuffer, 'gate', `gate-${Date.now()}`)
        .then((result) => {
          if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
          return result.url;
        })
        .catch((err) => {
          console.error('Cloudinary gate upload failed, falling back to local:', err.message);
          return filePath;
        })
    : Promise.resolve(filePath);

  const cleanupLocalPhoto = async () => {
    const savedPath = await uploadPromise;
    if (savedPath && !savedPath.startsWith('http') && fs.existsSync(savedPath)) {
      fs.unlinkSync(savedPath);
    }
  };

  let matchedRegistration = null;
  let matchScore = 0;

  if (registrationId) {
    matchedRegistration = await Registration.findById(registrationId).select(
      'status faceEmbedding roleId registrationCode'
    );
    if (!matchedRegistration) {
      await cleanupLocalPhoto();
      return { error: 'Registration not found', status: 404 };
    }
    if (matchedRegistration.status !== REGISTRATION_STATUS.VERIFIED) {
      await cleanupLocalPhoto();
      return { error: 'Registration is not verified', status: 400 };
    }
    if (matchedRegistration.faceEmbedding?.length !== EMBEDDING_SIZE) {
      await cleanupLocalPhoto();
      return {
        error: 'Registration photo uses an outdated face model. Please re-upload the photo.',
        status: 400,
      };
    }
    const result = await compareFaceEmbeddings(matchedRegistration.faceEmbedding, embedding);
    matchScore = result.similarity;
  } else {
    const searchResult = await searchFaceEmbeddings(embedding, {
      topK: SEARCH_TOP_K,
      threshold: MATCH_THRESHOLD,
      minMargin: MIN_MATCH_MARGIN,
    });

    if (searchResult.ambiguous) {
      return {
        ambiguous: true,
        matchScore: searchResult.best?.similarity ?? 0,
        candidates: searchResult.matches?.slice(0, 3) ?? [],
        savedPhotoPath: await uploadPromise,
      };
    }

    if (searchResult.best?.id) {
      // Match already scored by the index — no need to load the embedding here.
      matchedRegistration = await Registration.findById(searchResult.best.id).select(
        '-faceEmbedding'
      );
      matchScore = searchResult.best.similarity;
    }
  }

  const matched = matchScore >= MATCH_THRESHOLD && !!matchedRegistration;
  const savedPhotoPath = await uploadPromise;
  return { matchedRegistration, matchScore, matched, autoIdentified: !registrationId, savedPhotoPath };
}

// ─── QR-code gate scan ────────────────────────────────────────────────────────
// Accepts the passCode encoded in a Registration Pass QR, validates it and
// records the gate entry/exit exactly like a face scan would (matchScore = 1.0).
router.post(
  '/qr-scan',
  asyncHandler(async (req, res) => {
    const {
      passCode,
      eventType,
      gateId,
      divisionId: bodyDivisionId,
      departmentId,
    } = req.body;

    if (!passCode?.trim()) {
      return res.status(400).json({ error: 'passCode is required' });
    }

    const isAutoEvent = eventType === GATE_EVENT_TYPES.AUTO;
    if (
      !isAutoEvent &&
      !Object.values(GATE_EVENT_TYPES).includes(eventType)
    ) {
      return res.status(400).json({ error: 'eventType must be "entry", "exit", or "auto"' });
    }

    // Resolve gate/division info identical to face scan
    const effectiveScanType = departmentId ? SCAN_TYPES.DEPARTMENT : SCAN_TYPES.GATE;
    const logFields = { scanType: effectiveScanType };
    let divisionId = bodyDivisionId || null;
    let gateRecord = null;
    let department = null;

    if (effectiveScanType === SCAN_TYPES.GATE) {
      if (!gateId) return res.status(400).json({ error: 'gateId is required for gate scans' });

      gateRecord = await Gate.findById(gateId).populate('divisionId', 'name slug isActive');
      if (!gateRecord) return res.status(404).json({ error: 'Gate not found' });
      if (!gateRecord.isActive) return res.status(400).json({ error: 'Gate is inactive' });
      if (gateRecord.divisionId && !gateRecord.divisionId.isActive) {
        return res.status(400).json({ error: 'Division is inactive' });
      }
      if (gateRecord.gateType === GATE_TYPES.ENTRY && !isAutoEvent && eventType !== GATE_EVENT_TYPES.ENTRY) {
        return res.status(400).json({ error: 'This gate allows entry scans only' });
      }
      if (gateRecord.gateType === GATE_TYPES.EXIT && !isAutoEvent && eventType !== GATE_EVENT_TYPES.EXIT) {
        return res.status(400).json({ error: 'This gate allows exit scans only' });
      }
      if (isAutoEvent && gateRecord.gateType !== GATE_TYPES.BOTH) {
        return res.status(400).json({ error: 'Auto entry/exit is only available at combined entry & exit gates' });
      }

      divisionId = gateRecord.divisionId?._id || gateRecord.divisionId;
      logFields.gateRefId = gateRecord._id;
      logFields.divisionId = divisionId;
      logFields.gateId = gateRecord._id.toString();
    } else {
      if (!bodyDivisionId) {
        return res.status(400).json({ error: 'divisionId is required for department scans' });
      }
      if (!departmentId) {
        return res.status(400).json({ error: 'departmentId is required for department scans' });
      }

      department = await Department.findById(departmentId);
      if (!department) return res.status(404).json({ error: 'Department not found' });
      if (!department.isActive) return res.status(400).json({ error: 'Department is inactive' });

      const departmentDivisionIds = (department.divisionIds || []).map((id) => id.toString());
      if (!departmentDivisionIds.includes(bodyDivisionId.toString())) {
        return res.status(400).json({ error: 'Department does not belong to the selected division' });
      }

      divisionId = bodyDivisionId;
      logFields.divisionId = divisionId;
      logFields.departmentId = department._id;
      logFields.gateId = 'department';
    }

    // Scope check
    if (req.user && !req.user.isSuperAdmin) {
      if (!hasDivisionScope(req.user, divisionId)) {
        return res.status(403).json({ error: 'You do not have access to this division' });
      }
      if (effectiveScanType === SCAN_TYPES.GATE && !hasGateScope(req.user, gateRecord._id)) {
        return res.status(403).json({ error: 'You do not have access to this gate' });
      }
      if (effectiveScanType === SCAN_TYPES.DEPARTMENT && !hasDepartmentScope(req.user, department._id)) {
        return res.status(403).json({ error: 'You do not have access to this department' });
      }
    }

    // Resolve registration from the pass
    const pass = await Pass.findOne({ passCode: passCode.trim(), isActive: true });
    if (!pass) {
      return res.status(400).json({ error: 'Invalid or inactive pass. QR code not recognised.' });
    }
    if (pass.passType !== 'registration') {
      return res.status(400).json({ error: 'Only Registration Pass QR codes can be used at the gate.' });
    }

    const matchedRegistration = await Registration.findById(pass.registrationId);
    if (!matchedRegistration) {
      return res.status(404).json({ error: 'Registration not found for this pass' });
    }
    if (matchedRegistration.status !== REGISTRATION_STATUS.VERIFIED) {
      return res.status(400).json({ error: 'Registration is not verified' });
    }

    const matchScore = 1.0; // QR scan — identity is proven by possession of the pass

    const log = await GateLog.create({
      registrationId: matchedRegistration._id,
      roleId: matchedRegistration.roleId,
      matchScore,
      matched: true,
      ...logFields,
      eventType, // will be updated if auto-resolved
      metadata: { qrScan: true, passCode: pass.passCode, scanType: effectiveScanType },
    });

    const [populated, activePass] = await Promise.all([
      formatRegistrationForScan(matchedRegistration),
      getActiveDayPass(matchedRegistration._id, divisionId),
    ]);
    let dayPass = activePass ? await formatPassResponse(activePass) : null;
    let sessionState = getPassSessionState(activePass);
    let resolvedEventType = eventType;

    if (effectiveScanType === SCAN_TYPES.GATE) {
      if (gateRecord.gateType === GATE_TYPES.BOTH) {
        const personInside = await isPersonInsideTargetDivision(matchedRegistration._id, divisionId);

        if (isAutoEvent) {
          resolvedEventType = await resolveAutoGateEventType(matchedRegistration._id, divisionId);
        } else if (isOppositeGateEvent(personInside, eventType)) {
          const suggestedEventType = personInside
            ? GATE_EVENT_TYPES.EXIT
            : GATE_EVENT_TYPES.ENTRY;
          return respondScanDenial(res, {
              scanType: effectiveScanType,
              matchScore,
              registration: populated,
              log,
              error: personInside
                ? 'This person is already inside the division. They should exit, not enter again.'
                : 'This person is not checked in at this division. They should enter, not exit.',
              reason: personInside
                ? GATE_DENIAL_REASONS.ALREADY_IN_DIVISION
                : GATE_DENIAL_REASONS.NOT_CHECKED_IN,
              sessionState,
              dayPass,
              activeDivision: personInside
                ? { divisionId: divisionId?.toString(), divisionName: gateRecord?.divisionId?.name || 'Division' }
                : null,
              requiredSteps: getRequiredSteps(
                personInside
                  ? GATE_DENIAL_REASONS.ALREADY_IN_DIVISION
                  : GATE_DENIAL_REASONS.NOT_CHECKED_IN,
                { hasActiveDepartment: Boolean(sessionState?.currentDepartmentId) }
              ),
              securityReview: false,
              requestedEventType: eventType,
              suggestedEventType,
            });
        }
      } else if (isAutoEvent) {
        await markGateLogDenied(log, 'invalid_gate_config', 'Auto entry/exit is only available at combined entry & exit gates');
        return res.status(400).json({ error: 'Auto entry/exit is only available at combined entry & exit gates' });
      }

      const gateCheck = await validateGateScan(
        activePass,
        resolvedEventType,
        matchedRegistration._id,
        divisionId
      );
      if (!gateCheck.ok) {
        const denialDayPass = gateCheck.pass
          ? await formatPassResponse(gateCheck.pass)
          : dayPass;
        return respondScanDenial(res, {
            scanType: effectiveScanType,
            matchScore,
            registration: populated,
            log,
            error: gateCheck.error,
            reason: gateCheck.reason,
            sessionState: gateCheck.sessionState || sessionState,
            dayPass: denialDayPass,
            activeDepartment: gateCheck.activeDepartment,
            activeDivision: gateCheck.activeDivision,
            requiredSteps: gateCheck.requiredSteps,
          });
      }

      if (resolvedEventType === GATE_EVENT_TYPES.ENTRY) {
        const { registration, role, display } = await loadRegistrationContext(matchedRegistration._id);
        dayPass = await createOrRefreshDayPass({
          registration,
          role,
          display,
          gateLogId: log._id,
          divisionId,
          divisionName: gateRecord?.divisionId?.name || '',
        });
        sessionState = getPassSessionState(await getActiveDayPass(matchedRegistration._id, divisionId));
      } else if (activePass) {
        dayPass = await updateDayPassAfterGateExit(activePass);
        sessionState = getPassSessionState(await getActiveDayPass(matchedRegistration._id, divisionId));
      }

      if (resolvedEventType !== eventType) {
        log.eventType = resolvedEventType;
        await log.save();
      }
    } else {
      // Department QR scan — support auto event type
      let resolvedDeptEventType = eventType;
      let deptAutoResolved = false;

      if (isAutoEvent) {
        resolvedDeptEventType = await resolveAutoDepartmentEventType(
          matchedRegistration._id, divisionId, department._id
        );
        deptAutoResolved = true;
        log.eventType = resolvedDeptEventType;
        await log.save();
      }

      const deptCheck = await validateDepartmentScan(
        activePass,
        department,
        resolvedDeptEventType,
        matchedRegistration._id,
        divisionId
      );
      if (!deptCheck.ok) {
        const denialDayPass = deptCheck.pass
          ? await formatPassResponse(deptCheck.pass)
          : dayPass;
        return respondScanDenial(res, {
            scanType: effectiveScanType,
            matchScore,
            registration: populated,
            log,
            error: deptCheck.error,
            reason: deptCheck.reason,
            hasGateEntry: deptCheck.hasGateEntry,
            activeDepartment: deptCheck.activeDepartment,
            activeDivision: deptCheck.activeDivision,
            sessionState: deptCheck.sessionState || sessionState,
            dayPass: denialDayPass,
            requiredSteps: deptCheck.requiredSteps,
          });
      }

      dayPass = await updateDayPassAfterDepartmentScan(
        activePass,
        department,
        resolvedDeptEventType,
        log.createdAt
      );
      resolvedEventType = resolvedDeptEventType;
    }

    const hasGateEntry = await madeGateEntryToday(matchedRegistration._id, divisionId);
    await finalizeGateLog(log);

    if (effectiveScanType === SCAN_TYPES.DEPARTMENT) {
      const updatedPass = await getActiveDayPass(matchedRegistration._id, divisionId);
      sessionState = await syncDepartmentVisitsFromLogs(
        updatedPass,
        matchedRegistration._id,
        divisionId
      );
      if (updatedPass) {
        dayPass = await formatPassResponse(updatedPass);
      }
    }

    res.json({
      matched: true,
      denied: false,
      scanType: effectiveScanType,
      matchScore,
      registration: populated,
      log,
      dayPass,
      sessionState,
      hasGateEntry,
      activeDepartment: sessionState?.currentDepartmentId
        ? {
            departmentId: sessionState.currentDepartmentId,
            departmentName: sessionState.currentDepartmentName,
          }
        : null,
      resolvedEventType,
      autoResolved: isAutoEvent,
      qrScan: true,
    });
  })
);

router.get(
  '/session/:registrationId',
  asyncHandler(async (req, res) => {
    const { divisionId } = req.query;
    if (!divisionId) return res.status(400).json({ error: 'divisionId is required' });

    const pass = await getActiveDayPass(req.params.registrationId, divisionId);
    const sessionState = getPassSessionState(pass);

    res.json({
      hasDayPass: Boolean(pass),
      sessionState,
    });
  })
);

router.post(
  '/scan',
  upload.single('photo'),
  asyncHandler(async (req, res) => {
    const {
      registrationId,
      eventType,
      gateId,
      departmentId,
      divisionId: bodyDivisionId,
      scanType = SCAN_TYPES.GATE,
    } = req.body;

    if (!req.file) return res.status(400).json({ error: 'Photo is required' });
    const isAutoEvent = eventType === GATE_EVENT_TYPES.AUTO;
    if (
      !isAutoEvent &&
      !Object.values(GATE_EVENT_TYPES).includes(eventType)
    ) {
      return res.status(400).json({ error: 'eventType must be "entry", "exit", or "auto"' });
    }
    if (!Object.values(SCAN_TYPES).includes(scanType)) {
      return res.status(400).json({ error: 'scanType must be "gate" or "department"' });
    }

    const logFields = { scanType, eventType };
    let divisionId = bodyDivisionId || null;
    let gateRecord = null;
    let department = null;

    if (scanType === SCAN_TYPES.GATE) {
      if (!gateId) return res.status(400).json({ error: 'gateId is required for gate scans' });
      if (departmentId) {
        return res.status(400).json({ error: 'Department is not used for division gate scans' });
      }

      gateRecord = await Gate.findById(gateId).populate('divisionId', 'name slug isActive');
      if (!gateRecord) return res.status(404).json({ error: 'Gate not found' });
      if (!gateRecord.isActive) return res.status(400).json({ error: 'Gate is inactive' });
      if (gateRecord.divisionId && !gateRecord.divisionId.isActive) {
        return res.status(400).json({ error: 'Division is inactive' });
      }
      if (gateRecord.gateType === GATE_TYPES.ENTRY && !isAutoEvent && eventType !== GATE_EVENT_TYPES.ENTRY) {
        return res.status(400).json({ error: 'This gate allows entry scans only' });
      }
      if (gateRecord.gateType === GATE_TYPES.EXIT && !isAutoEvent && eventType !== GATE_EVENT_TYPES.EXIT) {
        return res.status(400).json({ error: 'This gate allows exit scans only' });
      }
      if (isAutoEvent && gateRecord.gateType !== GATE_TYPES.BOTH) {
        return res.status(400).json({ error: 'Auto entry/exit is only available at combined entry & exit gates' });
      }

      divisionId = gateRecord.divisionId?._id || gateRecord.divisionId;
      logFields.gateRefId = gateRecord._id;
      logFields.divisionId = divisionId;
      logFields.gateId = gateRecord._id.toString();
    } else {
      if (!bodyDivisionId) {
        return res.status(400).json({ error: 'divisionId is required for department scans' });
      }
      if (!departmentId) {
        return res.status(400).json({ error: 'departmentId is required for department scans' });
      }
      if (gateId) return res.status(400).json({ error: 'Gate is not used for department scans' });

      department = await Department.findById(departmentId);
      if (!department) return res.status(404).json({ error: 'Department not found' });
      if (!department.isActive) return res.status(400).json({ error: 'Department is inactive' });

      const departmentDivisionIds = (department.divisionIds || []).map((id) => id.toString());
      if (!departmentDivisionIds.includes(bodyDivisionId.toString())) {
        return res.status(400).json({ error: 'Department does not belong to the selected division' });
      }

      divisionId = bodyDivisionId;
      logFields.divisionId = divisionId;
      logFields.departmentId = department._id;
      logFields.gateId = 'department';
    }

    if (req.user && !req.user.isSuperAdmin) {
      if (!hasDivisionScope(req.user, divisionId)) {
        return res.status(403).json({ error: 'You do not have access to this division' });
      }
      if (scanType === SCAN_TYPES.GATE && !hasGateScope(req.user, gateRecord._id)) {
        return res.status(403).json({ error: 'You do not have access to this gate' });
      }
      if (scanType === SCAN_TYPES.DEPARTMENT && !hasDepartmentScope(req.user, department._id)) {
        return res.status(403).json({ error: 'You do not have access to this department' });
      }
    }

    const identify = await identifyFromPhoto(req.file, registrationId || null);
    if (identify.error) {
      return res.status(identify.status || 400).json({ error: identify.error });
    }

    if (identify.ambiguous) {
      return res.json({
        matched: false,
        reason: 'ambiguous',
        scanType,
        matchScore: identify.matchScore,
        message: 'Could not identify this person uniquely. Please register or try again.',
        candidates: identify.candidates,
      });
    }

    const { matchedRegistration, matchScore, matched, autoIdentified, savedPhotoPath } = identify;

    const log = await GateLog.create({
      registrationId: matchedRegistration?._id || undefined,
      roleId: matchedRegistration?.roleId || undefined,
      matchScore,
      matched,
      photoPath: savedPhotoPath,
      ...logFields,
      metadata: {
        threshold: MATCH_THRESHOLD,
        minMargin: MIN_MATCH_MARGIN,
        autoIdentified,
        scanType,
      },
    });

    if (!matched) {
      const reason = registrationId ? 'face_mismatch' : 'not_found';
      const message = registrationId
        ? 'Face does not match the selected registration'
        : 'Person not found in the database. Please complete registration.';
      await markGateLogDenied(log, reason, message);

      return res.json({
        matched: false,
        reason,
        scanType,
        matchScore,
        message,
        registerUrl: '/registrations/register',
      });
    }

    const [populated, activePass] = await Promise.all([
      formatRegistrationForScan(matchedRegistration),
      getActiveDayPass(matchedRegistration._id, divisionId),
    ]);
    let dayPass = activePass ? await formatPassResponse(activePass) : null;
    let sessionState = getPassSessionState(activePass);

    let resolvedEventType = eventType;
    let personInside = null;

    if (scanType === SCAN_TYPES.GATE) {
      if (gateRecord.gateType === GATE_TYPES.BOTH) {
        personInside = await isPersonInsideTargetDivision(matchedRegistration._id, divisionId);

        if (isAutoEvent) {
          resolvedEventType = await resolveAutoGateEventType(matchedRegistration._id, divisionId);
        } else if (isOppositeGateEvent(personInside, eventType)) {
          const suggestedEventType = personInside
            ? GATE_EVENT_TYPES.EXIT
            : GATE_EVENT_TYPES.ENTRY;
          return respondScanDenial(res, {
              scanType,
              matchScore,
              registration: populated,
              log,
              error: personInside
                ? 'This person is already inside the division. They should exit at this entry & exit gate, not enter again.'
                : 'This person is not checked in at this division. They should enter at this entry & exit gate, not exit.',
              reason: personInside
                ? GATE_DENIAL_REASONS.ALREADY_IN_DIVISION
                : GATE_DENIAL_REASONS.NOT_CHECKED_IN,
              sessionState,
              dayPass,
              activeDivision: personInside
                ? { divisionId: divisionId?.toString(), divisionName: gateRecord?.divisionId?.name || 'Division' }
                : null,
              requiredSteps: getRequiredSteps(
                personInside
                  ? GATE_DENIAL_REASONS.ALREADY_IN_DIVISION
                  : GATE_DENIAL_REASONS.NOT_CHECKED_IN,
                { hasActiveDepartment: Boolean(sessionState?.currentDepartmentId) }
              ),
              securityReview: true,
              requestedEventType: eventType,
              suggestedEventType,
              personInside,
            });
        }
      } else if (isAutoEvent) {
        await markGateLogDenied(log, 'invalid_gate_config', 'Auto entry/exit is only available at combined entry & exit gates');
        return res.status(400).json({ error: 'Auto entry/exit is only available at combined entry & exit gates' });
      }

      const gateCheck = await validateGateScan(
        activePass,
        resolvedEventType,
        matchedRegistration._id,
        divisionId
      );
      if (!gateCheck.ok) {
        const denialDayPass = gateCheck.pass
          ? await formatPassResponse(gateCheck.pass)
          : dayPass;
        return respondScanDenial(res, {
            scanType,
            matchScore,
            registration: populated,
            log,
            error: gateCheck.error,
            reason: gateCheck.reason,
            sessionState: gateCheck.sessionState || sessionState,
            dayPass: denialDayPass,
            activeDepartment: gateCheck.activeDepartment,
            activeDivision: gateCheck.activeDivision,
            requiredSteps: gateCheck.requiredSteps,
          });
      }

      if (resolvedEventType === GATE_EVENT_TYPES.ENTRY) {
        const { registration, role, display } = await loadRegistrationContext(matchedRegistration._id);
        dayPass = await createOrRefreshDayPass({
          registration,
          role,
          display,
          gateLogId: log._id,
          divisionId,
          divisionName: gateRecord?.divisionId?.name || '',
        });
        sessionState = getPassSessionState(await getActiveDayPass(matchedRegistration._id, divisionId));
      } else if (activePass) {
        dayPass = await updateDayPassAfterGateExit(activePass);
        sessionState = getPassSessionState(await getActiveDayPass(matchedRegistration._id, divisionId));
      }

      if (resolvedEventType !== eventType) {
        log.eventType = resolvedEventType;
        await log.save();
      }
    } else {
      // Department face scan — support auto event type
      let resolvedDeptEventType = eventType;
      let deptAutoResolved = false;

      if (isAutoEvent) {
        resolvedDeptEventType = await resolveAutoDepartmentEventType(
          matchedRegistration._id, divisionId, department._id
        );
        deptAutoResolved = true;
        log.eventType = resolvedDeptEventType;
        await log.save();
      }

      const deptCheck = await validateDepartmentScan(
        activePass,
        department,
        resolvedDeptEventType,
        matchedRegistration._id,
        divisionId
      );
      if (!deptCheck.ok) {
        const denialDayPass = deptCheck.pass
          ? await formatPassResponse(deptCheck.pass)
          : dayPass;
        return respondScanDenial(res, {
            scanType,
            matchScore,
            registration: populated,
            log,
            error: deptCheck.error,
            reason: deptCheck.reason,
            hasGateEntry: deptCheck.hasGateEntry,
            activeDepartment: deptCheck.activeDepartment,
            activeDivision: deptCheck.activeDivision,
            sessionState: deptCheck.sessionState || sessionState,
            dayPass: denialDayPass,
            requiredSteps: deptCheck.requiredSteps,
          });
      }

      dayPass = await updateDayPassAfterDepartmentScan(
        activePass,
        department,
        resolvedDeptEventType,
        log.createdAt
      );
      resolvedEventType = resolvedDeptEventType;
      personInside = deptAutoResolved;
    }

    const hasGateEntry = await madeGateEntryToday(matchedRegistration._id, divisionId);
    await finalizeGateLog(log);

    if (scanType === SCAN_TYPES.DEPARTMENT) {
      const updatedPass = await getActiveDayPass(matchedRegistration._id, divisionId);
      sessionState = await syncDepartmentVisitsFromLogs(
        updatedPass,
        matchedRegistration._id,
        divisionId
      );
      if (updatedPass) {
        dayPass = await formatPassResponse(updatedPass);
      }
    }

    const photoUrl = savedPhotoPath
      ? savedPhotoPath.startsWith('http')
        ? savedPhotoPath
        : `/uploads/gate/${path.basename(savedPhotoPath)}`
      : null;

    res.json({
      matched: true,
      denied: false,
      scanType,
      matchScore,
      registration: populated,
      log,
      dayPass,
      sessionState,
      hasGateEntry,
      activeDepartment: sessionState?.currentDepartmentId
        ? {
            departmentId: sessionState.currentDepartmentId,
            departmentName: sessionState.currentDepartmentName,
          }
        : null,
      photoUrl,
      resolvedEventType,
      autoResolved: isAutoEvent,
    });
  })
);

export default router;
