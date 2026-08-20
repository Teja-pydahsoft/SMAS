import 'dotenv/config';
import express from 'express';
import compression from 'compression';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB } from './config/db.js';
import { ensureUploadDirs, uploadDir } from './utils/storage.js';
import { isS3Enabled, getS3Object } from './services/s3StorageService.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { checkAiServerHealth, getFaceIndexStats, waitForAiServer } from './services/aiClient.js';
import { rebuildFaceIndexFromDb } from './services/faceIndexService.js';
import { migrateDepartmentsToMultiDivision } from './services/departmentMigration.js';
import { migrateLegacyRegistrationCodes } from './services/registrationCodeMigration.js';
import { migrateActivityPermissionsFromGate } from './services/activityPermissionMigration.js';
import { ensureSuperAdmin } from './services/superAdminService.js';
import { authenticateUnlessPublic } from './middleware/auth.js';

import rolesRouter from './routes/roles.js';
import formsRouter from './routes/forms.js';
import registrationsRouter from './routes/registrations.js';
import gateRouter from './routes/gate.js';
import passesRouter from './routes/passes.js';
import divisionsRouter from './routes/divisions.js';
import facilityGatesRouter from './routes/gates.js';
import departmentsRouter from './routes/departments.js';
import authRouter from './routes/auth.js';
import systemRolesRouter from './routes/systemRoles.js';
import systemUsersRouter from './routes/systemUsers.js';
import geoLoginAuditRouter from './routes/geoLoginAudit.js';
import reportsRouter from './routes/reports.js';
import shiftsRouter from './routes/shifts.js';
import projectsRouter from './routes/projects.js';
import projectReportsRouter from './routes/projectReports.js';
import dashboardRouter from './routes/dashboard.js';
import pushRouter from './routes/push.js';
import devicesRouter from './routes/devices.js';
import geoLocationsRouter from './routes/geoLocations.js';
import { startOverstayMonitor } from './services/overstayMonitor.js';
import { startIdleMonitor } from './services/idleMonitor.js';
import { migrateProjectsPermissionsFromDepartments, migrateProjectSubpagePermissions } from './services/projectPermissionMigration.js';
import vehicleTypesRouter from './routes/vehicleTypes.js';
import vehicleCategoriesRouter from './routes/vehicleCategories.js';
import vehiclesRouter from './routes/vehicles.js';
import { seedVehicleTypes } from './services/vehicleTypeSeeder.js';
import { seedDriverRole } from './services/driverRoleSeeder.js';
import vehicleRegistrationFormsRouter from './routes/vehicleRegistrationForms.js';
import vehicleRegistrationsRouter from './routes/vehicleRegistrations.js';
import equipmentMovementsRouter from './routes/equipmentMovements.js';
import idleMonitoringRouter from './routes/idleMonitoring.js';
import payrollRouter from './routes/payroll.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

ensureUploadDirs();

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  })
);

// Serve photos BEFORE compression. Gzip + Content-Length on proxied S3 bodies
// can stall browser sockets; hung photo requests then block gate/department scans
// (browser connection limit) so the UI stays on "Processing...".
app.use('/uploads/s3', async (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (!isS3Enabled()) {
    return res.status(404).json({ error: 'S3 storage is not configured' });
  }
  const key = decodeURIComponent((req.path || '').replace(/^\/+/, ''));
  if (!key || key.includes('..')) {
    return res.status(400).json({ error: 'Invalid object key' });
  }
  try {
    const obj = await getS3Object(key);
    if (obj.ContentType) res.setHeader('Content-Type', obj.ContentType);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    if (req.method === 'HEAD') {
      if (obj.ContentLength != null) res.setHeader('Content-Length', String(obj.ContentLength));
      return res.end();
    }
    // Buffer the object — more reliable than piping through Express middleware.
    if (typeof obj.Body?.transformToByteArray === 'function') {
      const bytes = await obj.Body.transformToByteArray();
      const buffer = Buffer.from(bytes);
      res.setHeader('Content-Length', String(buffer.length));
      return res.send(buffer);
    }
    if (obj.Body?.pipe) {
      return obj.Body.pipe(res);
    }
    return res.status(500).json({ error: 'Unable to read S3 object body' });
  } catch (err) {
    console.error('S3 proxy failed:', err.message);
    if (!res.headersSent) {
      return res.status(404).json({ error: 'File not found' });
    }
  }
});

app.use('/uploads', express.static(uploadDir, { maxAge: '7d', immutable: false }));

