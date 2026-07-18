import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  getVapidPublicKey,
  isPushConfigured,
  saveSubscription,
  removeSubscription,
} from '../services/pushService.js';

const router = Router();

router.get(
  '/public-key',
  asyncHandler(async (req, res) => {
    res.json({ enabled: isPushConfigured(), publicKey: getVapidPublicKey() });
  })
);

router.post(
  '/subscribe',
  asyncHandler(async (req, res) => {
    if (!isPushConfigured()) {
      return res.status(503).json({ error: 'Push notifications are not configured on the server' });
    }
    const subscription = req.body?.subscription || req.body;
    await saveSubscription(req.user._id, subscription, req.headers['user-agent'] || '');
    res.json({ ok: true });
  })
);

router.post(
  '/unsubscribe',
  asyncHandler(async (req, res) => {
    await removeSubscription(req.body?.endpoint);
    res.json({ ok: true });
  })
);

export default router;
