/**
 * LOCAL DEVELOPMENT ENTRY
 *
 * server.ts owns the express app and starts the Vite middleware listener. This file adds
 * the live OSINT routes to that app, exactly as the Vercel entry (api/index.ts) does, so
 * local and production mount the same endpoints.
 */

import app from './server.ts';
import { installOsintRoutes } from './src/server/osintRoutes.ts';

installOsintRoutes(app);
