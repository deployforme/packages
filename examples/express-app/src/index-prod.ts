import express from 'express';
import type { Request, Response } from 'express';
import { Kernel, createRuntimeContext } from '@hivelet/core';
import { ExpressAdapter } from '@hivelet/adapter-express';
import * as path from 'node:path';

const app = express();
app.use(express.json());

const modulesPath = path.join(__dirname, 'modules');

const adapter = new ExpressAdapter(app);
const kernel = new Kernel(createRuntimeContext(adapter));

kernel
  .load(path.join(modulesPath, 'user.module.js'))
  .then(() => console.log('User module loaded from production build'))
  .catch(console.error);

app.post('/admin/load', async (req: Request, res: Response) => {
  try {
    const modulePath = String(req.body?.path ?? '');
    await kernel.load(modulePath);
    res.json({ success: true, message: `Module loaded from ${modulePath}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: message });
  }
});

app.post('/admin/reload/:module', async (req: Request, res: Response) => {
  try {
    const modulePath = path.join(modulesPath, `${req.params.module}.module.js`);
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
