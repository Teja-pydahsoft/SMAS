import 'dotenv/config';
import express from 'express';
import compression from 'compression';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB } from './config/db.js';
import { ensureUploadDirs, uploadDir } from './utils/storage.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { checkAiServerHealth, getFaceIndexStats, waitForAiServer } from './services/aiClient.js';
import { rebuildFaceIndexFromDb } from './services/faceIndexService.js';
import { migrateDepartmentsToMultiDivision } from './services/departmentMigration.js';
import { migrateLegacyRegistrationCodes } from './services/registrationCodeMigration.js';
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
import reportsRouter from './routes/reports.js';
import shiftsRouter from './routes/shifts.js';
import dashboardRouter from './routes/dashboard.js';
import pushRouter from './routes/push.js';
import { startOverstayMonitor } from './services/overstayMonitor.js';

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
// Gzip JSON responses — report/attendance payloads shrink ~10x, which matters
// a lot on the free-tier network. Small responses (<1KB) are left untouched.
app.use(compression({ threshold: 1024 }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(uploadDir, { maxAge: '7d', immutable: false }));

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
app.use('/api/dashboard', dashboardRouter);
app.use('/api/push', pushRouter);

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
        `Upgraded ${codeMigration.upgraded} registration code(s) to pay/gender format (DM0001…)`
      );
    }
    if (codeMigration.skipped > 0) {
      console.warn(
        `Skipped ${codeMigration.skipped} registration(s) — set pay frequency + gender, then restart to upgrade`
      );
    }
  } catch (err) {
    console.warn('Registration code migration skipped:', err.message);
  }

  try {
    await ensureSuperAdmin();
  } catch (err) {
    console.warn('Super admin setup failed:', err.message);
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
