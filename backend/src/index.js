import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB } from './config/db.js';
import { ensureUploadDirs, uploadDir } from './utils/storage.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { checkAiServerHealth, getFaceIndexStats, waitForAiServer } from './services/aiClient.js';
import { rebuildFaceIndexFromDb } from './services/faceIndexService.js';
import { migrateDepartmentsToMultiDivision } from './services/departmentMigration.js';
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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(uploadDir));

app.get('/api/health', async (req, res) => {
  const aiOnline = await checkAiServerHealth();
  let faceIndex = null;
  if (aiOnline) {
    try {
      faceIndex = await getFaceIndexStats();
    } catch {
      faceIndex = null;
    }
  }
  res.json({
    status: 'ok',
    services: { ai: aiOnline ? 'online' : 'offline' },
    faceIndex,
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

app.use(notFound);
app.use(errorHandler);

async function start() {
  await connectDB();

  try {
    const migration = await migrateDepartmentsToMultiDivision();
    if (migration.migrated > 0) {
      console.log(`Migrated ${migration.migrated} department(s) to multi-division linking`);
    }
  } catch (err) {
    console.warn('Department migration skipped:', err.message);
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

  app.listen(PORT, HOST, () => {
    console.log(`SMAS Backend running on http://${HOST}:${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
