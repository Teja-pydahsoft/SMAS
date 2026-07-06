import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import Registration from '../models/Registration.js';
import GateLog from '../models/GateLog.js';
import Gate from '../models/Gate.js';
import Department from '../models/Department.js';
import Pass from '../models/Pass.js';
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
  madeGateEntryToday,
  isPersonInsideTargetDivision,
  resolveAutoGateEventType,
  isOppositeGateEvent,
  GATE_DENIAL_REASONS,
} from '../services/attendanceService.js';
import { getRequiredSteps } from '../constants/accessRules.js';
import { rebuildFaceIndexFromDb } from '../services/faceIndexService.js';
import { uploadDir } from '../utils/storage.js';
import { hasDivisionScope, hasDepartmentScope, hasGateScope } from '../middleware/auth.js';

const router = Router();
const MATCH_THRESHOLD = parseFloat(process.env.FACE_MATCH_THRESHOLD || '0.42');
const MIN_MATCH_MARGIN = parseFloat(process.env.MIN_MATCH_MARGIN || '0.05');
const SEARCH_TOP_K = parseInt(process.env.SEARCH_TOP_K || '5', 10);
const EMBEDDING_SIZE = parseInt(process.env.FACE_EMBEDDING_SIZE || '512', 10);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(uploadDir, 'gate');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `gate-${Date.now()}${path.extname(file.originalname) || '.jpg'}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

router.get(
  '/logs',
  asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.registrationId) filter.registrationId = req.query.registrationId;
    if (req.query.eventType) filter.eventType = req.query.eventType;
    if (req.query.divisionId) filter.divisionId = req.query.divisionId;
    if (req.query.departmentId) filter.departmentId = req.query.departmentId;
    if (req.query.gateRefId) filter.gateRefId = req.query.gateRefId;
    if (req.query.scanType) filter.scanType = req.query.scanType;

    const logs = await GateLog.find(filter)
      .populate('registrationId', 'registrationCode formData')
      .populate('roleId', 'name slug')
      .populate('divisionId', 'name slug')
      .populate('departmentId', 'name slug')
      .populate('gateRefId', 'name gateType slug')
      .sort({ createdAt: -1 })
      .limit(parseInt(req.query.limit || '100', 10));

    res.json(logs);
  })
);

router.get(
  '/status/:registrationId',
  asyncHandler(async (req, res) => {
    const lastEntry = await GateLog.findOne({
      registrationId: req.params.registrationId,
      eventType: GATE_EVENT_TYPES.ENTRY,
      matched: true,
    }).sort({ createdAt: -1 });

    const lastExit = await GateLog.findOne({
      registrationId: req.params.registrationId,
      eventType: GATE_EVENT_TYPES.EXIT,
      matched: true,
    }).sort({ createdAt: -1 });

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

async function formatRegistrationForScan(registrationDoc) {
  const registration = await Registration.findById(registrationDoc._id)
    .populate('roleId', 'name slug')
    .populate('formId', 'fields');
  if (!registration) return null;
  const obj = registration.toObject();
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

async function identifyFromPhoto(filePath, registrationId) {
  const imageBuffer = fs.readFileSync(filePath);
  const { embedding, face_detected } = await extractFaceEmbedding(
    imageBuffer,
    path.basename(filePath),
    'image/jpeg'
  );

  if (!face_detected || !embedding?.length) {
    fs.unlinkSync(filePath);
    return { error: 'No face detected in the photo' };
  }

  let matchedRegistration = null;
  let matchScore = 0;

  if (registrationId) {
    matchedRegistration = await Registration.findById(registrationId);
    if (!matchedRegistration) {
      fs.unlinkSync(filePath);
      return { error: 'Registration not found', status: 404 };
    }
    if (matchedRegistration.status !== REGISTRATION_STATUS.VERIFIED) {
      fs.unlinkSync(filePath);
      return { error: 'Registration is not verified', status: 400 };
    }
    if (matchedRegistration.faceEmbedding?.length !== EMBEDDING_SIZE) {
      fs.unlinkSync(filePath);
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
      };
    }

    if (searchResult.best?.id) {
      matchedRegistration = await Registration.findById(searchResult.best.id);
      matchScore = searchResult.best.similarity;
    }
  }

  const matched = matchScore >= MATCH_THRESHOLD && !!matchedRegistration;
  return { matchedRegistration, matchScore, matched, autoIdentified: !registrationId };
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
      scanType = SCAN_TYPES.QR,
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
    const logFields = { scanType };
    let divisionId = bodyDivisionId || null;
    let gateRecord = null;
    let department = null;
    const effectiveScanType = departmentId ? SCAN_TYPES.DEPARTMENT : SCAN_TYPES.GATE;

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

    const populated = await formatRegistrationForScan(matchedRegistration);
    const activePass = await getActiveDayPass(matchedRegistration._id, divisionId);
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
          return res.status(400).json(
            buildScanDenialResponse({
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
            })
          );
        }
      } else if (isAutoEvent) {
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
        return res.status(400).json(
          buildScanDenialResponse({
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
          })
        );
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
      // Department QR scan
      const deptCheck = await validateDepartmentScan(
        activePass,
        department,
        eventType,
        matchedRegistration._id,
        divisionId
      );
      if (!deptCheck.ok) {
        const denialDayPass = deptCheck.pass
          ? await formatPassResponse(deptCheck.pass)
          : dayPass;
        return res.status(400).json(
          buildScanDenialResponse({
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
          })
        );
      }

      dayPass = await updateDayPassAfterDepartmentScan(activePass, department, eventType);
      sessionState = getPassSessionState(await getActiveDayPass(matchedRegistration._id, divisionId));
    }

    const hasGateEntry = await madeGateEntryToday(matchedRegistration._id, divisionId);

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
      resolvedEventType: effectiveScanType === SCAN_TYPES.GATE ? resolvedEventType : eventType,
      autoResolved: isAutoEvent && effectiveScanType === SCAN_TYPES.GATE,
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

    const identify = await identifyFromPhoto(req.file.path, registrationId || null);
    if (identify.error) {
      return res.status(identify.status || 400).json({ error: identify.error });
    }

    if (identify.ambiguous) {
      const log = await GateLog.create({
        matchScore: identify.matchScore,
        matched: false,
        photoPath: req.file.path,
        ...logFields,
        metadata: {
          threshold: MATCH_THRESHOLD,
          minMargin: MIN_MATCH_MARGIN,
          autoIdentified: true,
          reason: 'ambiguous',
          candidates: identify.candidates,
          scanType,
        },
      });

      return res.json({
        matched: false,
        reason: 'ambiguous',
        scanType,
        matchScore: identify.matchScore,
        message: 'Could not identify this person uniquely. Please register or try again.',
        candidates: identify.candidates,
        log,
      });
    }

    const { matchedRegistration, matchScore, matched, autoIdentified } = identify;

    const log = await GateLog.create({
      registrationId: matchedRegistration?._id || undefined,
      roleId: matchedRegistration?.roleId || undefined,
      matchScore,
      matched,
      photoPath: req.file.path,
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

      return res.json({
        matched: false,
        reason,
        scanType,
        matchScore,
        message,
        registerUrl: '/registrations/register',
        log,
      });
    }

    const populated = await formatRegistrationForScan(matchedRegistration);
    const activePass = await getActiveDayPass(matchedRegistration._id, divisionId);
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
          return res.status(400).json(
            buildScanDenialResponse({
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
            })
          );
        }
      } else if (isAutoEvent) {
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
        return res.status(400).json(
          buildScanDenialResponse({
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
          })
        );
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
      const deptCheck = await validateDepartmentScan(
        activePass,
        department,
        eventType,
        matchedRegistration._id,
        divisionId
      );
      if (!deptCheck.ok) {
        const denialDayPass = deptCheck.pass
          ? await formatPassResponse(deptCheck.pass)
          : dayPass;
        return res.status(400).json(
          buildScanDenialResponse({
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
          })
        );
      }

      dayPass = await updateDayPassAfterDepartmentScan(activePass, department, eventType);
      sessionState = getPassSessionState(await getActiveDayPass(matchedRegistration._id, divisionId));
    }

    const hasGateEntry = await madeGateEntryToday(matchedRegistration._id, divisionId);

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
      photoUrl: `/uploads/gate/${path.basename(req.file.path)}`,
      resolvedEventType: scanType === SCAN_TYPES.GATE ? resolvedEventType : eventType,
      autoResolved: isAutoEvent && scanType === SCAN_TYPES.GATE,
    });
  })
);

export default router;
