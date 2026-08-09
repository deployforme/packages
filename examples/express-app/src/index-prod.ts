import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { Kernel, createRuntimeContext } from '@hivelet/core';
import { ExpressAdapter } from '@hivelet/adapter-express';
import * as path from 'node:path';
import { timingSafeEqual } from 'node:crypto';

const app = express();
app.use(express.json());

const modulesPath = path.join(__dirname, 'modules');
const adminKey = process.env.HIVELET_ADMIN_KEY;
if (!adminKey) {
  throw new Error('HIVELET_ADMIN_KEY is required for production lifecycle endpoints');
}

const adapter = new ExpressAdapter(app);
const kernel = new Kernel(createRuntimeContext(adapter));

kernel
  .load(path.join(modulesPath, 'user.module.js'))
  .then(() => console.log('User module loaded from production build'))
  .catch(console.error);

app.use('/admin', (req: Request, res: Response, next: NextFunction) => {
  const provided = req.header('x-hivelet-admin-key') ?? '';
  const expectedBuffer = Buffer.from(adminKey);
  const providedBuffer = Buffer.from(provided);
  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
});

app.post('/admin/load', async (req: Request, res: Response) => {
  try {
    const modulePath = resolveModulePath(String(req.body?.module ?? ''));
    await kernel.load(modulePath);
    res.json({ success: true, message: `Module loaded from ${modulePath}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: message });
  }
});

app.post('/admin/reload/:module', async (req: Request, res: Response) => {
  try {
    const modulePath = resolveModulePath(req.params.module);
    await kernel.reload(modulePath);
    res.json({ success: true, message: `Module ${req.params.module} reloaded` });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: message });
  }
});

app.get('/admin/modules', (_req: Request, res: Response) => {
  const modules = kernel.list().map(m => ({
    name: m.module.name,
    version: m.module.version,
    routes: m.registeredRoutes.length,
    loadedAt: m.loadedAt
  }));
  res.json(modules);
});

app.listen(3000, () => {
  console.log('Express app running on http://localhost:3000 (PRODUCTION BUILD)');
  console.log('Admin: http://localhost:3000/admin/modules');
  console.log('Modules path:', modulesPath);
});

function resolveModulePath(moduleName: string): string {
  if (!/^[a-z0-9_-]+$/.test(moduleName)) {
    throw new TypeError('Invalid module name');
  }
  return path.join(modulesPath, `${moduleName}.module.js`);
}
