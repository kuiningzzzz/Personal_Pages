import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cardDb, DATA_DIR } from '../db.js';
import { createDocker } from './docker.js';
import { createActivityService } from './service.js';
import { createActivityRoutes } from './routes.js';
import { auditAndCleanupUploads } from '../upload-cleanup.js';

export const activities = createActivityService({ db: cardDb, root: join(DATA_DIR, 'activities'), docker: createDocker({}), onRemoved: auditAndCleanupUploads });
export const activityRoutes = createActivityRoutes({ service: activities, secret: process.env.SESSION_SECRET || randomBytes(32).toString('hex'), sdkPath: fileURLToPath(new URL('./sdk.js', import.meta.url)), cleanup: auditAndCleanupUploads });