// Gzip JSON responses — report/attendance payloads shrink ~10x, which matters
// a lot on the free-tier network. Small responses (<1KB) are left untouched.
app.use(
  compression({
    threshold: 1024,
    filter(req, res) {
      const url = req.originalUrl || req.url || '';
      if (url.startsWith('/uploads/s3') || url.startsWith('/uploads/')) return false;
      return compression.filter(req, res);
    },
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Instant wake-up probe for login — no DB or AI calls (used before auth on cold hosts).
app.get('/api/ping', (req, res) => {
  res.json({ ok: true });
});

// AI status is cached so repeated health checks never hammer (or block on)
// the AI server. A stale answer is fine here — the gate scan endpoints talk
// to the AI server directly anyway.
const AI_HEALTH_CACHE_MS = 60 * 1000;
let aiHealthCache = { at: 0, aiOnline: false, faceIndex: null };
let aiHealthRefreshing = null;

async function refreshAiHealth() {
  const aiOnline = await checkAiServerHealth();
  let faceIndex = null;
  if (aiOnline) {
    try {
      faceIndex = await getFaceIndexStats();
    } catch {
      faceIndex = null;
    }
  }
  aiHealthCache = { at: Date.now(), aiOnline, faceIndex };
  return aiHealthCache;
}

app.get('/api/health', async (req, res) => {
  const isFresh = Date.now() - aiHealthCache.at < AI_HEALTH_CACHE_MS;
  if (!isFresh) {
    if (!aiHealthRefreshing) {
      aiHealthRefreshing = refreshAiHealth().finally(() => {
        aiHealthRefreshing = null;
      });
    }
    // First-ever check has no cache to serve — wait for it once.
    if (aiHealthCache.at === 0) {
      try {
        await aiHealthRefreshing;
      } catch {
        // fall through with defaults
      }
    }
  }
  res.json({
    status: 'ok',
    services: { ai: aiHealthCache.aiOnline ? 'online' : 'offline' },
    faceIndex: aiHealthCache.faceIndex,
  });
});

app.use('/api/auth', authRouter);

app.use(authenticateUnlessPublic);

app.use('/api/roles', rolesRouter);
app.use('/api/forms', formsRouter);
app.use('/api/registrations', registrationsRouter);
app.use('/api/gate', gateRouter);
app.use('/api/passes', passesRouter);
app.use('/api/divisions', divisionsRouter);
app.use('/api/gates', facilityGatesRouter);
app.use('/api/departments', departmentsRouter);
app.use('/api/system-roles', systemRolesRouter);
app.use('/api/system-users', systemUsersRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/shifts', shiftsRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/project-reports', projectReportsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/push', pushRouter);
app.use('/api/devices', devicesRouter);
app.use('/api/geo-locations', geoLocationsRouter);
app.use('/api/geo-login-audit', geoLoginAuditRouter);
app.use('/api/vehicles/types', vehicleTypesRouter);
app.use('/api/vehicles/categories', vehicleCategoriesRouter);
app.use('/api/vehicles/forms', vehicleRegistrationFormsRouter);
app.use('/api/vehicles/registrations', vehicleRegistrationsRouter);
app.use('/api/vehicles', vehiclesRouter);
app.use('/api/equipment/movements', equipmentMovementsRouter);
app.use('/api/equipment/idle-monitoring', idleMonitoringRouter);
app.use('/api/payroll', payrollRouter);

app.use(notFound);
app.use(errorHandler);

/**
 * One-off bootstrap work that must NOT block the HTTP port from opening.
 * Render restarts instances that don't bind the port quickly, and the AI
 * wait loop alone can take 30s+ when the Hugging Face space is cold.
 */
async function runBackgroundBootstrap() {
  try {
    const migration = await migrateDepartmentsToMultiDivision();
    if (migration.migrated > 0) {
      console.log(`Migrated ${migration.migrated} department(s) to multi-division linking`);
    }
  } catch (err) {
    console.warn('Department migration skipped:', err.message);
  }

  try {
    const codeMigration = await migrateLegacyRegistrationCodes();
    if (codeMigration.upgraded > 0) {
      console.log(
        `Upgraded ${codeMigration.upgraded} registration code(s) from Labour Type (DM0001…)`
      );
    }
    if (codeMigration.skipped > 0) {
      console.warn(
        `Skipped ${codeMigration.skipped} registration(s) — set Labour Type (e.g. Daily Male), then restart to upgrade`
      );
    }
  } catch (err) {
    console.warn('Registration code migration skipped:', err.message);
  }

  try {
    const activityPermMigration = await migrateActivityPermissionsFromGate();
    if (activityPermMigration.migrated > 0) {
      console.log(
        `Granted Activity permission on ${activityPermMigration.migrated} role(s) that already had Gate access`
      );
    }
  } catch (err) {
    console.warn('Activity permission migration skipped:', err.message);
  }

  try {
    const projectsPermMigration = await migrateProjectsPermissionsFromDepartments();
    if (projectsPermMigration.migrated > 0) {
      console.log(
        `Granted Project Management permission on ${projectsPermMigration.migrated} role(s) that already had Department access`
      );
    }
  } catch (err) {
    console.warn('Project permission migration skipped:', err.message);
  }

  try {
    const projectSubpageMigration = await migrateProjectSubpagePermissions();
    if (projectSubpageMigration.migrated > 0) {
      console.log(
        `Copied Project Management access onto ${projectSubpageMigration.migrated} role(s) for Maintenance, Photo Capture, and Reports`
      );
    }
  } catch (err) {
    console.warn('Project subpage permission migration skipped:', err.message);
  }

  try {
    await ensureSuperAdmin();
  } catch (err) {
    console.warn('Super admin setup failed:', err.message);
  }

  try {
    await seedVehicleTypes();
  } catch (err) {
    console.warn('Vehicle type seeding failed:', err.message);
  }

  try {
    await seedDriverRole();
  } catch (err) {
    console.warn('Driver role seeding failed:', err.message);
  }

  const aiReady = await waitForAiServer();
  if (!aiReady) {
    console.warn('AI server not reachable — face index sync deferred until AI is online');
  } else {
    try {
      const indexResult = await rebuildFaceIndexFromDb();
      console.log(
        `Face index synced: ${indexResult.indexed} users indexed` +
          (indexResult.skipped
            ? ` (${indexResult.skipped} skipped — re-upload photo for InsightFace 512-d)`
            : '') +
          (indexResult.totalVerified === 0 ? ' (no verified users yet)' : '')
      );
    } catch (err) {
      console.warn('Face index sync failed:', err.message);
    }
  }

  startOverstayMonitor();
  startIdleMonitor();
}

async function start() {
  await connectDB();

  app.listen(PORT, HOST, () => {
    console.log(`SAMS Backend running on http://${HOST}:${PORT}`);
  });

  runBackgroundBootstrap().catch((err) => {
    console.warn('Background bootstrap failed:', err.message);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
