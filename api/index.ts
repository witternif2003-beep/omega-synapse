import app from '../server.ts';
import { installOsintRoutes } from '../src/server/osintRoutes.ts';

installOsintRoutes(app);

export default app;
