import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  createRegistrationPass,
  createDayPass,
  getRegistrationPass,
  getOrCreateRegistrationPass,
  syncAllRegistrationPasses,
  getDayPassByGateLog,
  getPassByCode,
  formatPassResponse,
} from '../services/passService.js';
import Pass from '../models/Pass.js';
import { PASS_TYPES } from '../constants/index.js';

const router = Router();

router.get(
  '/verify/:passCode',
  asyncHandler(async (req, res) => {
    const pass = await getPassByCode(req.params.passCode);
    if (!pass) return res.status(404).json({ error: 'Pass not found or inactive' });

    const now = new Date();
    const expired = pass.validUntil && new Date(pass.validUntil) < now;

    res.json({
      valid: !expired,
      expired,
      pass,
    });
  })
);

router.get(
  '/registration/:registrationId',
  asyncHandler(async (req, res) => {
    const pass = await getOrCreateRegistrationPass(req.params.registrationId);
    res.json(pass);
  })
);

router.post(
  '/registration/sync-all',
  asyncHandler(async (req, res) => {
    const summary = await syncAllRegistrationPasses();
    res.json(summary);
  })
);

router.post(
  '/registration/:registrationId',
  asyncHandler(async (req, res) => {
    const pass = await createRegistrationPass(req.params.registrationId);
    res.status(201).json(pass);
  })
);

router.get(
  '/day/gate-log/:gateLogId',
  asyncHandler(async (req, res) => {
    const pass = await getDayPassByGateLog(req.params.gateLogId);
    if (!pass) return res.status(404).json({ error: 'Day pass not found' });
    res.json(pass);
  })
);

router.get(
  '/registration/:registrationId/list',
  asyncHandler(async (req, res) => {
    const passes = await Pass.find({ registrationId: req.params.registrationId })
      .sort({ createdAt: -1 })
      .limit(50);
    const formatted = await Promise.all(passes.map((p) => formatPassResponse(p)));
    res.json(formatted);
  })
);

export default router;
