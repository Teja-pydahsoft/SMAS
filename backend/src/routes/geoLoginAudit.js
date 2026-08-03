import express from 'express';
import asyncHandler from 'express-async-handler';
import GeoLoginAuditLog from '../models/GeoLoginAuditLog.js';
import { requirePermission } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/geo-login-audit
 * 
 * Fetches a paginated, filtered list of geo login audit logs.
 * Required Permission: geo_login_activity
 */
router.get(
  '/',
  requirePermission('geo_login_activity', 'read'),
  asyncHandler(async (req, res) => {
    const {
      page = 1,
      limit = 50,
      username,
      role,
      decision,
      locationName,
      startDate,
      endDate
    } = req.query;

    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (safePage - 1) * safeLimit;

    // We assume organizationId is 'default' for now as per the rest of the app
    const filter = { organizationId: 'default' };

    if (username) {
      filter.$or = [
        { userUsername: { $regex: username, $options: 'i' } },
        { userDisplayName: { $regex: username, $options: 'i' } }
      ];
    }

    if (role) {
      filter.role = { $regex: role, $options: 'i' };
    }

    if (decision) {
      filter.decision = decision;
    }

    if (locationName) {
      filter.matchedLocationName = { $regex: locationName, $options: 'i' };
    }

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const [logs, total] = await Promise.all([
      GeoLoginAuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean(),
      GeoLoginAuditLog.countDocuments(filter),
    ]);

    // Aggregate summary stats for today
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const todayFilter = { organizationId: 'default', createdAt: { $gte: startOfToday } };
    
    // We can do an aggregation to get all stats at once
    const stats = await GeoLoginAuditLog.aggregate([
      { $match: todayFilter },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          successful: {
            $sum: { $cond: [{ $eq: ["$decision", "allowed"] }, 1, { $cond: [{ $eq: ["$decision", "granted"] }, 1, 0] }] }
          },
          denied: {
            $sum: { $cond: [{ $eq: ["$decision", "denied"] }, 1, 0] }
          },
          outsideRadius: {
            $sum: { $cond: [{ $eq: ["$reason", "outside_all_locations"] }, 1, 0] }
          },
          permissionDenied: {
            $sum: { $cond: [{ $eq: ["$reason", "browser_permission_denied"] }, 1, 0] }
          },
          bypassed: {
            $sum: { $cond: [{ $eq: ["$decision", "bypassed"] }, 1, 0] }
          }
        }
      }
    ]);

    const summary = stats[0] || {
      total: 0,
      successful: 0,
      denied: 0,
      outsideRadius: 0,
      permissionDenied: 0,
      bypassed: 0
    };

    res.json({
      logs,
      summary,
      pagination: {
        total,
        page: safePage,
        limit: safeLimit,
        pages: Math.ceil(total / safeLimit),
      }
    });
  })
);

export default router;
